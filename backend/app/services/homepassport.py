"""Transactional, owner-scoped HomePassport and warranty operations."""

import logging
from collections.abc import Iterable
from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Appliance,
    ApplianceDocument,
    ApplianceServiceHistory,
    AppUser,
    Booking,
    BookingQuote,
    BookingQuoteLineItem,
    CustomerProfile,
    HomePassportAuditEvent,
    MaintenanceReminder,
    ReplacedPart,
    TechnicianProfile,
    WarrantyClaim,
    WarrantyClaimHistory,
    WarrantyRecord,
)
from app.schemas.homepassport import (
    AdminServiceHistoryCorrectionRequest,
    AdminVerificationUpdateRequest,
    ApplianceCreateRequest,
    ApplianceUpdateRequest,
    ClaimTransitionRequest,
    DocumentUploadIntentRequest,
    PartCreateRequest,
    ReminderCreateRequest,
    ReminderUpdateRequest,
    ServiceHistoryCreateRequest,
    ServiceHistoryFeedbackRequest,
    WarrantyClaimCreateRequest,
    WarrantyClaimRespondRequest,
    WarrantyCreateRequest,
    WarrantyUpdateRequest,
)
from app.services.document_storage import DocumentStorage

logger = logging.getLogger(__name__)

SERVICE_TIMEZONE = ZoneInfo("Asia/Kolkata")
OPEN_CLAIM_STATUSES = frozenset(
    {"submitted", "additional_information_requested", "under_review"}
)
CLAIM_STATUS_TO_WARRANTY_STATUS = {
    "submitted": "claim_submitted",
    "additional_information_requested": "under_review",
    "under_review": "under_review",
    "approved": "approved",
    "rejected": "rejected",
    "closed": "closed",
}
CLOSED_CLAIM_STATUSES = frozenset({"approved", "rejected", "closed"})


def service_today() -> date:
    """Return the current date in the service time zone (Asia/Kolkata)."""

    return datetime.now(SERVICE_TIMEZONE).date()


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


def _forbidden(message: str = "Access denied.") -> HTTPException:
    return _error("forbidden", message, status.HTTP_403_FORBIDDEN)


def _roles(actor: AppUser) -> set[str]:
    return {assignment.role_code for assignment in actor.roles}


def _require_customer_profile(session: Session, actor: AppUser) -> CustomerProfile:
    profile = session.get(CustomerProfile, actor.id)
    if profile is None:
        raise _error(
            "customer_profile_missing",
            "A customer profile is required for HomePassport.",
        )
    return profile


def _audit(
    session: Session,
    *,
    actor: AppUser,
    entity_type: str,
    entity_id: UUID,
    action: str,
    changed_fields: Iterable[str],
    note: str | None,
) -> None:
    session.add(
        HomePassportAuditEvent(
            actor_user_id=actor.id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            changed_fields=sorted(set(changed_fields)),
            note=note,
        )
    )


def _get_owned_appliance(
    session: Session,
    actor: AppUser,
    appliance_id: UUID,
    *,
    include_archived: bool = False,
) -> Appliance:
    appliance = session.scalar(
        select(Appliance).where(
            Appliance.id == appliance_id,
            Appliance.customer_user_id == actor.id,
        )
    )
    if appliance is None:
        raise _not_found()
    if appliance.is_archived and not include_archived:
        raise _error(
            "appliance_archived",
            "This appliance is archived. Restore it before changing it.",
        )
    return appliance


def _get_owned_warranty(
    session: Session, actor: AppUser, warranty_id: UUID
) -> WarrantyRecord:
    warranty = session.scalar(
        select(WarrantyRecord).where(
            WarrantyRecord.id == warranty_id,
            WarrantyRecord.customer_user_id == actor.id,
        )
    )
    if warranty is None:
        raise _not_found()
    return warranty


def _get_owned_document(
    session: Session, actor: AppUser, document_id: UUID
) -> ApplianceDocument:
    document = session.scalar(
        select(ApplianceDocument).where(
            ApplianceDocument.id == document_id,
            ApplianceDocument.owner_user_id == actor.id,
        )
    )
    if document is None:
        raise _not_found()
    return document


def _appliance_payload(appliance: Appliance) -> dict[str, Any]:
    return {
        "id": appliance.id,
        "name": appliance.name,
        "category": appliance.category,
        "brand": appliance.brand,
        "model_number": appliance.model_number,
        "serial_number": appliance.serial_number,
        "purchase_date": appliance.purchase_date,
        "installation_date": appliance.installation_date,
        "purchase_price_paise": appliance.purchase_price_paise,
        "seller_name": appliance.seller_name,
        "notes": appliance.notes,
        "has_photo": appliance.photo_storage_key is not None,
        "is_archived": appliance.is_archived,
        "archived_at": appliance.archived_at,
        "created_at": appliance.created_at,
        "updated_at": appliance.updated_at,
    }


def _service_history_payload(record: ApplianceServiceHistory) -> dict[str, Any]:
    return {
        "id": record.id,
        "appliance_id": record.appliance_id,
        "booking_id": record.booking_id,
        "source": record.source,
        "service_date": record.service_date,
        "service_category": record.service_category,
        "booking_reference": record.booking_reference,
        "technician_name": record.technician_name_snapshot,
        "problem_description": record.problem_description,
        "inspection_findings": record.inspection_findings,
        "work_performed": record.work_performed,
        "labour_charges_paise": record.labour_charges_paise,
        "approved_quote_total_paise": record.approved_quote_total_paise,
        "completion_status": record.completion_status,
        "customer_feedback": record.customer_feedback,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def _part_payload(part: ReplacedPart) -> dict[str, Any]:
    return {
        "id": part.id,
        "appliance_id": part.appliance_id,
        "service_history_id": part.service_history_id,
        "booking_id": part.booking_id,
        "source": part.source,
        "part_name": part.part_name,
        "part_category": part.part_category,
        "brand": part.brand,
        "part_number": part.part_number,
        "quantity": part.quantity,
        "replacement_date": part.replacement_date,
        "unit_price_paise": part.unit_price_paise,
        "total_price_paise": part.total_price_paise,
        "technician_notes": part.technician_notes,
        "created_at": part.created_at,
    }


def _document_payload(document: ApplianceDocument) -> dict[str, Any]:
    # Storage keys and providers are intentionally never returned to clients.
    return {
        "id": document.id,
        "appliance_id": document.appliance_id,
        "warranty_id": document.warranty_id,
        "claim_id": document.claim_id,
        "booking_id": document.booking_id,
        "document_type": document.document_type,
        "original_filename": document.original_filename,
        "content_type": document.content_type,
        "size_bytes": document.size_bytes,
        "status": document.status,
        "created_at": document.created_at,
    }


def _reminder_payload(reminder: MaintenanceReminder) -> dict[str, Any]:
    return {
        "id": reminder.id,
        "appliance_id": reminder.appliance_id,
        "warranty_id": reminder.warranty_id,
        "reminder_type": reminder.reminder_type,
        "title": reminder.title,
        "due_date": reminder.due_date,
        "timezone_name": reminder.timezone_name,
        "is_enabled": reminder.is_enabled,
        "created_at": reminder.created_at,
        "updated_at": reminder.updated_at,
    }


def compute_warranty_status(
    *,
    start_date: date,
    end_date: date,
    latest_claim_status: str | None,
    as_of: date,
) -> str:
    """Derive the display status from dates and claim state; never client input."""

    if latest_claim_status in CLAIM_STATUS_TO_WARRANTY_STATUS:
        return CLAIM_STATUS_TO_WARRANTY_STATUS[latest_claim_status]
    if as_of < start_date:
        return "upcoming"
    if as_of <= end_date:
        return "active"
    return "expired"


def _latest_claim(
    session: Session, warranty_id: UUID
) -> WarrantyClaim | None:
    return session.scalar(
        select(WarrantyClaim)
        .where(WarrantyClaim.warranty_id == warranty_id)
        .order_by(WarrantyClaim.submitted_at.desc(), WarrantyClaim.id.desc())
        .limit(1)
    )


def _open_claim(session: Session, warranty_id: UUID) -> WarrantyClaim | None:
    return session.scalar(
        select(WarrantyClaim)
        .where(
            WarrantyClaim.warranty_id == warranty_id,
            WarrantyClaim.status.in_(sorted(OPEN_CLAIM_STATUSES)),
        )
        .order_by(WarrantyClaim.submitted_at.desc())
        .limit(1)
    )


def _warranty_payload(
    session: Session, warranty: WarrantyRecord, *, as_of: date | None = None
) -> dict[str, Any]:
    today = as_of or service_today()
    latest = _latest_claim(session, warranty.id)
    open_claim = _open_claim(session, warranty.id)
    appliance = session.get(Appliance, warranty.appliance_id) if warranty.appliance_id else None
    part = session.get(ReplacedPart, warranty.part_id) if warranty.part_id else None
    status_value = compute_warranty_status(
        start_date=warranty.start_date,
        end_date=warranty.end_date,
        latest_claim_status=latest.status if latest else None,
        as_of=today,
    )
    return {
        "id": warranty.id,
        "appliance_id": warranty.appliance_id,
        "appliance_name": appliance.name if appliance else None,
        "part_id": warranty.part_id,
        "part_name": part.part_name if part else None,
        "booking_id": warranty.booking_id,
        "warranty_type": warranty.warranty_type,
        "provider": warranty.provider,
        "reference_number": warranty.reference_number,
        "start_date": warranty.start_date,
        "end_date": warranty.end_date,
        "terms_summary": warranty.terms_summary,
        "verification_status": warranty.verification_status,
        "status": status_value,
        "days_remaining": (warranty.end_date - today).days,
        "claim_eligible": today >= warranty.start_date and open_claim is None,
        "open_claim_id": open_claim.id if open_claim else None,
        "latest_claim_status": latest.status if latest else None,
        "created_at": warranty.created_at,
        "updated_at": warranty.updated_at,
    }


def _claim_history_payload(entry: WarrantyClaimHistory) -> dict[str, Any]:
    return {
        "id": entry.id,
        "actor_user_id": entry.actor_user_id,
        "actor_role": entry.actor_role,
        "from_status": entry.from_status,
        "to_status": entry.to_status,
        "note": entry.note,
        "created_at": entry.created_at,
    }


def _claim_payload(session: Session, claim: WarrantyClaim) -> dict[str, Any]:
    warranty = session.get(WarrantyRecord, claim.warranty_id)
    appliance = (
        session.get(Appliance, warranty.appliance_id)
        if warranty and warranty.appliance_id
        else None
    )
    history = session.scalars(
        select(WarrantyClaimHistory)
        .where(WarrantyClaimHistory.claim_id == claim.id)
        .order_by(WarrantyClaimHistory.created_at, WarrantyClaimHistory.id)
    ).all()
    return {
        "id": claim.id,
        "warranty_id": claim.warranty_id,
        "warranty_provider": warranty.provider if warranty else "Unknown provider",
        "warranty_type": warranty.warranty_type if warranty else "manufacturer",
        "appliance_id": warranty.appliance_id if warranty else None,
        "appliance_name": appliance.name if appliance else None,
        "customer_user_id": claim.customer_user_id,
        "issue_description": claim.issue_description,
        "status": claim.status,
        "submitted_at": claim.submitted_at,
        "decided_by_user_id": claim.decided_by_user_id,
        "decided_at": claim.decided_at,
        "decision_reason": claim.decision_reason,
        "created_at": claim.created_at,
        "updated_at": claim.updated_at,
        "history": [_claim_history_payload(entry) for entry in history],
    }


def _claim_detail(
    session: Session, claim: WarrantyClaim
) -> dict[str, Any]:
    return _claim_payload(session, claim)


# ---------------------------------------------------------------------------
# Appliance CRUD
# ---------------------------------------------------------------------------


def list_appliances(
    session: Session,
    actor: AppUser,
    *,
    include_archived: bool = False,
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    statement = select(Appliance).where(Appliance.customer_user_id == actor.id)
    count_statement = (
        select(func.count())
        .select_from(Appliance)
        .where(Appliance.customer_user_id == actor.id)
    )
    if not include_archived:
        statement = statement.where(Appliance.is_archived.is_(False))
        count_statement = count_statement.where(Appliance.is_archived.is_(False))
    total = session.scalar(count_statement) or 0
    items = list(
        session.scalars(statement.order_by(Appliance.updated_at.desc())).all()
    )
    return {"items": [_appliance_payload(item) for item in items], "total": total}


def create_appliance(
    session: Session, actor: AppUser, request: ApplianceCreateRequest
) -> Appliance:
    _require_customer_profile(session, actor)
    appliance = Appliance(
        customer_user_id=actor.id,
        **request.model_dump(),
    )
    session.add(appliance)
    session.flush()
    return appliance


def get_appliance_detail(
    session: Session, actor: AppUser, appliance_id: UUID
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    appliance = _get_owned_appliance(session, actor, appliance_id, include_archived=True)
    history = list(
        session.scalars(
            select(ApplianceServiceHistory)
            .where(ApplianceServiceHistory.appliance_id == appliance.id)
            .order_by(ApplianceServiceHistory.service_date.desc())
        ).all()
    )
    parts = list(
        session.scalars(
            select(ReplacedPart)
            .where(ReplacedPart.appliance_id == appliance.id)
            .order_by(ReplacedPart.replacement_date.desc())
        ).all()
    )
    warranties = list(
        session.scalars(
            select(WarrantyRecord)
            .where(
                (WarrantyRecord.appliance_id == appliance.id)
                | WarrantyRecord.part_id.in_(
                    select(ReplacedPart.id).where(
                        ReplacedPart.appliance_id == appliance.id
                    )
                )
            )
            .order_by(WarrantyRecord.end_date.asc())
        ).all()
    )
    reminders = list(
        session.scalars(
            select(MaintenanceReminder)
            .where(MaintenanceReminder.appliance_id == appliance.id)
            .order_by(MaintenanceReminder.due_date.asc())
        ).all()
    )
    documents = list(
        session.scalars(
            select(ApplianceDocument)
            .where(ApplianceDocument.appliance_id == appliance.id)
            .order_by(ApplianceDocument.created_at.desc())
        ).all()
    )
    return {
        **_appliance_payload(appliance),
        "service_history": [_service_history_payload(item) for item in history],
        "parts": [_part_payload(item) for item in parts],
        "warranties": [_warranty_payload(session, item) for item in warranties],
        "reminders": [_reminder_payload(item) for item in reminders],
        "documents": [_document_payload(item) for item in documents],
    }


def update_appliance(
    session: Session,
    actor: AppUser,
    appliance_id: UUID,
    request: ApplianceUpdateRequest,
) -> Appliance:
    _require_customer_profile(session, actor)
    appliance = _get_owned_appliance(session, actor, appliance_id)
    changes = request.model_dump(exclude_unset=True)
    purchase_date = changes.get("purchase_date", appliance.purchase_date)
    installation_date = changes.get("installation_date", appliance.installation_date)
    if (
        purchase_date is not None
        and installation_date is not None
        and installation_date < purchase_date
    ):
        raise _error(
            "invalid_appliance_dates",
            "Installation date cannot be before the purchase date.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    for field, value in changes.items():
        setattr(appliance, field, value)
    session.flush()
    return appliance


def archive_appliance(
    session: Session, actor: AppUser, appliance_id: UUID
) -> Appliance:
    _require_customer_profile(session, actor)
    appliance = session.scalar(
        select(Appliance).where(
            Appliance.id == appliance_id,
            Appliance.customer_user_id == actor.id,
        )
    )
    if appliance is None:
        raise _not_found()
    if appliance.is_archived:
        return appliance
    appliance.is_archived = True
    appliance.archived_at = datetime.now(UTC)
    _audit(
        session,
        actor=actor,
        entity_type="appliance",
        entity_id=appliance.id,
        action="appliance.archived",
        changed_fields=["is_archived", "archived_at"],
        note=None,
    )
    session.flush()
    return appliance


def unarchive_appliance(
    session: Session, actor: AppUser, appliance_id: UUID
) -> Appliance:
    _require_customer_profile(session, actor)
    appliance = session.scalar(
        select(Appliance).where(
            Appliance.id == appliance_id,
            Appliance.customer_user_id == actor.id,
        )
    )
    if appliance is None:
        raise _not_found()
    if not appliance.is_archived:
        return appliance
    appliance.is_archived = False
    appliance.archived_at = None
    _audit(
        session,
        actor=actor,
        entity_type="appliance",
        entity_id=appliance.id,
        action="appliance.unarchived",
        changed_fields=["is_archived", "archived_at"],
        note=None,
    )
    session.flush()
    return appliance


def delete_appliance(
    session: Session, actor: AppUser, appliance_id: UUID
) -> None:
    """Hard delete only when retention rules allow it; otherwise archive instead."""

    _require_customer_profile(session, actor)
    appliance = session.scalar(
        select(Appliance).where(
            Appliance.id == appliance_id,
            Appliance.customer_user_id == actor.id,
        )
    )
    if appliance is None:
        raise _not_found()

    def count(model: type, condition) -> int:  # type: ignore[valid-type]
        return session.scalar(select(func.count()).select_from(model).where(condition)) or 0

    blockers: list[str] = []
    if count(ApplianceServiceHistory, ApplianceServiceHistory.appliance_id == appliance.id):
        blockers.append("service history")
    if count(ReplacedPart, ReplacedPart.appliance_id == appliance.id):
        blockers.append("replaced parts")
    if count(
        WarrantyRecord,
        (WarrantyRecord.appliance_id == appliance.id)
        | WarrantyRecord.part_id.in_(
            select(ReplacedPart.id).where(ReplacedPart.appliance_id == appliance.id)
        ),
    ):
        blockers.append("warranties")
    if count(ApplianceDocument, ApplianceDocument.appliance_id == appliance.id):
        blockers.append("documents")
    if blockers:
        raise _error(
            "appliance_in_use",
            "This appliance has recorded "
            + ", ".join(blockers)
            + ". Archive it instead of deleting it so the history stays intact.",
        )
    _audit(
        session,
        actor=actor,
        entity_type="appliance",
        entity_id=appliance.id,
        action="appliance.deleted",
        changed_fields=["deleted"],
        note="Deleted by its owner while empty.",
    )
    session.delete(appliance)
    session.flush()


# ---------------------------------------------------------------------------
# Service history
# ---------------------------------------------------------------------------


def create_service_history_for_booking(
    session: Session,
    *,
    booking: Booking,
    actor: AppUser,
    work_note: str | None,
) -> ApplianceServiceHistory | None:
    """Create the verified record for a completed booking, idempotently."""

    if booking.appliance_id is None:
        return None
    existing = session.scalar(
        select(ApplianceServiceHistory).where(
            ApplianceServiceHistory.booking_id == booking.id
        )
    )
    if existing is not None:
        return existing

    appliance = session.get(Appliance, booking.appliance_id)
    if appliance is None:
        return None

    quote = session.scalar(
        select(BookingQuote)
        .where(
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
            BookingQuote.status == "approved",
        )
        .order_by(BookingQuote.version.desc())
    )
    labour_paise: int | None = None
    part_lines: list[BookingQuoteLineItem] = []
    if quote is not None:
        line_items = session.scalars(
            select(BookingQuoteLineItem)
            .where(BookingQuoteLineItem.quote_id == quote.id)
            .order_by(BookingQuoteLineItem.position)
        ).all()
        labour_paise = sum(
            item.line_total_paise for item in line_items if item.line_type == "labour"
        )
        part_lines = [item for item in line_items if item.line_type == "part"]

    technician_name = None
    if booking.assigned_technician_user_id is not None:
        profile = session.get(TechnicianProfile, booking.assigned_technician_user_id)
        technician_name = profile.display_name if profile else None

    record = ApplianceServiceHistory(
        customer_user_id=booking.customer_user_id,
        appliance_id=appliance.id,
        booking_id=booking.id,
        source="fixnear_verified",
        service_date=datetime.now(UTC).date(),
        service_category=booking.service_title_snapshot[:80],
        booking_reference=str(booking.id),
        technician_user_id=booking.assigned_technician_user_id,
        technician_name_snapshot=technician_name,
        problem_description=booking.problem_description,
        work_performed=work_note,
        labour_charges_paise=labour_paise,
        approved_quote_total_paise=quote.total_paise if quote else None,
        completion_status="completed",
    )
    session.add(record)
    session.flush()
    for item in part_lines:
        session.add(
            ReplacedPart(
                customer_user_id=booking.customer_user_id,
                appliance_id=appliance.id,
                service_history_id=record.id,
                booking_id=booking.id,
                source="fixnear_verified",
                part_name=item.description[:160],
                quantity=item.quantity,
                replacement_date=datetime.now(UTC).date(),
                unit_price_paise=item.unit_amount_paise,
                total_price_paise=item.line_total_paise,
            )
        )
    session.flush()
    return record


def create_customer_service_history(
    session: Session,
    actor: AppUser,
    appliance_id: UUID,
    request: ServiceHistoryCreateRequest,
) -> ApplianceServiceHistory:
    _require_customer_profile(session, actor)
    appliance = _get_owned_appliance(session, actor, appliance_id)
    record = ApplianceServiceHistory(
        customer_user_id=actor.id,
        appliance_id=appliance.id,
        booking_id=None,
        source="customer_reported",
        service_date=request.service_date,
        service_category=request.service_category,
        technician_name_snapshot=request.provider_name,
        problem_description=request.problem_description,
        work_performed=request.work_performed,
        labour_charges_paise=request.labour_charges_paise,
        approved_quote_total_paise=None,
        completion_status="completed",
    )
    session.add(record)
    session.flush()
    return record


def set_service_history_feedback(
    session: Session,
    actor: AppUser,
    history_id: UUID,
    request: ServiceHistoryFeedbackRequest,
) -> ApplianceServiceHistory:
    record = session.scalar(
        select(ApplianceServiceHistory).where(
            ApplianceServiceHistory.id == history_id,
            ApplianceServiceHistory.customer_user_id == actor.id,
        )
    )
    if record is None:
        raise _not_found()
    record.customer_feedback = request.customer_feedback
    session.flush()
    return record


def delete_customer_service_history(
    session: Session, actor: AppUser, history_id: UUID
) -> None:
    record = session.scalar(
        select(ApplianceServiceHistory).where(
            ApplianceServiceHistory.id == history_id,
            ApplianceServiceHistory.customer_user_id == actor.id,
        )
    )
    if record is None:
        raise _not_found()
    if record.source != "customer_reported":
        raise _error(
            "verified_record_locked",
            "Verified FixNear service records cannot be deleted; they can only be corrected by support.",
        )
    session.delete(record)
    session.flush()


def correct_service_history(
    session: Session,
    actor: AppUser,
    history_id: UUID,
    request: AdminServiceHistoryCorrectionRequest,
) -> ApplianceServiceHistory:
    if "admin" not in _roles(actor):
        raise _forbidden("An admin role is required.")
    record = session.scalar(
        select(ApplianceServiceHistory).where(ApplianceServiceHistory.id == history_id)
    )
    if record is None:
        raise _not_found()
    changes: list[str] = []
    if "problem_description" in request.model_fields_set:
        record.problem_description = request.problem_description
        changes.append("problem_description")
    if "inspection_findings" in request.model_fields_set:
        record.inspection_findings = request.inspection_findings
        changes.append("inspection_findings")
    if "work_performed" in request.model_fields_set:
        record.work_performed = request.work_performed
        changes.append("work_performed")
    _audit(
        session,
        actor=actor,
        entity_type="service_history",
        entity_id=record.id,
        action="service_history.corrected",
        changed_fields=changes,
        note=request.note,
    )
    session.flush()
    return record


# ---------------------------------------------------------------------------
# Replaced parts
# ---------------------------------------------------------------------------


def create_customer_part(
    session: Session,
    actor: AppUser,
    appliance_id: UUID,
    request: PartCreateRequest,
) -> ReplacedPart:
    _require_customer_profile(session, actor)
    appliance = _get_owned_appliance(session, actor, appliance_id)
    part = ReplacedPart(
        customer_user_id=actor.id,
        appliance_id=appliance.id,
        source="customer_reported",
        **request.model_dump(),
    )
    session.add(part)
    session.flush()
    return part


def delete_customer_part(session: Session, actor: AppUser, part_id: UUID) -> None:
    part = session.scalar(
        select(ReplacedPart).where(
            ReplacedPart.id == part_id,
            ReplacedPart.customer_user_id == actor.id,
        )
    )
    if part is None:
        raise _not_found()
    if part.source != "customer_reported":
        raise _error(
            "verified_record_locked",
            "Verified FixNear part records cannot be deleted.",
        )
    session.delete(part)
    session.flush()


# ---------------------------------------------------------------------------
# Warranty vault
# ---------------------------------------------------------------------------


def create_warranty(
    session: Session, actor: AppUser, request: WarrantyCreateRequest
) -> WarrantyRecord:
    _require_customer_profile(session, actor)
    appliance: Appliance | None = None
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
                "Select one of your own appliances.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
    part: ReplacedPart | None = None
    if request.part_id is not None:
        part = session.scalar(
            select(ReplacedPart).where(
                ReplacedPart.id == request.part_id,
                ReplacedPart.customer_user_id == actor.id,
            )
        )
        if part is None:
            raise _error(
                "invalid_part",
                "Select one of your own replaced parts.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
    if request.booking_id is not None:
        booking = session.scalar(
            select(Booking).where(
                Booking.id == request.booking_id,
                Booking.customer_user_id == actor.id,
            )
        )
        if booking is None:
            raise _error(
                "invalid_booking",
                "Select one of your own bookings.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )

    warranty = WarrantyRecord(
        customer_user_id=actor.id,
        appliance_id=request.appliance_id,
        part_id=request.part_id,
        booking_id=request.booking_id,
        warranty_type=request.warranty_type,
        provider=request.provider,
        reference_number=request.reference_number,
        start_date=request.start_date,
        end_date=request.end_date,
        terms_summary=request.terms_summary,
        verification_status="unverified",
    )
    session.add(warranty)
    session.flush()

    if request.create_expiry_reminder:
        reminder = MaintenanceReminder(
            customer_user_id=actor.id,
            appliance_id=appliance.id if appliance else (part.appliance_id if part else None),
            warranty_id=warranty.id,
            reminder_type="warranty_expiry",
            title=f"Warranty ends · {warranty.provider}",
            due_date=warranty.end_date,
            timezone_name="Asia/Kolkata",
            is_enabled=True,
        )
        try:
            with session.begin_nested():
                session.add(reminder)
                session.flush()
        except IntegrityError:
            # An identical warranty-expiry reminder already exists; do not duplicate it.
            pass
    return warranty


def list_warranties(
    session: Session, actor: AppUser
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    warranties = list(
        session.scalars(
            select(WarrantyRecord)
            .where(WarrantyRecord.customer_user_id == actor.id)
            .order_by(WarrantyRecord.end_date.asc(), WarrantyRecord.created_at.desc())
        ).all()
    )
    items = [_warranty_payload(session, item) for item in warranties]
    return {"items": items, "total": len(items)}


def get_warranty_detail(
    session: Session, actor: AppUser, warranty_id: UUID
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    warranty = _get_owned_warranty(session, actor, warranty_id)
    return _warranty_payload(session, warranty)


def update_warranty(
    session: Session,
    actor: AppUser,
    warranty_id: UUID,
    request: WarrantyUpdateRequest,
) -> WarrantyRecord:
    _require_customer_profile(session, actor)
    warranty = _get_owned_warranty(session, actor, warranty_id)
    changes = request.model_dump(exclude_unset=True)
    start_date = changes.get("start_date", warranty.start_date)
    end_date = changes.get("end_date", warranty.end_date)
    if end_date < start_date:
        raise _error(
            "invalid_warranty_dates",
            "Warranty end date cannot be before the start date.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    changed_fields = sorted(changes)
    for field, value in changes.items():
        setattr(warranty, field, value)
    _audit(
        session,
        actor=actor,
        entity_type="warranty",
        entity_id=warranty.id,
        action="warranty.updated",
        changed_fields=changed_fields,
        note=None,
    )
    session.flush()
    return warranty


def get_overview(
    session: Session, actor: AppUser
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    today = service_today()
    total_appliances = session.scalar(
        select(func.count())
        .select_from(Appliance)
        .where(Appliance.customer_user_id == actor.id, Appliance.is_archived.is_(False))
    ) or 0
    warranties = list(
        session.scalars(
            select(WarrantyRecord).where(WarrantyRecord.customer_user_id == actor.id)
        ).all()
    )
    active = expiring = expired = 0
    for warranty in warranties:
        latest = _latest_claim(session, warranty.id)
        computed = compute_warranty_status(
            start_date=warranty.start_date,
            end_date=warranty.end_date,
            latest_claim_status=latest.status if latest else None,
            as_of=today,
        )
        if computed == "active":
            active += 1
            if 0 <= (warranty.end_date - today).days <= 30:
                expiring += 1
        elif computed == "expired":
            expired += 1
    open_claims = session.scalar(
        select(func.count())
        .select_from(WarrantyClaim)
        .where(
            WarrantyClaim.customer_user_id == actor.id,
            WarrantyClaim.status.in_(sorted(OPEN_CLAIM_STATUSES)),
        )
    ) or 0
    recent_history = list(
        session.scalars(
            select(ApplianceServiceHistory)
            .where(ApplianceServiceHistory.customer_user_id == actor.id)
            .order_by(
                ApplianceServiceHistory.service_date.desc(),
                ApplianceServiceHistory.created_at.desc(),
            )
            .limit(5)
        ).all()
    )
    recent_parts = list(
        session.scalars(
            select(ReplacedPart)
            .where(ReplacedPart.customer_user_id == actor.id)
            .order_by(
                ReplacedPart.replacement_date.desc(),
                ReplacedPart.created_at.desc(),
            )
            .limit(5)
        ).all()
    )
    return {
        "total_appliances": total_appliances,
        "active_warranties": active,
        "expiring_warranties_30d": expiring,
        "expired_warranties": expired,
        "open_claims": open_claims,
        "recent_service_history": [_service_history_payload(item) for item in recent_history],
        "recent_parts": [_part_payload(item) for item in recent_parts],
    }


# ---------------------------------------------------------------------------
# Warranty claims
# ---------------------------------------------------------------------------


def create_claim(
    session: Session,
    actor: AppUser,
    warranty_id: UUID,
    request: WarrantyClaimCreateRequest,
) -> WarrantyClaim:
    _require_customer_profile(session, actor)
    warranty = _get_owned_warranty(session, actor, warranty_id)
    today = service_today()
    if today < warranty.start_date:
        raise _error(
            "warranty_not_started",
            "This warranty has not started yet, so a claim cannot be filed against it.",
        )
    open_claim = _open_claim(session, warranty.id)
    if open_claim is not None:
        raise _error(
            "claim_already_open",
            "A claim is already open for this warranty. Track it from the claims page.",
        )
    claim = WarrantyClaim(
        warranty_id=warranty.id,
        customer_user_id=actor.id,
        issue_description=request.issue_description,
        status="submitted",
        submitted_at=datetime.now(UTC),
    )
    session.add(claim)
    try:
        session.flush()
    except IntegrityError:
        # The partial unique index uq_warranty_claims_one_open rejected a
        # concurrent open claim for the same warranty.
        raise _error(
            "claim_already_open",
            "A claim is already open for this warranty. Track it from the claims page.",
        ) from None
    session.add(
        WarrantyClaimHistory(
            claim_id=claim.id,
            actor_user_id=actor.id,
            actor_role="customer",
            from_status=None,
            to_status="submitted",
            note="Claim submitted by the customer.",
            created_at=datetime.now(UTC),
        )
    )
    session.flush()
    return claim


def list_customer_claims(
    session: Session, actor: AppUser
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    claims = list(
        session.scalars(
            select(WarrantyClaim)
            .where(WarrantyClaim.customer_user_id == actor.id)
            .order_by(WarrantyClaim.submitted_at.desc())
        ).all()
    )
    return {
        "items": [_claim_payload(session, claim) for claim in claims],
        "total": len(claims),
    }


def get_claim(
    session: Session, actor: AppUser, claim_id: UUID, *, viewer: Literal["customer", "admin"]
) -> dict[str, Any]:
    claim = session.get(WarrantyClaim, claim_id)
    if claim is None:
        raise _not_found()
    if viewer == "customer":
        if "customer" not in _roles(actor) or claim.customer_user_id != actor.id:
            raise _not_found()
    elif "admin" not in _roles(actor):
        raise _forbidden("An admin role is required.")
    return _claim_payload(session, claim)


def respond_to_claim(
    session: Session,
    actor: AppUser,
    claim_id: UUID,
    request: WarrantyClaimRespondRequest,
) -> WarrantyClaim:
    claim = session.scalar(
        select(WarrantyClaim)
        .where(
            WarrantyClaim.id == claim_id,
            WarrantyClaim.customer_user_id == actor.id,
        )
        .with_for_update()
    )
    if claim is None:
        raise _not_found()
    if claim.status != "additional_information_requested":
        raise _error(
            "not_awaiting_customer",
            "This claim is not waiting for information from you.",
        )
    previous = claim.status
    claim.status = "under_review"
    session.add(
        WarrantyClaimHistory(
            claim_id=claim.id,
            actor_user_id=actor.id,
            actor_role="customer",
            from_status=previous,
            to_status="under_review",
            note=request.note,
            created_at=datetime.now(UTC),
        )
    )
    session.flush()
    return claim


_ADMIN_TRANSITIONS: dict[str, tuple[frozenset[str], str]] = {
    "start_review": (frozenset({"submitted", "additional_information_requested"}), "under_review"),
    "request_information": (frozenset({"submitted", "under_review"}), "additional_information_requested"),
    "approve": (frozenset({"under_review", "additional_information_requested"}), "approved"),
    "reject": (
        frozenset({"submitted", "under_review", "additional_information_requested"}),
        "rejected",
    ),
    "close": (frozenset({"approved", "rejected"}), "closed"),
}


def list_admin_claims(
    session: Session,
    *,
    claim_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(WarrantyClaim)
    count_statement = select(func.count()).select_from(WarrantyClaim)
    if claim_status:
        statement = statement.where(WarrantyClaim.status == claim_status)
        count_statement = count_statement.where(WarrantyClaim.status == claim_status)
    total = session.scalar(count_statement) or 0
    claims = list(
        session.scalars(
            statement.order_by(WarrantyClaim.submitted_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return {
        "items": [_claim_payload(session, claim) for claim in claims],
        "total": total,
    }


def transition_claim(
    session: Session,
    actor: AppUser,
    claim_id: UUID,
    request: ClaimTransitionRequest,
) -> WarrantyClaim:
    if "admin" not in _roles(actor):
        raise _forbidden("An admin role is required.")
    claim = session.scalar(
        select(WarrantyClaim)
        .where(WarrantyClaim.id == claim_id)
        .with_for_update()
    )
    if claim is None:
        raise _not_found()
    if claim.customer_user_id == actor.id:
        raise _forbidden("You cannot decide your own warranty claim.")
    allowed_from, next_status = _ADMIN_TRANSITIONS[request.action]
    if claim.status not in allowed_from:
        raise _error(
            "invalid_claim_transition",
            f"This action is not valid while the claim is {claim.status.replace('_', ' ')}.",
        )
    previous = claim.status
    note = request.note.strip() if request.note else None
    claim.status = next_status
    if request.action in {"approve", "reject", "close"}:
        claim.decided_by_user_id = actor.id
        claim.decided_at = datetime.now(UTC)
        if note is not None:
            claim.decision_reason = note
    session.add(
        WarrantyClaimHistory(
            claim_id=claim.id,
            actor_user_id=actor.id,
            actor_role="admin",
            from_status=previous,
            to_status=next_status,
            note=note,
            created_at=datetime.now(UTC),
        )
    )
    session.flush()
    return claim


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def _must_own(
    session: Session,
    *,
    model: type,
    record_id: UUID,
    owner_column,
    actor: AppUser,
    code: str,
    message: str,
) -> None:
    found = session.scalar(
        select(model.id).where(model.id == record_id, owner_column == actor.id)
    )
    if found is None:
        raise _error(code, message, status.HTTP_422_UNPROCESSABLE_CONTENT)


def _check_document_references(
    session: Session, actor: AppUser, request: DocumentUploadIntentRequest
) -> None:
    if request.appliance_id is not None:
        _must_own(
            session,
            model=Appliance,
            record_id=request.appliance_id,
            owner_column=Appliance.customer_user_id,
            actor=actor,
            code="invalid_appliance",
            message="Select one of your own appliances.",
        )
    if request.warranty_id is not None:
        _must_own(
            session,
            model=WarrantyRecord,
            record_id=request.warranty_id,
            owner_column=WarrantyRecord.customer_user_id,
            actor=actor,
            code="invalid_warranty",
            message="Select one of your own warranties.",
        )
    if request.claim_id is not None:
        _must_own(
            session,
            model=WarrantyClaim,
            record_id=request.claim_id,
            owner_column=WarrantyClaim.customer_user_id,
            actor=actor,
            code="invalid_claim",
            message="Select one of your own claims.",
        )
    if request.booking_id is not None:
        _must_own(
            session,
            model=Booking,
            record_id=request.booking_id,
            owner_column=Booking.customer_user_id,
            actor=actor,
            code="invalid_booking",
            message="Select one of your own bookings.",
        )


def create_document_upload_intent(
    session: Session,
    actor: AppUser,
    request: DocumentUploadIntentRequest,
    storage: DocumentStorage | None,
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    _check_document_references(session, actor, request)
    if storage is None:
        raise _error(
            "document_storage_unavailable",
            "Document uploads are not configured. No file has been stored; try again once storage is enabled.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    document_id = uuid4()
    intent = storage.create_upload_intent(
        document_id=document_id,
        owner_user_id=actor.id,
        original_filename=request.original_filename,
        content_type=request.content_type,
        size_bytes=request.size_bytes,
    )
    document = ApplianceDocument(
        id=document_id,
        owner_user_id=actor.id,
        appliance_id=request.appliance_id,
        warranty_id=request.warranty_id,
        claim_id=request.claim_id,
        booking_id=request.booking_id,
        document_type=request.document_type,
        original_filename=request.original_filename,
        content_type=request.content_type,
        size_bytes=request.size_bytes,
        status="pending_upload",
        storage_provider=intent.provider,
        storage_key=intent.object_key,
    )
    session.add(document)
    session.flush()
    return {
        "document_id": document.id,
        "upload_url": intent.upload_url,
        "headers": intent.headers,
        "expires_at": intent.expires_at or datetime.now(UTC),
    }


def list_documents(
    session: Session,
    actor: AppUser,
    *,
    storage_available: bool,
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    documents = list(
        session.scalars(
            select(ApplianceDocument)
            .where(ApplianceDocument.owner_user_id == actor.id)
            .order_by(ApplianceDocument.created_at.desc())
        ).all()
    )
    return {
        "items": [_document_payload(document) for document in documents],
        "total": len(documents),
        "upload_available": storage_available,
    }


def list_claim_evidence(
    session: Session,
    claim_id: UUID,
) -> list[dict[str, Any]]:
    documents = list(
        session.scalars(
            select(ApplianceDocument)
            .where(ApplianceDocument.claim_id == claim_id)
            .order_by(ApplianceDocument.created_at.asc())
        ).all()
    )
    return [_document_payload(document) for document in documents]


def delete_document(
    session: Session,
    actor: AppUser,
    document_id: UUID,
    storage: DocumentStorage | None,
) -> None:
    document = _get_owned_document(session, actor, document_id)
    if storage is not None:
        try:
            storage.delete_object(storage_key=document.storage_key or "")
        except Exception as exc:  # noqa: BLE001 - storage drivers raise their own error types
            # The metadata row is still removed so no stale pointer remains visible;
            # log only the error class, never the storage key or file contents.
            logger.warning(
                "Document object deletion failed; removing metadata anyway.",
                extra={"exception_type": type(exc).__name__},
            )
    session.delete(document)
    session.flush()


# ---------------------------------------------------------------------------
# Appliance photo (same storage gate as documents)
# ---------------------------------------------------------------------------


def create_photo_upload_intent(
    session: Session,
    actor: AppUser,
    appliance_id: UUID,
    request: DocumentUploadIntentRequest,
    storage: DocumentStorage | None,
) -> dict[str, Any]:
    if request.document_type != "photo":
        raise _error(
            "invalid_photo_type",
            "Appliance photos must use the photo document type.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    appliance = _get_owned_appliance(session, actor, appliance_id)
    return create_document_upload_intent(
        session,
        actor,
        request.model_copy(update={"appliance_id": appliance.id}),
        storage,
    )


# ---------------------------------------------------------------------------
# Maintenance reminders
# ---------------------------------------------------------------------------


def list_reminders(
    session: Session, actor: AppUser, *, enabled_only: bool = False
) -> dict[str, Any]:
    _require_customer_profile(session, actor)
    statement = select(MaintenanceReminder).where(
        MaintenanceReminder.customer_user_id == actor.id
    )
    count_statement = (
        select(func.count())
        .select_from(MaintenanceReminder)
        .where(MaintenanceReminder.customer_user_id == actor.id)
    )
    if enabled_only:
        statement = statement.where(MaintenanceReminder.is_enabled.is_(True))
        count_statement = count_statement.where(
            MaintenanceReminder.is_enabled.is_(True)
        )
    total = session.scalar(count_statement) or 0
    reminders = list(
        session.scalars(statement.order_by(MaintenanceReminder.due_date.asc())).all()
    )
    return {
        "items": [_reminder_payload(item) for item in reminders],
        "total": total,
    }


def create_reminder(
    session: Session, actor: AppUser, request: ReminderCreateRequest
) -> MaintenanceReminder:
    _require_customer_profile(session, actor)
    if request.reminder_type == "warranty_expiry":
        raise _error(
            "reserved_reminder_type",
            "Warranty expiry reminders are created automatically from your warranties.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    appliance: Appliance | None = None
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
                "Select one of your own appliances.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
    duplicate = session.scalar(
        select(MaintenanceReminder).where(
            MaintenanceReminder.customer_user_id == actor.id,
            MaintenanceReminder.reminder_type == request.reminder_type,
            MaintenanceReminder.appliance_id == (appliance.id if appliance else None),
            MaintenanceReminder.warranty_id.is_(None),
            MaintenanceReminder.due_date == request.due_date,
            MaintenanceReminder.title == request.title,
        )
    )
    if duplicate is not None:
        raise _error(
            "reminder_exists",
            "An identical reminder already exists.",
        )
    reminder = MaintenanceReminder(
        customer_user_id=actor.id,
        appliance_id=appliance.id if appliance else None,
        warranty_id=None,
        reminder_type=request.reminder_type,
        title=request.title,
        due_date=request.due_date,
        timezone_name=request.timezone_name,
        is_enabled=True,
    )
    session.add(reminder)
    session.flush()
    return reminder


def update_reminder(
    session: Session,
    actor: AppUser,
    reminder_id: UUID,
    request: ReminderUpdateRequest,
) -> MaintenanceReminder:
    reminder = session.scalar(
        select(MaintenanceReminder).where(
            MaintenanceReminder.id == reminder_id,
            MaintenanceReminder.customer_user_id == actor.id,
        )
    )
    if reminder is None:
        raise _not_found()
    changes = request.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(reminder, field, value)
    session.flush()
    return reminder


def delete_reminder(session: Session, actor: AppUser, reminder_id: UUID) -> None:
    reminder = session.scalar(
        select(MaintenanceReminder).where(
            MaintenanceReminder.id == reminder_id,
            MaintenanceReminder.customer_user_id == actor.id,
        )
    )
    if reminder is None:
        raise _not_found()
    session.delete(reminder)
    session.flush()


# ---------------------------------------------------------------------------
# Admin oversight
# ---------------------------------------------------------------------------


def list_admin_warranties(
    session: Session,
    *,
    verification_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(WarrantyRecord)
    count_statement = select(func.count()).select_from(WarrantyRecord)
    if verification_status:
        statement = statement.where(
            WarrantyRecord.verification_status == verification_status
        )
        count_statement = count_statement.where(
            WarrantyRecord.verification_status == verification_status
        )
    total = session.scalar(count_statement) or 0
    warranties = list(
        session.scalars(
            statement.order_by(WarrantyRecord.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    today = service_today()
    items: list[dict[str, Any]] = []
    for warranty in warranties:
        customer = session.get(CustomerProfile, warranty.customer_user_id)
        appliance = (
            session.get(Appliance, warranty.appliance_id)
            if warranty.appliance_id
            else None
        )
        part = (
            session.get(ReplacedPart, warranty.part_id) if warranty.part_id else None
        )
        latest = _latest_claim(session, warranty.id)
        items.append(
            {
                "id": warranty.id,
                "customer_display_name": customer.display_name if customer else None,
                "appliance_name": appliance.name if appliance else None,
                "part_name": part.part_name if part else None,
                "warranty_type": warranty.warranty_type,
                "provider": warranty.provider,
                "reference_number": warranty.reference_number,
                "start_date": warranty.start_date,
                "end_date": warranty.end_date,
                "verification_status": warranty.verification_status,
                "status": compute_warranty_status(
                    start_date=warranty.start_date,
                    end_date=warranty.end_date,
                    latest_claim_status=latest.status if latest else None,
                    as_of=today,
                ),
            }
        )
    return {"items": items, "total": total}


def set_warranty_verification(
    session: Session,
    actor: AppUser,
    warranty_id: UUID,
    request: AdminVerificationUpdateRequest,
) -> WarrantyRecord:
    if "admin" not in _roles(actor):
        raise _forbidden("An admin role is required.")
    warranty = session.scalar(
        select(WarrantyRecord).where(WarrantyRecord.id == warranty_id).with_for_update()
    )
    if warranty is None:
        raise _not_found()
    if warranty.verification_status == request.verification_status:
        return warranty
    previous = warranty.verification_status
    warranty.verification_status = request.verification_status
    _audit(
        session,
        actor=actor,
        entity_type="warranty",
        entity_id=warranty.id,
        action="warranty.verification_changed",
        changed_fields=["verification_status"],
        note=f"{previous} -> {request.verification_status}: {request.note}",
    )
    session.flush()
    return warranty


def list_audit_events(
    session: Session,
    *,
    entity_type: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    statement = select(HomePassportAuditEvent)
    count_statement = select(func.count()).select_from(HomePassportAuditEvent)
    if entity_type:
        statement = statement.where(HomePassportAuditEvent.entity_type == entity_type)
        count_statement = count_statement.where(
            HomePassportAuditEvent.entity_type == entity_type
        )
    total = session.scalar(count_statement) or 0
    events = list(
        session.scalars(
            statement.order_by(HomePassportAuditEvent.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return {
        "items": [
            {
                "id": event.id,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "action": event.action,
                "changed_fields": event.changed_fields,
                "note": event.note,
                "actor_user_id": event.actor_user_id,
                "created_at": event.created_at,
            }
            for event in events
        ],
        "total": total,
    }
