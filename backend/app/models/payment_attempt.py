"""Non-charging simulated payment attempts, pending only until verification exists."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulatedPaymentAttempt(Base):
    __tablename__ = "simulated_payment_attempts"
    __table_args__ = (
        UniqueConstraint("intent_id", name="uq_sim_attempt_intent"),
        UniqueConstraint(
            "provider", "provider_reference", name="uq_sim_attempt_provider_ref"
        ),
        UniqueConstraint("intent_id", "idempotency_key", name="uq_sim_attempt_key"),
        CheckConstraint("provider = 'mock'", name="ck_sim_attempt_provider"),
        CheckConstraint("currency = 'INR'", name="ck_sim_attempt_currency"),
        CheckConstraint("amount_paise > 0", name="ck_sim_attempt_amount"),
        CheckConstraint("state IN ('pending_verification', 'verified_success_simulation', 'verified_failure_simulation', 'verified_cancelled_simulation', 'verified_expired_simulation')", name="ck_sim_attempt_state"),
        Index("ix_sim_attempt_created", "created_at"),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    intent_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("simulated_payment_intents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    idempotency_key: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(80), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failure_reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
