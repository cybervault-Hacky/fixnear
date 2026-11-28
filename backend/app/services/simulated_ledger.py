"""Internal-only simulated journal service. Caller owns transaction and commit.

No provider or webhook calls this service; no real money, commission, or payable.
"""

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import SimulatedAccount, SimulatedJournal, SimulatedLedgerEntry
from app.services.simulated_finance import (
    FinanceValidationError,
    LedgerLine,
    validate_journal,
)


def _require_migration_guards(session: Session) -> None:
    """Refuse to post when schema was created without the migration guards."""
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        names = set(
            session.scalars(
                text(
                    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sim_%'"
                )
            )
        )
        required = {
            "sim_journal_insert",
            "sim_journal_update",
            "sim_journal_delete",
            "sim_entry_insert",
            "sim_entry_update",
            "sim_entry_delete",
            "sim_account_update",
            "sim_account_delete",
        }
    elif dialect == "postgresql":
        names = set(
            session.scalars(
                text(
                    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgrelid IN ('simulated_ledger_journals'::regclass, 'simulated_ledger_entries'::regclass, 'simulated_ledger_accounts'::regclass)"
                )
            )
        )
        required = {"sim_journal_guard", "sim_entry_guard", "sim_account_guard"}
    else:
        raise FinanceValidationError("Unsupported simulated ledger database.")
    if not required <= names:
        raise FinanceValidationError(
            "Simulated ledger migration safeguards are missing."
        )


def post_simulated_journal(
    session: Session,
    lines: tuple[LedgerLine, ...],
    *,
    reason: str,
    event_id: UUID | None = None,
    reversal_of_id: UUID | None = None,
) -> SimulatedJournal:
    validate_journal(lines)
    _require_migration_guards(session)
    if not isinstance(reason, str) or not 5 <= len(reason.strip()) <= 500:
        raise FinanceValidationError(
            "A reason between 5 and 500 characters is required."
        )
    accounts = {
        account.code: account
        for account in session.scalars(
            select(SimulatedAccount).where(
                SimulatedAccount.code.in_({line.account for line in lines})
            )
        ).all()
    }
    if len(accounts) != len({line.account for line in lines}):
        raise FinanceValidationError("All simulated accounts must already exist.")
    if reversal_of_id is not None:
        original = session.scalar(
            select(SimulatedJournal)
            .where(SimulatedJournal.id == reversal_of_id)
            .with_for_update()
        )
        if (
            original is None
            or original.state != "posted"
            or original.reversal_of_id is not None
        ):
            raise FinanceValidationError("Invalid simulated reversal target.")
        original_lines = session.execute(
            select(SimulatedLedgerEntry, SimulatedAccount)
            .join(
                SimulatedAccount, SimulatedAccount.id == SimulatedLedgerEntry.account_id
            )
            .where(SimulatedLedgerEntry.journal_id == original.id)
        ).all()
        expected = sorted(
            (account.code, entry.credit_paise, entry.debit_paise)
            for entry, account in original_lines
        )
        supplied = sorted(
            (line.account, line.debit_paise, line.credit_paise) for line in lines
        )
        if supplied != expected:
            raise FinanceValidationError(
                "Reversal must exactly invert the original simulated journal."
            )
    journal = SimulatedJournal(
        event_id=event_id,
        reversal_of_id=reversal_of_id,
        state="draft",
        currency="INR",
        reason=reason.strip(),
    )
    session.add(journal)
    session.flush()
    session.add_all(
        [
            SimulatedLedgerEntry(
                journal_id=journal.id,
                account_id=accounts[line.account].id,
                debit_paise=line.debit_paise,
                credit_paise=line.credit_paise,
            )
            for line in lines
        ]
    )
    session.flush()
    journal.state = "posted"
    session.flush()  # migration triggers validate totals and protect posted history
    return journal


def reverse_simulated_journal(
    session: Session, journal_id: UUID, *, reason: str
) -> SimulatedJournal:
    original = session.scalar(
        select(SimulatedJournal)
        .where(SimulatedJournal.id == journal_id)
        .with_for_update()
    )
    if (
        original is None
        or original.state != "posted"
        or original.reversal_of_id is not None
    ):
        raise FinanceValidationError(
            "Only a posted, original simulated journal can be reversed."
        )
    rows = session.execute(
        select(SimulatedLedgerEntry, SimulatedAccount)
        .join(SimulatedAccount, SimulatedAccount.id == SimulatedLedgerEntry.account_id)
        .where(SimulatedLedgerEntry.journal_id == original.id)
    ).all()
    lines = tuple(
        LedgerLine(
            account.code, debit_paise=entry.credit_paise, credit_paise=entry.debit_paise
        )
        for entry, account in rows
    )
    return post_simulated_journal(
        session, lines, reason=reason, reversal_of_id=original.id
    )
