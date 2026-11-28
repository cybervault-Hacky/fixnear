"""Transactional, owner-scoped booking, assignment, and PriceLock operations."""

import hashlib
import json
import re
import unicodedata
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.models import (
    Appliance,
    AppUser,
    Booking,
    BookingAttachment,
    BookingEvent,
    BookingLocationAccessEvent,
    BookingQuote,
    BookingQuoteLineItem,
    BookingVisit,
    CustomerAddress,
    CustomerProfile,
    MutationIdempotency,
    Service,
    ServiceCategory,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    UserRole,
)
from app.schemas.booking_management import (
    BookingAssignmentDecisionRequest,
    BookingAssignmentRequest,
    BookingCancelRequest,
    BookingCreateRequest,
    BookingEscalationRequest,
    BookingQuoteCreateRequest,
    BookingTransitionRequest,
    BookingVisitUpdateRequest,
    CustomerAddressInput,
    CustomerAddressUpdateRequest,
    QuoteDecisionRequest,
)
from app.services.booking_storage import BookingAttachmentStorage
from app.services.homepassport import create_service_history_for_booking
from app.services.notifications import create_booking_event_notifications

MAX_QUOTE_TOTAL_PAISE = 1_000_000_000_000
CUSTOMER_CANCELLABLE = {
    "requested",
    "assigned",
    "accepted",
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
}
QUOTE_EDITABLE_STATES = {
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
}
TECHNICIAN_LOCATION_STATUSES = {
    "accepted",
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
    "in_progress",
}


def _error(
    code: str, message: str, status_code: int = status.HTTP_409_CONFLICT
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _not_found() -> HTTPException:
    return _error(
        "not_found", "The requested record was not found.", status.HTTP_404_NOT_FOUND
    )


def _utc(value: datetime) -> datetime:
    """SQLite drops timezone metadata; treat stored quote timestamps as UTC."""

    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip()).casefold()


def _roles(actor: AppUser) -> set[str]:
    return {assignment.role_code for assignment in actor.roles}


def _record_location_access(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID | None = None,
    address_id: UUID | None = None,
    actor_role: Literal["customer", "technician", "admin"] | None = None,
    has_coordinates: bool = False,
) -> None:
    roles = _roles(actor)
    actor_role = actor_role or next(
        (role for role in ("admin", "technician", "customer") if role in roles), None
    )
    if actor_role is None:
        raise _error(
            "forbidden",
            "A customer, assigned technician, or admin role is required.",
            status.HTTP_403_FORBIDDEN,
        )
    fields_accessed = ["address"]
    if has_coordinates:
        fields_accessed.append("coordinates")
    session.add(
        BookingLocationAccessEvent(
            booking_id=booking_id,
            address_id=address_id,
            actor_user_id=actor.id,
            actor_role=actor_role,
            fields_accessed=fields_accessed,
        )
    )


def _fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def execute_idempotent(
    session: Session,
    *,
    actor: AppUser,
    operation: str,
    key: UUID,
    payload: dict[str, Any],
    resource_type: str,
    mutation: Callable[[], UUID],
) -> UUID:
    """Commit a mutation and its request fingerprint atomically; safe to retry by key."""

    payload_hash = _fingerprint(payload)
    actor_id = actor.id

    def existing_record() -> MutationIdempotency | None:
        return session.scalar(
            select(MutationIdempotency).where(
                MutationIdempotency.actor_user_id == actor_id,
                MutationIdempotency.operation == operation,
                MutationIdempotency.key == key,
            )
        )

    def replay_or_conflict(record: MutationIdempotency) -> UUID:
        if record.request_hash != payload_hash or record.resource_type != resource_type:
            raise _error(
                "idempotency_key_reused",
                "This idempotency key was already used for a different request.",
            )
        return record.resource_id

    record = existing_record()
    if record is not None:
        return replay_or_conflict(record)

    try:
        resource_id = mutation()
        session.flush()
        session.add(
            MutationIdempotency(
                actor_user_id=actor_id,
                operation=operation,
                key=key,
                request_hash=payload_hash,
                resource_type=resource_type,
                resource_id=resource_id,
            )
        )
        session.flush()
        session.commit()
        return resource_id
    except HTTPException:
        session.rollback()
        record = existing_record()
        if record is not None:
            return replay_or_conflict(record)
        raise
    except StaleDataError:
        session.rollback()
        record = existing_record()
        if record is not None:
            return replay_or_conflict(record)
        raise _error(
            "concurrent_booking_change",
            "This booking changed in another request. Refresh it and try again.",
        ) from None
    except IntegrityError:
        session.rollback()
        record = existing_record()
        if record is not None:
            return replay_or_conflict(record)
        raise _error(
            "booking_conflict",
            "The request conflicts with the latest booking state. Refresh and try again.",
        ) from None


def _event(
    session: Session,
    *,
    booking: Booking,
    actor_id: UUID | None,
    event_type: str,
    target_user_id: UUID | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    reference_id: UUID | None = None,
    note: str | None = None,
    is_internal: bool = False,
) -> BookingEvent:
    booking.event_sequence += 1
    event = BookingEvent(
        id=uuid4(),
        booking_id=booking.id,
        sequence=booking.event_sequence,
        actor_user_id=actor_id,
        target_user_id=target_user_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        reference_id=reference_id,
        note=note,
        is_internal=is_internal,
    )
    session.add(event)
    create_booking_event_notifications(session, booking, event)
    return event


def _set_status(
    session: Session,
    *,
    booking: Booking,
    actor: AppUser,
    new_status: str,
) -> None:
    if booking.status == new_status:
        return
    previous = booking.status
    booking.status = new_status
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type="booking.status_changed",
        from_status=previous,
        to_status=new_status,
    )


def _get_booking(session: Session, booking_id: UUID, *, lock: bool = False) -> Booking:
    statement = select(Booking).where(Booking.id == booking_id)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    booking = session.scalar(statement)
    if booking is None:
        raise _not_found()
    return booking


def _address_values(address: CustomerAddress | CustomerAddressInput) -> dict[str, Any]:
    return {
        "label": address.label,
        "recipient_name": address.recipient_name,
        "address_line1": address.address_line1,
        "address_line2": address.address_line2,
        "locality": address.locality,
        "city": address.city,
        "state": address.state,
        "postal_code": address.postal_code,
        "contact_phone": address.contact_phone,
        "latitude": address.latitude,
        "longitude": address.longitude,
        "location_accuracy_meters": address.location_accuracy_meters,
    }


def list_customer_addresses(session: Session, actor: AppUser) -> list[CustomerAddress]:
    addresses = list(
        session.scalars(
            select(CustomerAddress)
            .where(CustomerAddress.customer_user_id == actor.id)
            .order_by(
                CustomerAddress.is_default.desc(), CustomerAddress.updated_at.desc()
            )
        ).all()
    )
    for address in addresses:
        _record_location_access(
            session,
            actor=actor,
            address_id=address.id,
            actor_role="customer",
            has_coordinates=address.latitude is not None
            and address.longitude is not None,
        )
    return addresses


def create_customer_address(
    session: Session,
    actor: AppUser,
    request: CustomerAddressInput,
) -> CustomerAddress:
    if session.get(CustomerProfile, actor.id) is None:
        raise _error(
            "customer_profile_missing",
            "A customer profile is required to save addresses.",
        )
    data = request.model_dump()
    if data["is_default"]:
        session.query(CustomerAddress).filter(
            CustomerAddress.customer_user_id == actor.id
        ).update({CustomerAddress.is_default: False}, synchronize_session=False)
    address = CustomerAddress(customer_user_id=actor.id, **data)
    session.add(address)
    session.flush()
    _record_location_access(
        session,
        actor=actor,
        address_id=address.id,
        actor_role="customer",
        has_coordinates=address.latitude is not None and address.longitude is not None,
    )
    return address


def update_customer_address(
    session: Session,
    actor: AppUser,
    address_id: UUID,
    request: CustomerAddressUpdateRequest,
) -> CustomerAddress:
    address = session.scalar(
        select(CustomerAddress).where(
            CustomerAddress.id == address_id,
            CustomerAddress.customer_user_id == actor.id,
        )
    )
    if address is None:
        raise _not_found()
    changes = request.model_dump(exclude_unset=True)
    if (
        changes.get("latitude") is None
        and changes.get("longitude") is None
        and "latitude" in changes
    ):
        changes["location_accuracy_meters"] = None
    if changes.get("is_default") is True:
        session.query(CustomerAddress).filter(
            CustomerAddress.customer_user_id == actor.id,
            CustomerAddress.id != address.id,
        ).update({CustomerAddress.is_default: False}, synchronize_session=False)
    for field, value in changes.items():
        setattr(address, field, value)
    session.flush()
    _record_location_access(
        session,
        actor=actor,
        address_id=address.id,
        actor_role="customer",
        has_coordinates=address.latitude is not None and address.longitude is not None,
    )
    return address


def delete_customer_address(session: Session, actor: AppUser, address_id: UUID) -> None:
    address = session.scalar(
        select(CustomerAddress).where(
            CustomerAddress.id == address_id,
            CustomerAddress.customer_user_id == actor.id,
        )
    )
    if address is None:
        raise _not_found()
    session.delete(address)
    session.flush()


def create_booking(
    session: Session,
    actor: AppUser,
    request: BookingCreateRequest,
) -> UUID:
    if session.get(CustomerProfile, actor.id) is None:
        raise _error(
            "customer_profile_missing",
            "A customer profile is required to request service.",
        )
    service = session.scalar(
        select(Service)
        .join(ServiceCategory, ServiceCategory.id == Service.category_id)
        .where(
            Service.slug == request.service_slug,
            Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
    )
    if service is None:
        raise _error(
            "service_unavailable",
            "Choose a service guide that is currently active in the catalog.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    appliance_id: UUID | None = None
    if request.appliance_id is not None:
        appliance = session.scalar(
            select(Appliance).where(
                Appliance.id == request.appliance_id,
                Appliance.customer_user_id == actor.id,
            )
        )
        if appliance is None:
            raise _error(
                "invalid_appliance",
                "Select one of your own appliances to link to this booking.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if appliance.is_archived:
            raise _error(
                "invalid_appliance",
                "This appliance is archived and cannot be linked to a new booking.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        appliance_id = appliance.id

    timezone = ZoneInfo(request.timezone_name)
    local_now = datetime.now(timezone)
    if request.preferred_date < local_now.date() or (
        request.preferred_date == local_now.date()
        and request.preferred_start <= local_now.time().replace(tzinfo=None)
    ):
        raise _error(
            "invalid_preferred_window",
            "Choose a preferred time window that has not already passed.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    saved_address_id: UUID | None = None
    if request.address_id is not None:
        address = session.scalar(
            select(CustomerAddress).where(
                CustomerAddress.id == request.address_id,
                CustomerAddress.customer_user_id == actor.id,
            )
        )
        if address is None:
            raise _not_found()
        saved_address_id = address.id
        address_values = _address_values(address)
    else:
        assert request.new_address is not None
        address_values = _address_values(request.new_address)
        if request.save_new_address:
            saved_address = CustomerAddress(
                customer_user_id=actor.id,
                **request.new_address.model_dump(),
            )
            session.add(saved_address)
            session.flush()
            saved_address_id = saved_address.id

    booking = Booking(
        id=uuid4(),
        customer_user_id=actor.id,
        service_id=service.id,
        service_slug_snapshot=service.slug,
        service_title_snapshot=service.title,
        appliance_id=appliance_id,
        saved_address_id=saved_address_id,
        address_label=address_values["label"],
        recipient_name=address_values["recipient_name"],
        address_line1=address_values["address_line1"],
        address_line2=address_values["address_line2"],
        locality=address_values["locality"],
        city=address_values["city"],
        state=address_values["state"],
        postal_code=address_values["postal_code"],
        contact_phone=address_values["contact_phone"],
        latitude=address_values["latitude"],
        longitude=address_values["longitude"],
        location_accuracy_meters=address_values["location_accuracy_meters"],
        problem_description=request.problem_description,
        preferred_date=request.preferred_date,
        preferred_start=request.preferred_start,
        preferred_end=request.preferred_end,
        timezone_name=request.timezone_name,
        status="requested",
    )
    session.add(booking)
    session.flush()
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type="booking.created",
        to_status="requested",
    )
    return booking.id


def _eligible_coverage(
    session: Session,
    *,
    technician_user_id: UUID,
    booking: Booking,
) -> tuple[TechnicianCoverageArea, int | None] | None:
    service_is_active = session.scalar(
        select(Service.id)
        .join(ServiceCategory, ServiceCategory.id == Service.category_id)
        .where(
            Service.id == booking.service_id,
            Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
    )
    if service_is_active is None:
        return None

    profile = session.scalar(
        select(TechnicianProfile)
        .join(AppUser, AppUser.id == TechnicianProfile.user_id)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(
            TechnicianProfile.user_id == technician_user_id,
            TechnicianProfile.verification_status == "approved",
            AppUser.status == "active",
            UserRole.role_code == "technician",
        )
    )
    if profile is None:
        return None

    skill = session.scalar(
        select(TechnicianSkill).where(
            TechnicianSkill.technician_user_id == technician_user_id,
            TechnicianSkill.service_id == booking.service_id,
        )
    )
    if skill is None:
        return None

    coverage = session.scalars(
        select(TechnicianCoverageArea).where(
            TechnicianCoverageArea.technician_user_id == technician_user_id
        )
    ).all()
    for area in coverage:
        if (
            _normalized(area.area_name) == _normalized(booking.locality)
            and _normalized(area.city) == _normalized(booking.city)
            and _normalized(area.state) == _normalized(booking.state)
            and (
                not area.postal_code
                or _normalized(area.postal_code) == _normalized(booking.postal_code)
            )
        ):
            return area, skill.years_experience
    return None


def list_eligible_technicians(
    session: Session,
    booking_id: UUID,
) -> list[dict[str, Any]]:
    booking = _get_booking(session, booking_id)
    candidates = session.scalars(
        select(TechnicianProfile)
        .join(AppUser, AppUser.id == TechnicianProfile.user_id)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(
            AppUser.status == "active",
            TechnicianProfile.verification_status == "approved",
            UserRole.role_code == "technician",
        )
        .order_by(TechnicianProfile.display_name)
    ).all()
    results = []
    for profile in candidates:
        eligible = _eligible_coverage(
            session,
            technician_user_id=profile.user_id,
            booking=booking,
        )
        if eligible is None:
            continue
        coverage, years_experience = eligible
        results.append(
            {
                "user_id": profile.user_id,
                "display_name": profile.display_name,
                "coverage_area": coverage.area_name,
                "years_experience": years_experience,
            }
        )
    return results


def assign_booking(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingAssignmentRequest,
) -> UUID:
    if "admin" not in _roles(actor):
        raise _error(
            "forbidden", "An admin role is required.", status.HTTP_403_FORBIDDEN
        )
    booking = _get_booking(session, booking_id, lock=True)
    if booking.status not in {"requested", "assigned"}:
        raise _error(
            "invalid_assignment_state",
            "A booking can be assigned or reassigned only before the inspection begins.",
        )
    if booking.assigned_technician_user_id == request.technician_user_id:
        raise _error(
            "technician_already_assigned", "That technician is already assigned."
        )
    eligible = _eligible_coverage(
        session,
        technician_user_id=request.technician_user_id,
        booking=booking,
    )
    if eligible is None:
        raise _error(
            "technician_ineligible",
            "The technician must be active, approved, skilled for this service, and cover the requested area.",
        )

    previous = booking.assigned_technician_user_id
    if previous is not None:
        _event(
            session,
            booking=booking,
            actor_id=actor.id,
            target_user_id=previous,
            event_type="booking.assignment.removed",
            note=request.note,
            is_internal=True,
        )
    booking.assigned_technician_user_id = request.technician_user_id
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        target_user_id=request.technician_user_id,
        event_type="booking.assignment.reassigned"
        if previous
        else "booking.assignment.assigned",
        is_internal=False,
    )
    if booking.status == "requested":
        _set_status(session, booking=booking, actor=actor, new_status="assigned")
    return booking.id


def decide_assignment(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingAssignmentDecisionRequest,
) -> UUID:
    booking = _get_booking(session, booking_id, lock=True)
    if (
        "technician" not in _roles(actor)
        or booking.assigned_technician_user_id != actor.id
        or booking.status != "assigned"
    ):
        raise _error(
            "assignment_unavailable", "This booking is not assigned to your account."
        )
    if request.decision == "accept":
        if (
            _eligible_coverage(session, technician_user_id=actor.id, booking=booking)
            is None
        ):
            raise _error(
                "technician_ineligible",
                "Your current profile no longer meets assignment requirements.",
            )
        _event(
            session,
            booking=booking,
            actor_id=actor.id,
            target_user_id=actor.id,
            event_type="booking.assignment.accepted",
        )
        _set_status(session, booking=booking, actor=actor, new_status="accepted")
    else:
        booking.assigned_technician_user_id = None
        _event(
            session,
            booking=booking,
            actor_id=actor.id,
            target_user_id=actor.id,
            event_type="booking.assignment.declined",
            note=request.note,
            is_internal=True,
        )
        _set_status(session, booking=booking, actor=actor, new_status="requested")
    return booking.id


def transition_technician_booking(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingTransitionRequest,
) -> UUID:
    booking = _get_booking(session, booking_id, lock=True)
    if (
        "technician" not in _roles(actor)
        or booking.assigned_technician_user_id != actor.id
    ):
        raise _error(
            "booking_unavailable", "This booking is not assigned to your account."
        )

    transitions: dict[str, tuple[str, str]] = {
        "start_inspection": ("accepted", "inspection_pending"),
        "start_work": ("approved", "in_progress"),
        "complete": ("in_progress", "completed"),
    }
    required_status, next_status = transitions[request.action]
    if booking.status != required_status:
        raise _error(
            "invalid_booking_transition",
            f"This action requires the booking to be in {required_status} status.",
        )

    if request.action == "start_work":
        current_quote = session.scalar(
            select(BookingQuote).where(
                BookingQuote.booking_id == booking.id,
                BookingQuote.is_current.is_(True),
                BookingQuote.status == "approved",
                BookingQuote.decision_by_user_id == booking.customer_user_id,
            )
        )
        if current_quote is None or current_quote.decided_at is None:
            raise _error(
                "customer_approval_required",
                "Paid repair work cannot start until the current quotation is approved by the customer.",
            )

    event_type = {
        "start_inspection": "booking.inspection.started",
        "start_work": "booking.work.started",
        "complete": "booking.completed",
    }[request.action]
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        target_user_id=actor.id,
        event_type=event_type,
        note=request.note,
    )
    _set_status(session, booking=booking, actor=actor, new_status=next_status)
    if request.action == "complete":
        create_service_history_for_booking(
            session,
            booking=booking,
            actor=actor,
            work_note=request.note,
        )
    return booking.id


def update_booking_visit(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingVisitUpdateRequest,
) -> UUID:
    """Record a technician/admin-submitted visit update without acquiring live location."""

    booking = _get_booking(session, booking_id, lock=True)
    roles = _roles(actor)
    is_admin = "admin" in roles
    is_assigned_technician = (
        "technician" in roles and booking.assigned_technician_user_id == actor.id
    )
    if not is_admin and not is_assigned_technician:
        raise _not_found()
    if booking.status not in {
        "accepted",
        "inspection_pending",
        "quote_pending",
        "quote_rejected",
        "approved",
        "in_progress",
    }:
        raise _error(
            "visit_not_available",
            "Visit updates are available only after the assigned technician accepts the booking.",
        )

    visit = session.scalar(
        select(BookingVisit)
        .where(BookingVisit.booking_id == booking.id)
        .with_for_update()
    )
    previous_status = visit.status if visit is not None else None
    allowed_next = {
        None: {"scheduled"},
        "scheduled": {"scheduled", "en_route", "cancelled"},
        "en_route": {"en_route", "arrived", "cancelled"},
        "arrived": {"arrived", "completed"},
        "completed": set(),
        "cancelled": set(),
    }
    if request.status not in allowed_next.get(previous_status, set()):
        raise _error(
            "invalid_visit_transition",
            "Visit status must progress from scheduled to en route, arrived, then completed; a visit may also be cancelled.",
        )

    eta_at = request.eta_at.astimezone(UTC) if request.eta_at is not None else None
    if visit is None:
        visit = BookingVisit(
            booking_id=booking.id,
            status=request.status,
            eta_at=eta_at,
            updated_by_user_id=actor.id,
        )
        session.add(visit)
        session.flush()
    else:
        visit.status = request.status
        visit.eta_at = eta_at
        visit.updated_by_user_id = actor.id
        session.flush()

    # Only label estimates as manual, attributed to the authenticated role.
    visit.eta_source = ("admin_manual" if is_admin else "technician_manual") if eta_at else None
    visit.eta_updated_at = datetime.now(UTC) if eta_at else None

    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        target_user_id=booking.assigned_technician_user_id,
        event_type="booking.visit.updated",
        from_status=previous_status,
        to_status=request.status,
        reference_id=visit.id,
        note=f"Visit status updated to {request.status}.",
    )
    session.flush()
    return visit.id


def cancel_booking(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingCancelRequest,
    actor_kind: Literal["customer", "admin"],
) -> UUID:
    booking = _get_booking(session, booking_id, lock=True)
    if actor_kind == "customer":
        if "customer" not in _roles(actor) or booking.customer_user_id != actor.id:
            raise _not_found()
        if booking.status not in CUSTOMER_CANCELLABLE:
            raise _error(
                "cancellation_not_allowed",
                "Customers may cancel only before work begins. Contact an admin for help after work starts.",
            )
    elif "admin" not in _roles(actor):
        raise _error(
            "forbidden", "An admin role is required.", status.HTTP_403_FORBIDDEN
        )

    if booking.status in {"cancelled", "completed"}:
        raise _error(
            "booking_already_closed",
            "A completed or cancelled booking cannot be cancelled again.",
        )
    previous = booking.status
    booking.cancellation_reason = request.reason
    booking.cancelled_by_user_id = actor.id
    booking.cancelled_at = datetime.now(UTC)
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type="booking.cancelled",
        from_status=previous,
        to_status="cancelled",
        note=request.reason,
    )
    _set_status(session, booking=booking, actor=actor, new_status="cancelled")
    return booking.id


def update_booking_escalation(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingEscalationRequest,
) -> UUID:
    if "admin" not in _roles(actor):
        raise _error(
            "forbidden", "An admin role is required.", status.HTTP_403_FORBIDDEN
        )
    booking = _get_booking(session, booking_id, lock=True)
    if request.status == "resolved" and booking.escalation_status != "escalated":
        raise _error(
            "invalid_escalation_transition",
            "Only an escalated booking can be resolved.",
        )
    if request.status == "escalated" and booking.escalation_status == "escalated":
        raise _error("already_escalated", "This booking is already escalated.")

    previous = booking.escalation_status
    booking.escalation_status = request.status
    booking.escalation_reason = request.reason
    booking.escalation_updated_by_user_id = actor.id
    booking.escalation_updated_at = datetime.now(UTC)
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type=f"booking.escalation.{request.status}",
        note=request.reason,
        is_internal=True,
    )
    if previous == "resolved" and request.status == "escalated":
        _event(
            session,
            booking=booking,
            actor_id=actor.id,
            event_type="booking.escalation.reopened",
            is_internal=True,
        )
    return booking.id


def create_booking_quote(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    request: BookingQuoteCreateRequest,
) -> UUID:
    booking = _get_booking(session, booking_id, lock=True)
    actor_roles = _roles(actor)
    if "admin" not in actor_roles:
        if (
            "technician" not in actor_roles
            or booking.assigned_technician_user_id != actor.id
        ):
            raise _error(
                "booking_unavailable",
                "Only the assigned technician or an admin may prepare a quote.",
            )
        if (
            _eligible_coverage(session, technician_user_id=actor.id, booking=booking)
            is None
        ):
            raise _error(
                "technician_ineligible",
                "Your current profile no longer meets assignment requirements.",
            )
    if booking.status not in QUOTE_EDITABLE_STATES:
        raise _error(
            "quote_not_allowed",
            "A quotation can be created after inspection and revised only before work begins.",
        )

    items_total = sum(item.quantity * item.unit_amount_paise for item in request.items)
    if items_total > MAX_QUOTE_TOTAL_PAISE:
        raise _error(
            "quote_total_too_large",
            "The quotation exceeds the supported amount.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    current_quote = session.scalar(
        select(BookingQuote).where(
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
        )
    )
    latest_version = (
        session.scalar(
            select(func.max(BookingQuote.version)).where(
                BookingQuote.booking_id == booking.id
            )
        )
        or 0
    )
    if current_quote is not None:
        if current_quote.status == "pending" and _utc(
            current_quote.expires_at
        ) <= datetime.now(UTC):
            current_quote.status = "expired"
        else:
            current_quote.status = "superseded"
        current_quote.is_current = False

    quote = BookingQuote(
        id=uuid4(),
        booking_id=booking.id,
        version=latest_version + 1,
        status="pending",
        is_current=True,
        currency="INR",
        total_paise=items_total,
        technician_notes=request.technician_notes,
        expires_at=request.expires_at,
        created_by_user_id=actor.id,
    )
    quote.line_items = [
        BookingQuoteLineItem(
            position=position,
            line_type=item.line_type,
            description=item.description,
            quantity=item.quantity,
            unit_amount_paise=item.unit_amount_paise,
            line_total_paise=item.quantity * item.unit_amount_paise,
        )
        for position, item in enumerate(request.items)
    ]
    session.add(quote)
    session.flush()
    old_status = booking.status
    _set_status(session, booking=booking, actor=actor, new_status="quote_pending")
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type="quote.revised" if latest_version else "quote.created",
        reference_id=quote.id,
        from_status=old_status if old_status != "quote_pending" else None,
        to_status="quote_pending" if old_status != "quote_pending" else None,
    )
    return quote.id


def decide_booking_quote(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    quote_id: UUID,
    request: QuoteDecisionRequest,
) -> UUID:
    booking = _get_booking(session, booking_id, lock=True)
    if "customer" not in _roles(actor) or booking.customer_user_id != actor.id:
        raise _not_found()
    quote = session.scalar(
        select(BookingQuote).where(
            BookingQuote.id == quote_id,
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
        )
    )
    if quote is None:
        raise _error(
            "quote_unavailable",
            "Only the current quotation can be approved or rejected.",
        )
    if booking.status != "quote_pending" or quote.status != "pending":
        raise _error(
            "quote_not_pending",
            "This quotation is no longer awaiting a customer decision.",
        )
    if _utc(quote.expires_at) <= datetime.now(UTC):
        raise _error(
            "quote_expired", "This quotation has expired. Ask for a revised quotation."
        )

    previous_status = booking.status
    quote.status = request.decision
    quote.decision_by_user_id = actor.id
    quote.decided_at = datetime.now(UTC)
    quote.decision_note = request.note
    next_status = "approved" if request.decision == "approved" else "quote_rejected"
    _set_status(session, booking=booking, actor=actor, new_status=next_status)
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type=f"quote.{request.decision}",
        reference_id=quote.id,
        from_status=previous_status,
        to_status=next_status,
        note=request.note,
    )
    return booking.id


def _check_access(
    booking: Booking, actor: AppUser, viewer: Literal["customer", "technician", "admin"]
) -> None:
    if viewer == "admin":
        if "admin" not in _roles(actor):
            raise _error(
                "forbidden", "An admin role is required.", status.HTTP_403_FORBIDDEN
            )
    elif viewer == "customer":
        if "customer" not in _roles(actor) or booking.customer_user_id != actor.id:
            raise _not_found()
    elif (
        "technician" not in _roles(actor)
        or booking.assigned_technician_user_id != actor.id
    ):
        raise _not_found()


def _quote_payload(quote: BookingQuote) -> dict[str, Any]:
    expired = quote.status == "pending" and _utc(quote.expires_at) <= datetime.now(UTC)
    return {
        "id": quote.id,
        "version": quote.version,
        "status": "expired" if expired else quote.status,
        "is_current": quote.is_current,
        "currency": quote.currency,
        "total_paise": quote.total_paise,
        "technician_notes": quote.technician_notes,
        "issued_at": quote.issued_at,
        "expires_at": quote.expires_at,
        "is_expired": expired,
        "created_by_user_id": quote.created_by_user_id,
        "decision_by_user_id": quote.decision_by_user_id,
        "decided_at": quote.decided_at,
        "decision_note": quote.decision_note,
        "line_items": [
            {
                "id": item.id,
                "position": item.position,
                "line_type": item.line_type,
                "description": item.description,
                "quantity": item.quantity,
                "unit_amount_paise": item.unit_amount_paise,
                "line_total_paise": item.line_total_paise,
            }
            for item in quote.line_items
        ],
    }


def _summary_payload(
    session: Session,
    booking: Booking,
    *,
    include_location: bool = True,
) -> dict[str, Any]:
    quote = session.scalar(
        select(BookingQuote).where(
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
        )
    )
    assigned_name = None
    if booking.assigned_technician_user_id is not None:
        profile = session.get(TechnicianProfile, booking.assigned_technician_user_id)
        assigned_name = profile.display_name if profile else None
    quote_status = None
    if quote:
        quote_status = _quote_payload(quote)["status"]
    return {
        "id": booking.id,
        "service_slug": booking.service_slug_snapshot,
        "service_title": booking.service_title_snapshot,
        "appliance_id": booking.appliance_id,
        "status": booking.status,
        "preferred_date": booking.preferred_date,
        "preferred_start": booking.preferred_start,
        "preferred_end": booking.preferred_end,
        "timezone_name": booking.timezone_name,
        "address_locality": booking.locality if include_location else None,
        "city": booking.city if include_location else None,
        "assigned_technician_user_id": booking.assigned_technician_user_id,
        "assigned_technician_name": assigned_name,
        "current_quote_total_paise": quote.total_paise if quote else None,
        "current_quote_status": quote_status,
        "escalation_status": booking.escalation_status,
        "created_at": booking.created_at,
        "updated_at": booking.updated_at,
        "version": booking.version,
    }


def _visit_payload(visit: BookingVisit | None) -> dict[str, Any] | None:
    if visit is None:
        return None
    return {
        "id": visit.id,
        "booking_id": visit.booking_id,
        "status": visit.status,
        "eta_at": visit.eta_at if visit.eta_source and visit.eta_updated_at else None,
        "eta_source": visit.eta_source,
        "eta_updated_at": visit.eta_updated_at,
        "updated_by_user_id": visit.updated_by_user_id,
        "updated_at": visit.updated_at,
        "live_tracking_status": "unavailable",
    }


def read_booking_detail(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    viewer: Literal["customer", "technician", "admin"],
) -> dict[str, Any]:
    booking = _get_booking(session, booking_id)
    _check_access(booking, actor, viewer)
    technician_can_view_location = (
        viewer == "technician" and booking.status in TECHNICIAN_LOCATION_STATUSES
    )
    can_view_exact_location = (
        viewer in {"customer", "admin"} or technician_can_view_location
    )
    if can_view_exact_location:
        _record_location_access(
            session,
            actor=actor,
            booking_id=booking.id,
            actor_role=viewer,
            has_coordinates=booking.latitude is not None
            and booking.longitude is not None,
        )
    visit = session.scalar(
        select(BookingVisit).where(BookingVisit.booking_id == booking.id)
    )
    quotes = session.scalars(
        select(BookingQuote)
        .where(BookingQuote.booking_id == booking.id)
        .order_by(BookingQuote.version)
    ).all()
    events_statement = (
        select(BookingEvent)
        .where(BookingEvent.booking_id == booking.id)
        .order_by(BookingEvent.sequence)
    )
    if viewer != "admin":
        events_statement = events_statement.where(BookingEvent.is_internal.is_(False))
    events = session.scalars(events_statement).all()
    customer = session.get(CustomerProfile, booking.customer_user_id)
    return {
        **_summary_payload(
            session,
            booking,
            include_location=can_view_exact_location,
        ),
        "customer_user_id": booking.customer_user_id,
        "customer_display_name": customer.display_name if customer else None,
        "service_id": booking.service_id,
        "address": (
            {
                "label": booking.address_label,
                "recipient_name": booking.recipient_name,
                "address_line1": booking.address_line1,
                "address_line2": booking.address_line2,
                "locality": booking.locality,
                "city": booking.city,
                "state": booking.state,
                "postal_code": booking.postal_code,
                "contact_phone": booking.contact_phone,
                "latitude": booking.latitude,
                "longitude": booking.longitude,
                "location_accuracy_meters": booking.location_accuracy_meters,
            }
            if can_view_exact_location
            else None
        ),
        "location_access_limited": viewer == "technician"
        and not can_view_exact_location,
        "problem_description": booking.problem_description,
        "cancellation_reason": booking.cancellation_reason,
        "escalation_reason": booking.escalation_reason if viewer == "admin" else None,
        "visit": _visit_payload(visit) if can_view_exact_location else None,
        "quotes": [_quote_payload(quote) for quote in quotes],
        "events": [
            {
                "id": event.id,
                "sequence": event.sequence,
                "event_type": event.event_type,
                "actor_user_id": event.actor_user_id,
                "target_user_id": event.target_user_id,
                "from_status": event.from_status,
                "to_status": event.to_status,
                "reference_id": event.reference_id,
                "note": event.note
                if viewer == "admin" or not event.is_internal
                else None,
                "is_internal": event.is_internal if viewer == "admin" else False,
                "created_at": event.created_at,
            }
            for event in events
        ],
    }


def _list_response(
    session: Session,
    bookings: list[Booking],
    total: int,
    *,
    viewer: Literal["customer", "technician", "admin"],
) -> dict[str, Any]:
    return {
        "items": [
            _summary_payload(
                session,
                booking,
                # Technician list cards stay location-free; exact reads occur only in the
                # audited detail endpoint after the assignment has been accepted.
                include_location=viewer != "technician",
            )
            for booking in bookings
        ],
        "total": total,
    }


def list_customer_bookings(
    session: Session,
    *,
    actor: AppUser,
    booking_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(Booking).where(Booking.customer_user_id == actor.id)
    count_statement = (
        select(func.count())
        .select_from(Booking)
        .where(Booking.customer_user_id == actor.id)
    )
    if booking_status:
        statement = statement.where(Booking.status == booking_status)
        count_statement = count_statement.where(Booking.status == booking_status)
    total = session.scalar(count_statement) or 0
    bookings = list(
        session.scalars(
            statement.order_by(Booking.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return _list_response(session, bookings, total, viewer="customer")


def list_technician_bookings(
    session: Session,
    *,
    actor: AppUser,
    booking_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(Booking).where(Booking.assigned_technician_user_id == actor.id)
    count_statement = (
        select(func.count())
        .select_from(Booking)
        .where(Booking.assigned_technician_user_id == actor.id)
    )
    if booking_status:
        statement = statement.where(Booking.status == booking_status)
        count_statement = count_statement.where(Booking.status == booking_status)
    total = session.scalar(count_statement) or 0
    bookings = list(
        session.scalars(
            statement.order_by(Booking.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return _list_response(session, bookings, total, viewer="technician")


def list_admin_bookings(
    session: Session,
    *,
    booking_status: str | None,
    escalation_status: str | None,
    service_slug: str | None,
    technician_user_id: UUID | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(Booking)
    filters = []
    if booking_status:
        filters.append(Booking.status == booking_status)
    if escalation_status:
        filters.append(Booking.escalation_status == escalation_status)
    if service_slug:
        filters.append(Booking.service_slug_snapshot == service_slug)
    if technician_user_id:
        filters.append(Booking.assigned_technician_user_id == technician_user_id)
    if date_from:
        filters.append(Booking.preferred_date >= date_from)
    if date_to:
        filters.append(Booking.preferred_date <= date_to)
    if filters:
        from sqlalchemy import and_

        condition = and_(*filters)
        statement = statement.where(condition)
        count_statement = select(func.count()).select_from(Booking).where(condition)
    else:
        count_statement = select(func.count()).select_from(Booking)
    total = session.scalar(count_statement) or 0
    bookings = list(
        session.scalars(
            statement.order_by(Booking.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return _list_response(session, bookings, total, viewer="admin")


def create_booking_attachment_intent(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    original_filename: str,
    content_type: str,
    size_bytes: int,
    storage: BookingAttachmentStorage | None,
) -> dict[str, Any]:
    """Check owner access and delegate signed-upload creation to an injected adapter."""

    booking = _get_booking(session, booking_id)
    _check_access(booking, actor, "customer")
    if storage is None:
        raise _error(
            "attachment_storage_unavailable",
            "File uploads are not configured. You can still submit a booking without attachments.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    attachment_id = uuid4()
    intent = storage.create_upload_intent(
        booking_id=booking.id,
        attachment_id=attachment_id,
        original_filename=original_filename,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    attachment = BookingAttachment(
        id=attachment_id,
        booking_id=booking.id,
        uploaded_by_user_id=actor.id,
        original_filename=original_filename,
        content_type=content_type,
        size_bytes=size_bytes,
        status="pending_upload",
        storage_provider=intent.provider,
        storage_key=intent.object_key,
    )
    session.add(attachment)
    _event(
        session,
        booking=booking,
        actor_id=actor.id,
        event_type="booking.attachment.upload_intent_created",
        reference_id=attachment.id,
    )
    session.flush()
    return {
        "attachment_id": attachment.id,
        "upload_url": intent.upload_url,
        "headers": intent.headers,
        "expires_at": intent.expires_at,
    }
