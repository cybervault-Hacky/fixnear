"""Process authenticated simulated notifications in one database transaction."""

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingQuote,
    MockWebhookEvent,
    SimulatedPaymentAttempt,
    SimulatedPaymentIntent,
)


class MockEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    attempt_id: UUID
    provider_reference: str
    outcome: Literal["success", "failure", "cancellation", "expiration", "delayed"]
    simulated: StrictBool


OUTCOMES = {
    "success": "verified_success_simulation",
    "failure": "verified_failure_simulation",
    "cancellation": "verified_cancelled_simulation",
    "expiration": "verified_expired_simulation",
}


def process_mock_event(
    session: Session, event: MockEvent, body: bytes, timestamp: int
) -> str:
    """Flush event first; apply result and event status in same commit. Never settle money."""
    digest = hashlib.sha256(body).hexdigest()
    old = session.get(MockWebhookEvent, event.event_id)
    if old:
        return "duplicate" if old.body_hash == digest else "conflict"
    # Find the booking without locking, then acquire locks in the booking -> intent -> attempt order.
    attempt = session.get(SimulatedPaymentAttempt, event.attempt_id)
    intent = session.get(SimulatedPaymentIntent, attempt.intent_id) if attempt else None
    booking = None
    if intent:
        booking = session.scalar(
            select(Booking)
            .where(Booking.id == intent.booking_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        intent = session.scalar(
            select(SimulatedPaymentIntent)
            .where(SimulatedPaymentIntent.id == intent.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        attempt = session.scalar(
            select(SimulatedPaymentAttempt)
            .where(SimulatedPaymentAttempt.id == event.attempt_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    record = MockWebhookEvent(
        id=event.event_id,
        provider="mock",
        provider_reference=event.provider_reference,
        attempt_reference=event.attempt_id,
        attempt_id=attempt.id if attempt else None,
        outcome=event.outcome,
        event_created_at=datetime.fromtimestamp(timestamp, UTC),
        signature_verified=True,
        processing_state="received",
        processing_attempts=0,
        body_hash=digest,
    )
    session.add(record)
    try:
        session.flush()  # unique event id; a duplicate transaction cannot create another event
        now = datetime.now(UTC)
        record.processing_attempts = 1
        reason = None
        if not attempt or not intent or not booking:
            reason = "unknown_attempt"
        elif (
            attempt.provider != "mock"
            or attempt.provider_reference != event.provider_reference
        ):
            reason = "reference_mismatch"
        elif (
            booking.customer_user_id != intent.customer_user_id
            or attempt.intent_id != intent.id
            or attempt.amount_paise != intent.amount_paise
            or attempt.currency != intent.currency
        ):
            reason = "snapshot_mismatch"
        elif attempt.state != "pending_verification":
            reason = "terminal_attempt"
        else:
            quote = session.scalar(
                select(BookingQuote).where(
                    BookingQuote.id == intent.quote_id,
                    BookingQuote.booking_id == booking.id,
                    BookingQuote.is_current.is_(True),
                )
            )
            expires = (
                quote.expires_at
                if quote and quote.expires_at.tzinfo
                else (quote.expires_at.replace(tzinfo=UTC) if quote else None)
            )
            if (
                booking.status != "approved"
                or not quote
                or quote.status != "approved"
                or quote.version != intent.quote_version
                or quote.total_paise != intent.amount_paise
                or quote.currency != intent.currency
                or quote.decision_by_user_id != intent.customer_user_id
                or not expires
                or expires <= now
            ):
                reason = "quote_or_booking_ineligible"
        if reason:
            record.processing_state = "rejected"
            record.failure_reason_code = reason
        else:
            record.processing_state = "processed"
            if event.outcome != "delayed":
                attempt.state = OUTCOMES[event.outcome]
                attempt.verified_at = now
                if event.outcome != "success":
                    attempt.failure_reason_code = f"mock_{event.outcome}"
        record.processed_at = now
        session.commit()
        return "accepted"
    except IntegrityError:
        session.rollback()
        old = session.get(MockWebhookEvent, event.event_id)
        if old:
            return "duplicate" if old.body_hash == digest else "conflict"
        raise
