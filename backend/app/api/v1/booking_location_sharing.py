"""Foreground-only booking-scoped location sharing. No background collection."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.authorization import (
    require_admin_role,
    require_approved_technician,
    require_customer_role,
)
from app.db.session import get_db_session
from app.models import (
    AppUser,
    Booking,
    BookingLocationSharing,
    TechnicianProfile,
    UserRole,
)
from app.services.operations_audit import record_operations_audit

router = APIRouter(tags=["booking location sharing"])
DB = Annotated[Session, Depends(get_db_session)]
Tech = Annotated[AppUser, Depends(require_approved_technician)]
Customer = Annotated[AppUser, Depends(require_customer_role)]
Admin = Annotated[AppUser, Depends(require_admin_role)]
ACTIVE = {
    "accepted",
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
    "in_progress",
}


class SharingChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: Literal["enabled", "paused", "stopped"]


class LocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    accuracy_meters: Annotated[float, Field(ge=0, le=100000)]


class SharingView(BaseModel):
    state: Literal["enabled", "paused", "stopped"]
    freshness: Literal["unavailable", "fresh", "stale"]
    latitude: float | None = None
    longitude: float | None = None
    accuracy_meters: float | None = None
    location_updated_at: datetime | None = None


def _booking(session: Session, booking_id: UUID) -> Booking:
    booking = session.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking unavailable.")
    return booking


def _technician_booking(session: Session, booking_id: UUID, actor: AppUser) -> Booking:
    booking = _booking(session, booking_id)
    if booking.assigned_technician_user_id != actor.id or booking.status not in ACTIVE:
        raise HTTPException(status_code=404, detail="Booking unavailable.")
    return booking


def _row(session: Session, booking: Booking) -> BookingLocationSharing | None:
    return session.scalar(
        select(BookingLocationSharing)
        .where(BookingLocationSharing.booking_id == booking.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _view(
    session: Session, booking: Booking, row: BookingLocationSharing | None
) -> SharingView:
    if (
        not row
        or row.technician_user_id != booking.assigned_technician_user_id
        or row.booking_version != booking.version
        or booking.status not in ACTIVE
    ):
        return SharingView(state="stopped", freshness="unavailable")
    eligible = session.scalar(
        select(TechnicianProfile.user_id)
        .join(AppUser, AppUser.id == TechnicianProfile.user_id)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(
            TechnicianProfile.user_id == row.technician_user_id,
            TechnicianProfile.verification_status == "approved",
            AppUser.status == "active",
            UserRole.role_code == "technician",
        )
    )
    if eligible is None:
        return SharingView(state="stopped", freshness="unavailable")
    if row.state != "enabled" or row.location_updated_at is None:
        return SharingView(state=row.state, freshness="unavailable")
    when = row.location_updated_at
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    if datetime.now(UTC) - when > timedelta(minutes=5):
        return SharingView(state=row.state, freshness="stale", location_updated_at=when)
    return SharingView(
        state=row.state,
        freshness="fresh",
        latitude=row.latitude,
        longitude=row.longitude,
        accuracy_meters=row.accuracy_meters,
        location_updated_at=when,
    )


def _audit(session: Session, actor: AppUser, booking: Booking, action: str) -> None:
    record_operations_audit(
        session,
        actor=actor,
        entity_type="booking_location_sharing",
        entity_id=booking.id,
        action=action,
        changed_fields=["sharing_state"],
        is_internal=True,
    )


@router.put(
    "/technician/bookings/{booking_id}/location-sharing", response_model=SharingView
)
def set_sharing(
    booking_id: UUID, request: SharingChoice, actor: Tech, session: DB
) -> SharingView:
    booking = _technician_booking(session, booking_id, actor)
    row = _row(session, booking)
    if row is None:
        row = BookingLocationSharing(
            booking_id=booking.id,
            technician_user_id=actor.id,
            booking_version=booking.version,
            state=request.state,
        )
        session.add(row)
    else:
        row.technician_user_id = actor.id
        row.booking_version = booking.version
        row.state = request.state
    # Re-enabling always requires a new explicit foreground location fix.
    row.latitude = row.longitude = row.accuracy_meters = row.location_updated_at = None
    _audit(session, actor, booking, f"location_sharing.{request.state}")
    session.commit()
    return _view(session, booking, row)


@router.post(
    "/technician/bookings/{booking_id}/location-sharing/location",
    response_model=SharingView,
)
def send_location(
    booking_id: UUID, request: LocationUpdate, actor: Tech, session: DB
) -> SharingView:
    booking = _technician_booking(session, booking_id, actor)
    row = _row(session, booking)
    if (
        not row
        or row.state != "enabled"
        or row.technician_user_id != actor.id
        or row.booking_version != booking.version
    ):
        raise HTTPException(
            status_code=409, detail="Enable sharing for this booking first."
        )
    row.latitude, row.longitude, row.accuracy_meters = (
        request.latitude,
        request.longitude,
        request.accuracy_meters,
    )
    row.location_updated_at = datetime.now(UTC)
    _audit(session, actor, booking, "location_sharing.location_updated")
    session.commit()
    return _view(session, booking, row)


@router.get(
    "/technician/bookings/{booking_id}/location-sharing", response_model=SharingView
)
def technician_read(booking_id: UUID, actor: Tech, session: DB) -> SharingView:
    booking = _technician_booking(session, booking_id, actor)
    return _view(session, booking, _row(session, booking))


@router.get(
    "/customer/bookings/{booking_id}/technician-location", response_model=SharingView
)
def customer_read(booking_id: UUID, actor: Customer, session: DB) -> SharingView:
    booking = _booking(session, booking_id)
    if booking.customer_user_id != actor.id:
        raise HTTPException(status_code=404, detail="Booking unavailable.")
    result = _view(session, booking, _row(session, booking))
    _audit(session, actor, booking, "location_sharing.customer_read")
    session.commit()
    return result


@router.get(
    "/admin/bookings/{booking_id}/technician-location", response_model=SharingView
)
def admin_read(booking_id: UUID, actor: Admin, session: DB) -> SharingView:
    booking = _booking(session, booking_id)
    result = _view(session, booking, _row(session, booking))
    _audit(session, actor, booking, "location_sharing.admin_read")
    session.commit()
    return result
