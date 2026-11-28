"""Server-controlled in-app notifications from selected persisted booking events.

The event and notification are added to the same caller-owned transaction.
No delivery queue or external messaging is implemented.
"""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, BookingEvent, InAppNotification, NotificationPreference
from app.models.notification_delivery import NotificationDelivery

# Static copy only. Never include customer notes, addresses or personal data.
COPY = {
    "booking.created": (
        "booking",
        "Booking requested",
        "Your booking request was recorded.",
        "customer",
    ),
    "booking.assignment.assigned": (
        "booking",
        "Technician assigned",
        "A technician was assigned to the booking.",
        "both",
    ),
    "booking.assignment.reassigned": (
        "booking",
        "Technician reassigned",
        "The booking assignment was updated.",
        "both",
    ),
    "booking.assignment.accepted": (
        "booking",
        "Assignment accepted",
        "The assigned technician accepted the booking.",
        "customer",
    ),
    "booking.assignment.declined": (
        "booking",
        "Assignment declined",
        "The technician declined the assignment. The booking remains open.",
        "customer",
    ),
    "booking.status_changed": (
        "booking",
        "Booking updated",
        "The booking status has changed.",
        "both",
    ),
    "booking.cancelled": (
        "booking",
        "Booking cancelled",
        "The booking was cancelled.",
        "both",
    ),
    "quote.created": (
        "quote",
        "Quote submitted",
        "A quote is ready for your review.",
        "customer",
    ),
    "quote.revised": (
        "quote",
        "Quote revised",
        "A revised quote is ready for your review.",
        "customer",
    ),
    "quote.approved": (
        "quote",
        "Quote approved",
        "The customer approved the quote.",
        "technician",
    ),
    "quote.rejected": (
        "quote",
        "Quote declined",
        "The customer declined the quote.",
        "technician",
    ),
}
CATEGORIES = ("booking", "quote", "warranty", "maintenance", "support", "security")


def create_booking_event_notifications(
    session: Session, booking: Booking, event: BookingEvent
) -> None:
    item = COPY.get(event.event_type)
    if item is None:
        return
    category, title, message, audience = item
    recipients: list[tuple[UUID, str]] = []
    if audience in ("customer", "both"):
        recipients.append((booking.customer_user_id, f"/bookings/{booking.id}"))
    if audience in ("technician", "both") and booking.assigned_technician_user_id:
        recipients.append(
            (booking.assigned_technician_user_id, f"/technician/bookings/{booking.id}")
        )
    seen: set[UUID] = set()
    for user_id, path in recipients:
        if user_id in seen:
            continue
        seen.add(user_id)
        preference = session.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id,
                NotificationPreference.category == category,
            )
        )
        if preference is not None and not preference.enabled:
            continue
        notification_id = uuid4()
        session.add(
            InAppNotification(
                id=notification_id,
                booking_event_id=event.id,
                recipient_user_id=user_id,
                category=category,
                title=title,
                message=message,
                action_path=path,
                state="unread",
            )
        )
        session.flush()  # Persist the event and notification before its dependent delivery.
        session.add(
            NotificationDelivery(
                id=uuid4(),
                notification_id=notification_id,
                idempotency_key=f"in_app:{event.id}:{user_id}",
                channel="in_app",
                state="pending",
                attempt_count=0,
                max_attempts=3,
            )
        )
