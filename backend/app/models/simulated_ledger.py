"""Disconnected simulated accounting journals; never real financial accounts."""

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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulatedAccount(Base):
    __tablename__ = "simulated_ledger_accounts"
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'INR'")
    )
    __table_args__ = (
        CheckConstraint("currency = 'INR'", name="ck_sim_account_currency"),
    )


class SimulatedJournal(Base):
    __tablename__ = "simulated_ledger_journals"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_sim_journal_event"),
        UniqueConstraint("reversal_of_id", name="uq_sim_journal_reversal"),
        CheckConstraint("state IN ('draft', 'posted')", name="ck_sim_journal_state"),
        CheckConstraint("currency = 'INR'", name="ck_sim_journal_currency"),
        Index("ix_sim_journal_created", "created_at"),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    event_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("mock_webhook_events.id", ondelete="RESTRICT")
    )
    reversal_of_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("simulated_ledger_journals.id", ondelete="RESTRICT"),
    )
    state: Mapped[str] = mapped_column(
        String(8), nullable=False, server_default=text("'draft'")
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'INR'")
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SimulatedLedgerEntry(Base):
    __tablename__ = "simulated_ledger_entries"
    __table_args__ = (
        CheckConstraint(
            "(debit_paise > 0 AND credit_paise = 0) OR (credit_paise > 0 AND debit_paise = 0)",
            name="ck_sim_entry_one_side",
        ),
        Index("ix_sim_entry_journal", "journal_id"),
        Index("ix_sim_entry_account", "account_id"),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    journal_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("simulated_ledger_journals.id", ondelete="RESTRICT"),
        nullable=False,
    )
    account_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("simulated_ledger_accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    debit_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    credit_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
