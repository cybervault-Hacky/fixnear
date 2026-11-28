"""Non-charging, persistent simulation intent. Capture is not implemented."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulatedPaymentIntent(Base):
    __tablename__ = "simulated_payment_intents"
    __table_args__ = (
        UniqueConstraint(
            "customer_user_id", "idempotency_key", name="uq_sim_payment_customer_key"
        ),
        UniqueConstraint("quote_id", name="uq_sim_payment_quote"),
        CheckConstraint("amount_paise > 0", name="ck_sim_payment_amount_positive"),
        CheckConstraint("quote_version > 0", name="ck_sim_payment_quote_version"),
        CheckConstraint("currency = 'INR'", name="ck_sim_payment_currency"),
        CheckConstraint("status = 'draft_simulation'", name="ck_sim_payment_status"),
        Index("ix_sim_payment_customer_created", "customer_user_id", "created_at"),
        Index("ix_sim_payment_booking", "booking_id"),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quote_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("booking_quotes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quote_version: Mapped[int] = mapped_column(Integer, nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'INR'")
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'draft_simulation'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
