"""Manual, database-backed delivery processing; external adapters are simulations only.

Claim and completion must be committed separately. A lease token fences stale workers.
Only deterministic local adapters are permitted; this is not an exactly-once external sender.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.models.notification_delivery import (
    NotificationDelivery,
    NotificationDeliveryAttempt,
)

LEASE_SECONDS = 120
MAX_DELAY_SECONDS = 3600


@dataclass(frozen=True)
class DeliveryResult:
    success: bool
    reason: str | None = None


class DeliveryAdapter(Protocol):
    def deliver(self, idempotency_key: str) -> DeliveryResult: ...


class SimulatedAdapter:
    """Never uses addresses, tokens, credentials or network. Result is explicitly simulated."""

    def __init__(self, *, succeed: bool = True):
        self.succeed = succeed

    def deliver(self, idempotency_key: str) -> DeliveryResult:
        return DeliveryResult(
            self.succeed, None if self.succeed else "simulated_failure"
        )


def backoff(attempt: int) -> timedelta:
    return timedelta(
        seconds=min(MAX_DELAY_SECONDS, 30 * 2 ** min(max(attempt - 1, 0), 16))
    )


def enqueue(
    session: Session, notification_id: UUID, channel: str, key: str
) -> NotificationDelivery:
    if (
        channel not in {"in_app", "email", "sms", "web_push", "mobile_push"}
        or not key
        or len(key) > 120
    ):
        raise ValueError("Invalid delivery")
    existing = session.scalar(
        select(NotificationDelivery).where(NotificationDelivery.idempotency_key == key)
    )
    if existing is not None:
        if existing.notification_id != notification_id or existing.channel != channel:
            raise ValueError("Idempotency key already used")
        return existing
    item = NotificationDelivery(
        id=uuid4(),
        notification_id=notification_id,
        channel=channel,
        idempotency_key=key,
        state="pending",
        attempt_count=0,
        max_attempts=3,
    )
    session.add(item)
    return item


def claim(
    session: Session, delivery_id: UUID, now: datetime | None = None
) -> UUID | None:
    now = now or datetime.now(UTC)
    token = uuid4()
    result = session.execute(
        update(NotificationDelivery)
        .execution_options(synchronize_session="fetch")
        .where(
            NotificationDelivery.id == delivery_id,
            NotificationDelivery.state.in_(["pending", "retry_pending"]),
            NotificationDelivery.attempt_count < NotificationDelivery.max_attempts,
            or_(
                NotificationDelivery.next_attempt_at.is_(None),
                NotificationDelivery.next_attempt_at <= now,
            ),
        )
        .values(
            state="processing",
            attempt_count=NotificationDelivery.attempt_count + 1,
            last_attempt_at=now,
            lease_token=token,
            lease_expires_at=now + timedelta(seconds=LEASE_SECONDS),
            next_attempt_at=None,
            failure_reason=None,
        )
    )
    if result.rowcount != 1:
        session.rollback()
        return None
    item = session.get(NotificationDelivery, delivery_id)
    assert item is not None
    session.add(
        NotificationDeliveryAttempt(
            delivery_id=delivery_id,
            attempt_number=item.attempt_count,
            outcome="processing",
            started_at=now,
        )
    )
    session.commit()
    return token


def finish(
    session: Session,
    delivery_id: UUID,
    token: UUID,
    result: DeliveryResult,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.now(UTC)
    item = session.scalar(
        select(NotificationDelivery)
        .where(NotificationDelivery.id == delivery_id)
        .with_for_update()
    )
    if item is None or item.state != "processing" or item.lease_token != token:
        session.rollback()
        return False
    # Do not persist provider-supplied free text or exception messages.
    reason = None if result.success else "simulated_failure"
    state = (
        "delivered"
        if result.success
        else (
            "permanently_failed"
            if item.attempt_count >= item.max_attempts
            else "retry_pending"
        )
    )
    next_at = now + backoff(item.attempt_count) if state == "retry_pending" else None
    updated = session.execute(
        update(NotificationDelivery)
        .execution_options(synchronize_session="fetch")
        .where(
            NotificationDelivery.id == delivery_id,
            NotificationDelivery.state == "processing",
            NotificationDelivery.lease_token == token,
        )
        .values(
            state=state,
            next_attempt_at=next_at,
            failure_reason=reason,
            lease_token=None,
            lease_expires_at=None,
        )
    )
    if updated.rowcount != 1:
        session.rollback()
        return False
    attempt = session.scalar(
        select(NotificationDeliveryAttempt).where(
            NotificationDeliveryAttempt.delivery_id == delivery_id,
            NotificationDeliveryAttempt.attempt_number == item.attempt_count,
        )
    )
    assert attempt is not None
    attempt.outcome = (
        "simulated_success"
        if result.success and item.channel != "in_app"
        else ("delivered" if result.success else "simulated_failure")
    )
    attempt.failure_reason = reason
    attempt.finished_at = now
    session.commit()
    return True


def recover_expired(session: Session, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    ids = list(
        session.scalars(
            select(NotificationDelivery.id).where(
                NotificationDelivery.state == "processing",
                NotificationDelivery.lease_expires_at <= now,
            )
        )
    )
    recovered = 0
    for item_id in ids:
        item = session.get(NotificationDelivery, item_id)
        if item is None:
            continue
        token = item.lease_token
        next_state = (
            "permanently_failed"
            if item.attempt_count >= item.max_attempts
            else "retry_pending"
        )
        result = session.execute(
            update(NotificationDelivery)
            .execution_options(synchronize_session="fetch")
            .where(
                NotificationDelivery.id == item_id,
                NotificationDelivery.state == "processing",
                NotificationDelivery.lease_token == token,
                NotificationDelivery.lease_expires_at <= now,
            )
            .values(
                state=next_state,
                failure_reason="worker_interrupted",
                next_attempt_at=now + backoff(item.attempt_count)
                if next_state == "retry_pending"
                else None,
                lease_token=None,
                lease_expires_at=None,
            )
        )
        if result.rowcount:
            attempt = session.scalar(
                select(NotificationDeliveryAttempt).where(
                    NotificationDeliveryAttempt.delivery_id == item_id,
                    NotificationDeliveryAttempt.attempt_number == item.attempt_count,
                )
            )
            if attempt:
                attempt.outcome = "interrupted"
                attempt.failure_reason = "worker_interrupted"
                attempt.finished_at = now
            recovered += 1
    session.commit()
    return recovered


def process_one(session: Session, delivery_id: UUID, adapter: DeliveryAdapter) -> bool:
    token = claim(session, delivery_id)
    if token is None:
        return False
    item = session.get(NotificationDelivery, delivery_id)
    assert item is not None
    try:
        result = adapter.deliver(item.idempotency_key)
    except Exception:  # noqa: BLE001 - contain adapter errors without leaking details
        result = DeliveryResult(False, "simulated_failure")
    return finish(session, delivery_id, token, result)
