"""Database-backed admin overview metrics and chart series.

Every number here comes from a real query over platform tables. Average rating is
null (not zero) when no published reviews exist; chart buckets with no activity are
shown as empty, not fabricated.
"""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingQuote,
    Review,
    SupportTicket,
    TechnicianProfile,
    UserRole,
)
from app.services.admin_audit import recent_activity

ACTIVE_BOOKING_STATUSES = (
    "requested",
    "assigned",
    "accepted",
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
    "in_progress",
)


def _today() -> date:
    return datetime.now(UTC).date()


def _range_start(days: int) -> date:
    return _today() - timedelta(days=days - 1)


def _count_users_with_role(session: Session, role_code: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(UserRole)
            .where(UserRole.role_code == role_code)
        )
        or 0
    )


def build_overview(session: Session, *, days: int = 30) -> dict[str, object]:
    days = max(7, min(days, 90))
    start_date = _range_start(days)
    range_start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)

    total_customers = _count_users_with_role(session, "customer")
    total_technicians = _count_users_with_role(session, "technician")
    verified_technicians = int(
        session.scalar(
            select(func.count())
            .select_from(TechnicianProfile)
            .where(TechnicianProfile.verification_status == "approved")
        )
        or 0
    )
    pending_verifications = int(
        session.scalar(
            select(func.count())
            .select_from(TechnicianProfile)
            .where(TechnicianProfile.verification_status == "pending_review")
        )
        or 0
    )

    booking_counts = dict(
        session.execute(select(Booking.status, func.count()).group_by(Booking.status)).all()
    )
    total_bookings = int(sum(booking_counts.values()))
    active_bookings = int(sum(booking_counts.get(status, 0) for status in ACTIVE_BOOKING_STATUSES))
    completed_bookings = int(booking_counts.get("completed", 0))
    cancelled_bookings = int(booking_counts.get("cancelled", 0))

    quote_counts = dict(
        session.execute(select(BookingQuote.status, func.count()).group_by(BookingQuote.status)).all()
    )
    pending_quotations = int(quote_counts.get("pending", 0))
    approved_quotations = int(quote_counts.get("approved", 0))

    open_support_tickets = int(
        session.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.status.in_(("open", "assigned", "in_progress", "waiting_for_customer")))
        )
        or 0
    )

    rating_row = session.execute(
        select(func.count(), func.avg(Review.rating)).where(Review.status == "published")
    ).one()
    review_count = int(rating_row[0] or 0)
    average_rating = round(float(rating_row[1]), 2) if rating_row[1] is not None else None

    # Booking trend: bucket every booking created within range by UTC date.
    trend_rows = session.execute(
        select(Booking.created_at).where(Booking.created_at >= range_start_dt)
    ).all()
    per_day: Counter[date] = Counter()
    for (created_at,) in trend_rows:
        per_day[created_at.date()] += 1
    booking_trend = [
        {"date": start_date + timedelta(days=offset), "count": per_day[start_date + timedelta(days=offset)]}
        for offset in range(days)
    ]

    status_distribution = [
        {"status": status_value, "count": int(booking_counts.get(status_value, 0))}
        for status_value in (
            "requested",
            "assigned",
            "accepted",
            "inspection_pending",
            "quote_pending",
            "quote_rejected",
            "approved",
            "in_progress",
            "completed",
            "cancelled",
        )
    ]

    category_rows = session.execute(
        select(Booking.service_slug_snapshot, func.count())
        .group_by(Booking.service_slug_snapshot)
        .order_by(func.count().desc(), Booking.service_slug_snapshot)
        .limit(8)
    ).all()
    category_popularity = [
        {"service_slug": slug, "count": int(count)} for slug, count in category_rows
    ]

    # Technician performance: completed bookings + verified rating aggregate.
    performance_rows = session.execute(
        select(
            Booking.assigned_technician_user_id,
            func.count(),
        )
        .where(
            Booking.status == "completed",
            Booking.assigned_technician_user_id.is_not(None),
        )
        .group_by(Booking.assigned_technician_user_id)
        .order_by(func.count().desc())
        .limit(5)
    ).all()
    technician_performance = []
    for technician_user_id, completed in performance_rows:
        rating = session.execute(
            select(func.count(), func.avg(Review.rating)).where(
                Review.technician_user_id == technician_user_id,
                Review.status == "published",
            )
        ).one()
        name = session.scalar(
            select(TechnicianProfile.display_name).where(
                TechnicianProfile.user_id == technician_user_id
            )
        ) or "FixNear technician"
        technician_performance.append(
            {
                "technician_user_id": technician_user_id,
                "display_name": name,
                "completed_bookings": int(completed),
                "average_rating": round(float(rating[1]), 1) if rating[1] is not None else None,
                "review_count": int(rating[0] or 0),
            }
        )

    # Satisfaction trend: weekly average rating over the selected range.
    review_rows = session.execute(
        select(Review.created_at, Review.rating).where(
            Review.status == "published",
            Review.created_at >= range_start_dt,
        )
    ).all()
    weekly: dict[date, list[int]] = defaultdict(list)
    for created_at, rating in review_rows:
        day = created_at.date()
        week_start = day - timedelta(days=day.weekday())
        weekly[week_start].append(int(rating))
    satisfaction_trend = [
        {
            "week_start": week_start,
            "average_rating": round(sum(values) / len(values), 2),
            "review_count": len(values),
        }
        for week_start, values in sorted(weekly.items())
    ]

    return {
        "range_days": days,
        "metrics": {
            "total_customers": total_customers,
            "total_technicians": total_technicians,
            "verified_technicians": verified_technicians,
            "pending_technician_verifications": pending_verifications,
            "total_bookings": total_bookings,
            "active_bookings": active_bookings,
            "completed_bookings": completed_bookings,
            "cancelled_bookings": cancelled_bookings,
            "pending_quotations": pending_quotations,
            "approved_quotations": approved_quotations,
            "open_support_tickets": open_support_tickets,
            "average_rating": average_rating,
            "review_count": review_count,
        },
        "booking_trend": booking_trend,
        "status_distribution": status_distribution,
        "category_popularity": category_popularity,
        "technician_performance": technician_performance,
        "satisfaction_trend": satisfaction_trend,
        "recent_activity": recent_activity(session, limit=8),
    }
