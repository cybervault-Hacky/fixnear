"""Draft-only simulation; no provider, callback, capture, refund or money movement."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.authorization import require_customer_role
from app.db.session import get_db_session
from app.models import (
    AppUser,
    Booking,
    BookingQuote,
    SimulatedPaymentAttempt,
    SimulatedPaymentIntent,
)
from app.services.mock_payment_provider import MockPaymentProvider

router = APIRouter(
    prefix="/customer/simulated-payments", tags=["simulated payment drafts"]
)
Customer = Annotated[AppUser, Depends(require_customer_role)]
DB = Annotated[Session, Depends(get_db_session)]
Key = Annotated[UUID, Header(alias="Idempotency-Key")]


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_id: UUID
    quote_id: UUID


class DraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    booking_id: UUID
    quote_id: UUID
    quote_version: int
    amount_paise: int
    currency: str
    status: str
    created_at: datetime


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=409, detail="Simulation draft unavailable or idempotency conflict."
    )


@router.post("", response_model=DraftResponse)
def create_draft(
    request: DraftRequest, actor: Customer, session: DB, key: Key
) -> SimulatedPaymentIntent:
    # Same lock order as PriceLock decisions, revisions and booking cancellation.
    booking = session.scalar(
        select(Booking)
        .where(Booking.id == request.booking_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if booking is None or booking.customer_user_id != actor.id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    existing = session.scalar(
        select(SimulatedPaymentIntent).where(
            SimulatedPaymentIntent.customer_user_id == actor.id,
            SimulatedPaymentIntent.idempotency_key == key,
        )
    )
    if existing is not None:
        if (
            existing.booking_id != request.booking_id
            or existing.quote_id != request.quote_id
        ):
            raise _conflict()
        return existing
    quote = session.scalar(
        select(BookingQuote).where(
            BookingQuote.id == request.quote_id,
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
        )
    )
    if (
        quote is None
        or booking.status != "approved"
        or quote.status != "approved"
        or quote.decision_by_user_id != actor.id
        or quote.currency != "INR"
        or quote.total_paise <= 0
    ):
        raise _conflict()
    expires = quote.expires_at
    if expires.tzinfo is None:  # SQLite stores naive UTC timestamps.
        expires = expires.replace(tzinfo=UTC)
    if expires <= datetime.now(UTC):
        raise _conflict()
    if (
        session.scalar(
            select(SimulatedPaymentIntent.id).where(
                SimulatedPaymentIntent.quote_id == quote.id
            )
        )
        is not None
    ):
        raise _conflict()
    result = SimulatedPaymentIntent(
        customer_user_id=actor.id,
        booking_id=booking.id,
        quote_id=quote.id,
        quote_version=quote.version,
        amount_paise=quote.total_paise,
        currency="INR",
        status="draft_simulation",
        idempotency_key=key,
    )
    session.add(result)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        # A concurrent request may have won. Retrying the same key is safe.
        result = session.scalar(
            select(SimulatedPaymentIntent).where(
                SimulatedPaymentIntent.customer_user_id == actor.id,
                SimulatedPaymentIntent.idempotency_key == key,
            )
        )
        if (
            result is None
            or result.booking_id != request.booking_id
            or result.quote_id != request.quote_id
        ):
            raise _conflict() from None
    return result


@router.get("", response_model=list[DraftResponse])
def list_drafts(actor: Customer, session: DB) -> list[SimulatedPaymentIntent]:
    return list(
        session.scalars(
            select(SimulatedPaymentIntent)
            .where(SimulatedPaymentIntent.customer_user_id == actor.id)
            .order_by(SimulatedPaymentIntent.created_at.desc())
            .limit(100)
        )
    )


@router.get("/{intent_id}", response_model=DraftResponse)
def get_draft(intent_id: UUID, actor: Customer, session: DB) -> SimulatedPaymentIntent:
    result = session.scalar(
        select(SimulatedPaymentIntent).where(
            SimulatedPaymentIntent.id == intent_id,
            SimulatedPaymentIntent.customer_user_id == actor.id,
        )
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Simulation draft not found.")
    return result


class AttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    intent_id: UUID
    provider: str
    provider_reference: str
    amount_paise: int
    currency: str
    state: str
    created_at: datetime
    verified_at: datetime | None
    failure_reason_code: str | None


@router.post("/{intent_id}/attempts", response_model=AttemptResponse)
def initiate_simulated_attempt(
    intent_id: UUID, actor: Customer, session: DB, key: Key
) -> SimulatedPaymentAttempt:
    """Create a pending-only simulation, never a capture or verified payment."""
    intent = session.scalar(
        select(SimulatedPaymentIntent).where(
            SimulatedPaymentIntent.id == intent_id,
            SimulatedPaymentIntent.customer_user_id == actor.id,
        )
    )
    if intent is None:
        raise HTTPException(status_code=404, detail="Simulation draft not found.")
    # Always lock booking before the intent/attempt, matching the booking service.
    booking = session.scalar(
        select(Booking)
        .where(Booking.id == intent.booking_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if booking is None or booking.customer_user_id != actor.id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    intent = session.scalar(
        select(SimulatedPaymentIntent)
        .where(SimulatedPaymentIntent.id == intent_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    existing = session.scalar(
        select(SimulatedPaymentAttempt).where(
            SimulatedPaymentAttempt.intent_id == intent_id
        )
    )
    if existing:
        if existing.idempotency_key != key:
            raise _conflict()
        return existing
    quote = session.scalar(
        select(BookingQuote).where(
            BookingQuote.id == intent.quote_id,
            BookingQuote.booking_id == booking.id,
            BookingQuote.is_current.is_(True),
        )
    )
    if (
        quote is None
        or booking.status != "approved"
        or quote.status != "approved"
        or quote.version != intent.quote_version
        or quote.total_paise != intent.amount_paise
        or quote.currency != intent.currency
        or quote.decision_by_user_id != actor.id
        or intent.status != "draft_simulation"
    ):
        raise _conflict()
    expires = (
        quote.expires_at
        if quote.expires_at.tzinfo
        else quote.expires_at.replace(tzinfo=UTC)
    )
    if expires <= datetime.now(UTC):
        raise _conflict()
    attempt_id = uuid4()
    attempt = SimulatedPaymentAttempt(
        id=attempt_id,
        intent_id=intent.id,
        idempotency_key=key,
        provider="mock",
        provider_reference=MockPaymentProvider().reference(attempt_id),
        amount_paise=intent.amount_paise,
        currency="INR",
        state="pending_verification",
    )
    session.add(attempt)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        attempt = session.scalar(
            select(SimulatedPaymentAttempt).where(
                SimulatedPaymentAttempt.intent_id == intent_id
            )
        )
        if attempt is None or attempt.idempotency_key != key:
            raise _conflict() from None
    return attempt


@router.get("/{intent_id}/attempts", response_model=list[AttemptResponse])
def list_attempts(
    intent_id: UUID, actor: Customer, session: DB
) -> list[SimulatedPaymentAttempt]:
    intent = session.scalar(
        select(SimulatedPaymentIntent).where(
            SimulatedPaymentIntent.id == intent_id,
            SimulatedPaymentIntent.customer_user_id == actor.id,
        )
    )
    if intent is None:
        raise HTTPException(status_code=404, detail="Simulation draft not found.")
    return list(
        session.scalars(
            select(SimulatedPaymentAttempt).where(
                SimulatedPaymentAttempt.intent_id == intent.id
            )
        )
    )
