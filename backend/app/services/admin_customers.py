"""Admin customer management: search, detail, and audited status changes."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Appliance,
    AppUser,
    Booking,
    CustomerProfile,
    Review,
    SupportTicket,
    UserRole,
    WarrantyClaim,
    WarrantyRecord,
)
from app.schemas.accounts import AccountStatus
from app.services.admin_user_management import change_user_status


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "Customer not found."},
    )


def _require_customer(session: Session, user_id: UUID) -> AppUser:
    user = session.scalar(
        select(AppUser)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(AppUser.id == user_id, UserRole.role_code == "customer")
    )
    if user is None:
        raise _not_found()
    return user


def list_customers(
    session: Session,
    *,
    search: str | None,
    account_status: str | None,
    limit: int,
    offset: int,
) -> dict[str, object]:
    statement = (
        select(AppUser, CustomerProfile.display_name)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == AppUser.id)
        .where(UserRole.role_code == "customer")
    )
    conditions = []
    if account_status:
        conditions.append(AppUser.status == account_status)
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                AppUser.email.ilike(pattern),
                CustomerProfile.display_name.ilike(pattern),
            )
        )

    count_statement = (
        select(func.count())
        .select_from(AppUser)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == AppUser.id)
        .where(UserRole.role_code == "customer")
    )
    for condition in conditions:
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)

    total = int(session.scalar(count_statement) or 0)
    rows = session.execute(
        statement.order_by(AppUser.created_at.desc()).limit(limit).offset(offset)
    ).all()

    items = []
    for user, display_name in rows:
        booking_count, last_booking = session.execute(
            select(func.count(), func.max(Booking.created_at)).where(
                Booking.customer_user_id == user.id
            )
        ).one()
        roles = session.scalars(
            select(UserRole.role_code).where(UserRole.user_id == user.id)
        ).all()
        items.append(
            {
                "user_id": user.id,
                "email": user.email,
                "display_name": display_name,
                "account_status": user.status,
                "role_codes": list(roles),
                "created_at": user.created_at,
                "bookings_total": int(booking_count or 0),
                "last_booking_at": last_booking,
            }
        )
    return {"items": items, "total": total}


def get_customer_detail(session: Session, user_id: UUID) -> dict[str, object]:
    user = _require_customer(session, user_id)
    profile = session.get(CustomerProfile, user.id)

    bookings = list(
        session.scalars(
            select(Booking)
            .where(Booking.customer_user_id == user.id)
            .order_by(Booking.created_at.desc())
        ).all()
    )
    completed = sum(1 for booking in bookings if booking.status == "completed")
    cancelled = sum(1 for booking in bookings if booking.status == "cancelled")

    reviews_submitted = int(
        session.scalar(
            select(func.count()).select_from(Review).where(Review.customer_user_id == user.id)
        )
        or 0
    )
    open_tickets = int(
        session.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(
                SupportTicket.customer_user_id == user.id,
                SupportTicket.status.in_(
                    ("open", "assigned", "in_progress", "waiting_for_customer")
                ),
            )
        )
        or 0
    )
    appliance_count = int(
        session.scalar(
            select(func.count()).select_from(Appliance).where(Appliance.customer_user_id == user.id)
        )
        or 0
    )
    warranty_count = int(
        session.scalar(
            select(func.count())
            .select_from(WarrantyRecord)
            .where(WarrantyRecord.customer_user_id == user.id)
        )
        or 0
    )
    claims_open = int(
        session.scalar(
            select(func.count())
            .select_from(WarrantyClaim)
            .where(
                WarrantyClaim.customer_user_id == user.id,
                WarrantyClaim.status.in_(
                    ("submitted", "additional_information_requested", "under_review")
                ),
            )
        )
        or 0
    )
    tickets = list(
        session.scalars(
            select(SupportTicket)
            .where(SupportTicket.customer_user_id == user.id)
            .order_by(SupportTicket.created_at.desc())
            .limit(5)
        ).all()
    )
    roles = session.scalars(select(UserRole.role_code).where(UserRole.user_id == user.id)).all()

    return {
        "user_id": user.id,
        "email": user.email,
        "display_name": profile.display_name if profile else None,
        "phone_e164": profile.phone_e164 if profile else None,
        "account_status": user.status,
        "role_codes": list(roles),
        "created_at": user.created_at,
        "bookings_total": len(bookings),
        "bookings_completed": completed,
        "bookings_cancelled": cancelled,
        "reviews_submitted": reviews_submitted,
        "open_tickets": open_tickets,
        "appliance_count": appliance_count,
        "warranty_count": warranty_count,
        "recent_bookings": [
            {
                "id": booking.id,
                "service_slug": booking.service_slug_snapshot,
                "status": booking.status,
                "preferred_date": booking.preferred_date,
                "created_at": booking.created_at,
            }
            for booking in bookings[:10]
        ],
        "recent_tickets": [
            {
                "id": ticket.id,
                "category": ticket.category,
                "subject": ticket.subject,
                "status": ticket.status,
                "created_at": ticket.created_at,
            }
            for ticket in tickets
        ],
        "open_warranty_claims": claims_open,
    }


def set_customer_status(
    session: Session,
    actor: AppUser,
    *,
    user_id: UUID,
    new_status: AccountStatus,
    reason: str,
):
    if new_status not in (AccountStatus.SUSPENDED, AccountStatus.ACTIVE):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "invalid_status",
                "message": "Only suspension or reactivation is supported here.",
            },
        )
    _require_customer(session, user_id)
    return change_user_status(
        session,
        actor=actor,
        subject_id=user_id,
        new_status=new_status,
        reason=reason,
    )
