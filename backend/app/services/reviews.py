"""Verified customer reviews, moderation, and rating aggregates."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    Booking,
    CustomerProfile,
    Review,
    ReviewReport,
    TechnicianProfile,
)
from app.services.operations_audit import record_operations_audit

EDIT_WINDOW = timedelta(days=30)


def _error(code: str, message: str, status_code: int = status.HTTP_409_CONFLICT) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _not_found() -> HTTPException:
    return _error("review_not_found", "Review not found.", status.HTTP_404_NOT_FOUND)


def _customer_label(display_name: str | None) -> str:
    if not display_name:
        return "Verified customer"
    parts = display_name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def _technician_name(session: Session, technician_user_id: UUID) -> str:
    name = session.scalar(
        select(TechnicianProfile.display_name).where(
            TechnicianProfile.user_id == technician_user_id
        )
    )
    return name or "FixNear technician"


def _as_utc(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _review_payload(session: Session, review: Review) -> dict[str, object]:
    customer = session.scalar(
        select(CustomerProfile.display_name).where(CustomerProfile.user_id == review.customer_user_id)
    )
    return {
        "id": review.id,
        "booking_id": review.booking_id,
        "technician_user_id": review.technician_user_id,
        "technician_display_name": _technician_name(session, review.technician_user_id),
        "service_slug": review.service_slug_snapshot,
        "rating": review.rating,
        "service_quality": review.service_quality,
        "professionalism": review.professionalism,
        "timeliness": review.timeliness,
        "communication": review.communication,
        "feedback": review.feedback,
        "status": review.status,
        "customer_label": _customer_label(customer),
        "edited": bool(
            _as_utc(review.updated_at) and _as_utc(review.created_at)
            and _as_utc(review.updated_at) > _as_utc(review.created_at)
        ),
        "created_at": review.created_at,
        "updated_at": review.updated_at,
    }


def _admin_review_payload(session: Session, review: Review, report_count: int) -> dict[str, object]:
    payload = _review_payload(session, review)
    payload.update(
        {
            "hidden_reason": review.hidden_reason,
            "hidden_at": review.hidden_at,
            "report_count": report_count,
        }
    )
    return payload


def _completed_booking(session: Session, actor: AppUser, booking_id: UUID) -> Booking:
    booking = session.scalar(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.customer_user_id == actor.id,
        )
    )
    if booking is None:
        raise _error("booking_not_found", "Booking not found.", status.HTTP_404_NOT_FOUND)
    return booking


def _report_counts(session: Session, review_ids: list[UUID]) -> dict[UUID, int]:
    if not review_ids:
        return {}
    rows = session.execute(
        select(ReviewReport.review_id, func.count())
        .where(ReviewReport.review_id.in_(review_ids))
        .group_by(ReviewReport.review_id)
    ).all()
    return {review_id: int(count) for review_id, count in rows}


def create_review(
    session: Session,
    actor: AppUser,
    *,
    booking_id: UUID,
    rating: int,
    feedback: str,
    service_quality: int | None = None,
    professionalism: int | None = None,
    timeliness: int | None = None,
    communication: int | None = None,
) -> Review:
    booking = _completed_booking(session, actor, booking_id)
    if booking.status != "completed":
        raise _error(
            "booking_not_completed",
            "Only completed bookings can be reviewed.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if booking.assigned_technician_user_id is None:
        raise _error(
            "booking_unassigned",
            "This booking has no technician to review.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    existing = session.scalar(select(Review).where(Review.booking_id == booking.id))
    if existing is not None:
        raise _error(
            "review_already_exists",
            "You already reviewed this booking. Edits are possible within 30 days.",
        )

    review = Review(
        booking_id=booking.id,
        customer_user_id=actor.id,
        technician_user_id=booking.assigned_technician_user_id,
        service_slug_snapshot=booking.service_slug_snapshot,
        rating=rating,
        service_quality=service_quality,
        professionalism=professionalism,
        timeliness=timeliness,
        communication=communication,
        feedback=feedback,
    )
    session.add(review)
    try:
        with session.begin_nested():
            session.flush()
    except IntegrityError as exc:
        raise _error(
            "review_already_exists",
            "You already reviewed this booking.",
        ) from exc
    return review


def review_payload(session: Session, review: Review) -> dict[str, object]:
    return _review_payload(session, review)


def update_review(
    session: Session,
    actor: AppUser,
    *,
    review_id: UUID,
    changes: dict[str, object],
) -> dict[str, object]:
    review = session.scalar(
        select(Review).where(Review.id == review_id, Review.customer_user_id == actor.id)
    )
    if review is None:
        raise _not_found()
    if review.status != "published":
        raise _error(
            "review_not_editable",
            "This review is not editable.",
        )
    created_at = _as_utc(review.created_at)
    if created_at is None or datetime.now(UTC) - created_at > EDIT_WINDOW:
        raise _error(
            "review_edit_window_closed",
            "Reviews can only be edited within 30 days of submission.",
        )
    for field, value in changes.items():
        setattr(review, field, value)
    review.updated_at = datetime.now(UTC)
    session.flush()
    return _review_payload(session, review)


def list_my_reviews(session: Session, actor: AppUser) -> dict[str, object]:
    reviews = list(
        session.scalars(
            select(Review)
            .where(Review.customer_user_id == actor.id)
            .order_by(Review.created_at.desc())
        ).all()
    )
    return {"items": [_review_payload(session, item) for item in reviews], "total": len(reviews)}


def list_eligible_bookings(session: Session, actor: AppUser) -> list[dict[str, object]]:
    reviewed = select(Review.booking_id)
    bookings = list(
        session.scalars(
            select(Booking)
            .where(
                Booking.customer_user_id == actor.id,
                Booking.status == "completed",
                Booking.assigned_technician_user_id.is_not(None),
                Booking.id.not_in(reviewed),
            )
            .order_by(Booking.created_at.desc())
        ).all()
    )
    return [
        {
            "booking_id": booking.id,
            "service_slug": booking.service_slug_snapshot,
            "preferred_date": booking.preferred_date,
            "technician_user_id": booking.assigned_technician_user_id,
            "technician_display_name": _technician_name(
                session, booking.assigned_technician_user_id
            )
            if booking.assigned_technician_user_id
            else "FixNear technician",
        }
        for booking in bookings
    ]


def list_technician_reviews(session: Session, actor: AppUser) -> dict[str, object]:
    reviews = list(
        session.scalars(
            select(Review)
            .where(Review.technician_user_id == actor.id, Review.status == "published")
            .order_by(Review.created_at.desc())
        ).all()
    )
    return {"items": [_review_payload(session, item) for item in reviews], "total": len(reviews)}


def technician_rating_summary(session: Session, technician_user_id: UUID) -> dict[str, object]:
    row = session.execute(
        select(func.count(), func.avg(Review.rating)).where(
            Review.technician_user_id == technician_user_id,
            Review.status == "published",
        )
    ).one()
    count = int(row[0] or 0)
    average = round(float(row[1]), 1) if row[1] is not None else None
    return {"published_review_count": count, "average_rating": average}


def report_review(
    session: Session,
    actor: AppUser,
    *,
    review_id: UUID,
    reason: str,
    note: str | None,
) -> dict[str, object]:
    review = session.get(Review, review_id)
    if review is None:
        raise _not_found()
    if review.customer_user_id == actor.id:
        raise _error("review_report_own", "You cannot report your own review.", status.HTTP_422_UNPROCESSABLE_CONTENT)
    report = ReviewReport(
        review_id=review.id,
        reporter_user_id=actor.id,
        reason=reason,
        note=note,
    )
    session.add(report)
    try:
        with session.begin_nested():
            session.flush()
    except IntegrityError as exc:
        raise _error("review_report_duplicate", "You already reported this review.") from exc
    return {
        "id": report.id,
        "review_id": report.review_id,
        "reporter_user_id": report.reporter_user_id,
        "reason": report.reason,
        "note": report.note,
        "status": report.status,
        "created_at": report.created_at,
    }


def list_reports(
    session: Session,
    *,
    status_filter: str | None,
    limit: int,
    offset: int,
) -> dict[str, object]:
    statement = select(ReviewReport)
    if status_filter:
        statement = statement.where(ReviewReport.status == status_filter)
    count_statement = select(func.count()).select_from(ReviewReport)
    if status_filter:
        count_statement = count_statement.where(ReviewReport.status == status_filter)
    total = int(session.scalar(count_statement) or 0)
    reports = list(
        session.scalars(
            statement.order_by(ReviewReport.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return {
        "items": [
            {
                "id": report.id,
                "review_id": report.review_id,
                "reporter_user_id": report.reporter_user_id,
                "reason": report.reason,
                "note": report.note,
                "status": report.status,
                "created_at": report.created_at,
            }
            for report in reports
        ],
        "total": total,
    }


def resolve_report(
    session: Session,
    actor: AppUser,
    *,
    report_id: UUID,
    new_status: str,
) -> dict[str, object]:
    report = session.get(ReviewReport, report_id)
    if report is None:
        raise _error("review_report_not_found", "Report not found.", status.HTTP_404_NOT_FOUND)
    if new_status == report.status:
        raise _error("report_already_resolved", "This report is already in that state.")
    previous = report.status
    report.status = new_status
    record_operations_audit(
        session,
        actor=actor,
        entity_type="review_report",
        entity_id=report.id,
        action="review_report.resolved",
        changed_fields=["status"],
        note=f"{previous} -> {new_status}",
        is_internal=True,
    )
    session.flush()
    return {
        "id": report.id,
        "review_id": report.review_id,
        "reporter_user_id": report.reporter_user_id,
        "reason": report.reason,
        "note": report.note,
        "status": report.status,
        "created_at": report.created_at,
    }


def list_admin_reviews(
    session: Session,
    *,
    status_filter: str | None,
    limit: int,
    offset: int,
) -> dict[str, object]:
    statement = select(Review)
    if status_filter:
        statement = statement.where(Review.status == status_filter)
    count_statement = select(func.count()).select_from(Review)
    if status_filter:
        count_statement = count_statement.where(Review.status == status_filter)
    total = int(session.scalar(count_statement) or 0)
    reviews = list(
        session.scalars(
            statement.order_by(Review.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    counts = _report_counts(session, [review.id for review in reviews])
    return {
        "items": [_admin_review_payload(session, review, counts.get(review.id, 0)) for review in reviews],
        "total": total,
    }


def hide_review(
    session: Session,
    actor: AppUser,
    *,
    review_id: UUID,
    reason: str,
) -> dict[str, object]:
    review = session.get(Review, review_id)
    if review is None:
        raise _not_found()
    if review.status == "hidden":
        raise _error("review_already_hidden", "This review is already hidden.")
    review.status = "hidden"
    review.hidden_reason = reason
    review.hidden_by = actor.id
    review.hidden_at = datetime.now(UTC)
    record_operations_audit(
        session,
        actor=actor,
        entity_type="review",
        entity_id=review.id,
        action="review.hidden",
        changed_fields=["status"],
        note=reason,
        is_internal=True,
    )
    session.flush()
    return _admin_review_payload(session, review, _report_counts(session, [review.id]).get(review.id, 0))


def restore_review(
    session: Session,
    actor: AppUser,
    *,
    review_id: UUID,
    reason: str,
) -> dict[str, object]:
    review = session.get(Review, review_id)
    if review is None:
        raise _not_found()
    if review.status == "published":
        raise _error("review_already_published", "This review is already published.")
    previous_reason = review.hidden_reason
    review.status = "published"
    review.hidden_reason = None
    review.hidden_by = None
    review.hidden_at = None
    record_operations_audit(
        session,
        actor=actor,
        entity_type="review",
        entity_id=review.id,
        action="review.restored",
        changed_fields=["status"],
        note=f"{reason} (hidden: {previous_reason or 'n/a'})"[:1000],
        is_internal=True,
    )
    session.flush()
    return _admin_review_payload(session, review, _report_counts(session, [review.id]).get(review.id, 0))
