"""Disconnected SQLite ledger prototype tests, not PostgreSQL concurrency evidence."""

from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import SimulatedAccount, SimulatedJournal, SimulatedLedgerEntry
from app.services.simulated_finance import FinanceValidationError, LedgerLine
from app.services.simulated_ledger import (
    post_simulated_journal,
    reverse_simulated_journal,
)
from tests.test_database_migrations import _alembic_config


@pytest.fixture
def ledger_session(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'ledger.sqlite3'}"
    monkeypatch.setenv("ALEMBIC_DATABASE_URL", url)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    command.upgrade(_alembic_config(), "head")
    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    with Session(engine, expire_on_commit=False) as session:
        session.add_all(
            [
                SimulatedAccount(code="simulation_debit"),
                SimulatedAccount(code="simulation_credit"),
            ]
        )
        session.commit()
        yield session
    engine.dispose()
    get_settings.cache_clear()


def lines():
    return (
        LedgerLine("simulation_debit", debit_paise=101),
        LedgerLine("simulation_credit", credit_paise=101),
    )


def test_balanced_post_and_reversal_are_persisted(ledger_session):
    session = ledger_session
    journal = post_simulated_journal(session, lines(), reason="simulated example")
    session.commit()
    reversal = reverse_simulated_journal(
        session, journal.id, reason="simulated reversal"
    )
    session.commit()
    assert reversal.reversal_of_id == journal.id
    entries = session.scalars(
        select(SimulatedLedgerEntry).where(
            SimulatedLedgerEntry.journal_id == reversal.id
        )
    ).all()
    assert (
        sum(e.debit_paise for e in entries)
        == sum(e.credit_paise for e in entries)
        == 101
    )
    with pytest.raises(IntegrityError):
        reverse_simulated_journal(session, journal.id, reason="duplicate reversal")
    session.rollback()


def test_service_rejects_unbalanced_without_writes(ledger_session):
    with pytest.raises(FinanceValidationError):
        post_simulated_journal(
            ledger_session,
            (
                LedgerLine("simulation_debit", debit_paise=5),
                LedgerLine("simulation_credit", credit_paise=4),
            ),
            reason="unbalanced",
        )
    assert ledger_session.scalars(select(SimulatedJournal)).all() == []


def test_database_rejects_posted_mutations_and_unbalanced_post(ledger_session):
    session = ledger_session
    journal = post_simulated_journal(session, lines(), reason="simulated example")
    session.commit()
    entry = session.scalars(
        select(SimulatedLedgerEntry).where(
            SimulatedLedgerEntry.journal_id == journal.id
        )
    ).first()
    with pytest.raises(IntegrityError):
        session.execute(
            text("UPDATE simulated_ledger_entries SET debit_paise=999 WHERE id=:id"),
            {"id": entry.id.hex},
        )
    session.rollback()
    with pytest.raises(IntegrityError):
        session.execute(
            text("UPDATE simulated_ledger_journals SET reason='changed' WHERE id=:id"),
            {"id": journal.id.hex},
        )
    session.rollback()
    draft = SimulatedJournal(
        id=uuid4(), state="draft", currency="INR", reason="unbalanced test"
    )
    session.add(draft)
    session.flush()
    account = session.scalars(select(SimulatedAccount)).first()
    session.add(
        SimulatedLedgerEntry(
            journal_id=draft.id, account_id=account.id, debit_paise=10, credit_paise=0
        )
    )
    session.flush()
    draft.state = "posted"
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_reversal_cannot_disguise_another_journal(ledger_session):
    session = ledger_session
    journal = post_simulated_journal(session, lines(), reason="simulated example")
    session.commit()
    with pytest.raises(FinanceValidationError):
        post_simulated_journal(
            session, lines(), reason="incorrect reversal", reversal_of_id=journal.id
        )
    assert len(session.scalars(select(SimulatedJournal)).all()) == 1


def test_posted_account_cannot_be_renamed(ledger_session):
    session = ledger_session
    post_simulated_journal(session, lines(), reason="simulated example")
    session.commit()
    account = session.scalars(
        select(SimulatedAccount).where(SimulatedAccount.code == "simulation_debit")
    ).one()
    account.code = "changed"
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()
