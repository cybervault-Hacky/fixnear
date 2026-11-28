"""Durable, non-financial mock webhook processing records."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MockWebhookEvent(Base):
    __tablename__ = "mock_webhook_events"
    __table_args__ = (
        CheckConstraint("provider = 'mock'", name="ck_mock_event_provider"),
        CheckConstraint(
            "outcome IN ('success', 'failure', 'cancellation', 'expiration', 'delayed')",
            name="ck_mock_event_outcome",
        ),
        CheckConstraint(
            "processing_state IN ('received', 'processed', 'rejected')",
            name="ck_mock_event_state",
        ),
        CheckConstraint("processing_attempts >= 0", name="ck_mock_event_attempts"),
        Index("ix_mock_event_attempt", "attempt_id"),
        Index("ix_mock_event_received", "received_at"),
    )
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(80), nullable=False)
    attempt_reference: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    attempt_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("simulated_payment_attempts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    event_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    signature_verified: Mapped[bool] = mapped_column(Boolean, nullable=False)
    processing_state: Mapped[str] = mapped_column(String(16), nullable=False)
    processing_attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failure_reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    body_hash: Mapped[str] = mapped_column(String(64), nullable=False)
