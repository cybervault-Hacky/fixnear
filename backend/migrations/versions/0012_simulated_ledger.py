"""Disconnected simulated journals with immutable, balanced posted records.

Revision ID: 0012_simulated_ledger
Revises: 0011_mock_webhooks
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_simulated_ledger"
down_revision: str | None = "0011_mock_webhooks"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulated_ledger_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column(
            "currency", sa.String(3), nullable=False, server_default=sa.text("'INR'")
        ),
        sa.CheckConstraint("currency = 'INR'", name="ck_sim_account_currency"),
    )
    op.create_table(
        "simulated_ledger_journals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "event_id",
            sa.Uuid(),
            sa.ForeignKey("mock_webhook_events.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "reversal_of_id",
            sa.Uuid(),
            sa.ForeignKey("simulated_ledger_journals.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "state", sa.String(8), nullable=False, server_default=sa.text("'draft'")
        ),
        sa.Column(
            "currency", sa.String(3), nullable=False, server_default=sa.text("'INR'")
        ),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("event_id", name="uq_sim_journal_event"),
        sa.UniqueConstraint("reversal_of_id", name="uq_sim_journal_reversal"),
        sa.CheckConstraint("state IN ('draft', 'posted')", name="ck_sim_journal_state"),
        sa.CheckConstraint("currency = 'INR'", name="ck_sim_journal_currency"),
    )
    op.create_index(
        "ix_sim_journal_created", "simulated_ledger_journals", ["created_at"]
    )
    op.create_table(
        "simulated_ledger_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "journal_id",
            sa.Uuid(),
            sa.ForeignKey("simulated_ledger_journals.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("simulated_ledger_accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("debit_paise", sa.BigInteger(), nullable=False),
        sa.Column("credit_paise", sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "(debit_paise > 0 AND credit_paise = 0) OR (credit_paise > 0 AND debit_paise = 0)",
            name="ck_sim_entry_one_side",
        ),
    )
    op.create_index("ix_sim_entry_journal", "simulated_ledger_entries", ["journal_id"])
    op.create_index("ix_sim_entry_account", "simulated_ledger_entries", ["account_id"])
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        op.execute(
            "CREATE TRIGGER sim_journal_insert BEFORE INSERT ON simulated_ledger_journals WHEN NEW.state <> 'draft' BEGIN SELECT RAISE(ABORT, 'journal must start draft'); END"
        )
        op.execute(
            "CREATE TRIGGER sim_journal_update BEFORE UPDATE ON simulated_ledger_journals BEGIN SELECT CASE WHEN OLD.state = 'posted' THEN RAISE(ABORT, 'posted journal immutable') WHEN NEW.state = 'posted' AND ((SELECT COUNT(*) FROM simulated_ledger_entries WHERE journal_id = NEW.id) < 2 OR (SELECT COALESCE(SUM(debit_paise),0) FROM simulated_ledger_entries WHERE journal_id = NEW.id) <> (SELECT COALESCE(SUM(credit_paise),0) FROM simulated_ledger_entries WHERE journal_id = NEW.id)) THEN RAISE(ABORT, 'unbalanced journal') END; END"
        )
        op.execute(
            "CREATE TRIGGER sim_journal_delete BEFORE DELETE ON simulated_ledger_journals WHEN OLD.state = 'posted' BEGIN SELECT RAISE(ABORT, 'posted journal immutable'); END"
        )
        op.execute(
            "CREATE TRIGGER sim_entry_insert BEFORE INSERT ON simulated_ledger_entries WHEN (SELECT state FROM simulated_ledger_journals WHERE id = NEW.journal_id) = 'posted' BEGIN SELECT RAISE(ABORT, 'posted entries immutable'); END"
        )
        op.execute(
            "CREATE TRIGGER sim_entry_update BEFORE UPDATE ON simulated_ledger_entries WHEN (SELECT state FROM simulated_ledger_journals WHERE id = OLD.journal_id) = 'posted' OR (SELECT state FROM simulated_ledger_journals WHERE id = NEW.journal_id) = 'posted' BEGIN SELECT RAISE(ABORT, 'posted entries immutable'); END"
        )
        op.execute(
            "CREATE TRIGGER sim_entry_delete BEFORE DELETE ON simulated_ledger_entries WHEN (SELECT state FROM simulated_ledger_journals WHERE id = OLD.journal_id) = 'posted' BEGIN SELECT RAISE(ABORT, 'posted entries immutable'); END"
        )
        for action in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER sim_account_{action.lower()} BEFORE {action} ON simulated_ledger_accounts WHEN EXISTS (SELECT 1 FROM simulated_ledger_entries e JOIN simulated_ledger_journals j ON j.id=e.journal_id WHERE e.account_id=OLD.id AND j.state='posted') BEGIN SELECT RAISE(ABORT, 'posted account immutable'); END"
            )
    elif dialect == "postgresql":
        op.execute(
            """CREATE FUNCTION sim_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'INSERT' THEN IF NEW.state <> 'draft' THEN RAISE EXCEPTION 'journal must start draft'; END IF; RETURN NEW; END IF; IF OLD.state = 'posted' THEN RAISE EXCEPTION 'posted journal immutable'; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; IF NEW.state = 'posted' THEN PERFORM a.id FROM simulated_ledger_accounts a JOIN simulated_ledger_entries e ON e.account_id=a.id WHERE e.journal_id=NEW.id ORDER BY a.id FOR UPDATE OF a; END IF; IF NEW.state = 'posted' AND ((SELECT COUNT(*) FROM simulated_ledger_entries WHERE journal_id=NEW.id) < 2 OR (SELECT COALESCE(SUM(debit_paise),0) FROM simulated_ledger_entries WHERE journal_id=NEW.id) <> (SELECT COALESCE(SUM(credit_paise),0) FROM simulated_ledger_entries WHERE journal_id=NEW.id)) THEN RAISE EXCEPTION 'unbalanced journal'; END IF; RETURN NEW; END $$"""
        )
        op.execute(
            "CREATE TRIGGER sim_journal_guard BEFORE INSERT OR UPDATE OR DELETE ON simulated_ledger_journals FOR EACH ROW EXECUTE FUNCTION sim_journal_guard()"
        )
        op.execute(
            """CREATE FUNCTION sim_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'INSERT' THEN PERFORM id FROM simulated_ledger_journals WHERE id=NEW.journal_id FOR UPDATE; ELSIF TG_OP = 'DELETE' THEN PERFORM id FROM simulated_ledger_journals WHERE id=OLD.journal_id FOR UPDATE; ELSE PERFORM id FROM simulated_ledger_journals WHERE id IN (OLD.journal_id, NEW.journal_id) ORDER BY id FOR UPDATE; END IF; IF TG_OP <> 'INSERT' AND EXISTS(SELECT 1 FROM simulated_ledger_journals WHERE id=OLD.journal_id AND state='posted') THEN RAISE EXCEPTION 'posted entries immutable'; END IF; IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM simulated_ledger_journals WHERE id=NEW.journal_id AND state='posted') THEN RAISE EXCEPTION 'posted entries immutable'; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$"""
        )
        op.execute(
            "CREATE TRIGGER sim_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON simulated_ledger_entries FOR EACH ROW EXECUTE FUNCTION sim_entry_guard()"
        )
        op.execute(
            """CREATE FUNCTION sim_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM simulated_ledger_entries e JOIN simulated_ledger_journals j ON j.id=e.journal_id WHERE e.account_id=OLD.id AND j.state='posted') THEN RAISE EXCEPTION 'posted account immutable'; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$"""
        )
        op.execute(
            "CREATE TRIGGER sim_account_guard BEFORE UPDATE OR DELETE ON simulated_ledger_accounts FOR EACH ROW EXECUTE FUNCTION sim_account_guard()"
        )
    else:
        raise RuntimeError("Simulated ledger supports SQLite and PostgreSQL only.")


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("DROP TRIGGER sim_account_guard ON simulated_ledger_accounts")
        op.execute("DROP TRIGGER sim_entry_guard ON simulated_ledger_entries")
        op.execute("DROP TRIGGER sim_journal_guard ON simulated_ledger_journals")
        op.execute("DROP FUNCTION sim_account_guard()")
        op.execute("DROP FUNCTION sim_entry_guard()")
        op.execute("DROP FUNCTION sim_journal_guard()")
    op.drop_index("ix_sim_entry_account", table_name="simulated_ledger_entries")
    op.drop_index("ix_sim_entry_journal", table_name="simulated_ledger_entries")
    op.drop_table("simulated_ledger_entries")
    op.drop_index("ix_sim_journal_created", table_name="simulated_ledger_journals")
    op.drop_table("simulated_ledger_journals")
    op.drop_table("simulated_ledger_accounts")
