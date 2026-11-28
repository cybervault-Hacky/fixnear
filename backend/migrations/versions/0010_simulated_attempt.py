"""Add pending-only simulated attempts.

Revision ID: 0010_simulated_attempt
Revises: 0009_simulated_intent
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_simulated_attempt"
down_revision: str | None = "0009_simulated_intent"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulated_payment_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "intent_id",
            sa.Uuid(),
            sa.ForeignKey("simulated_payment_intents.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("provider_reference", sa.String(80), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason_code", sa.String(64)),
        sa.UniqueConstraint("intent_id", name="uq_sim_attempt_intent"),
        sa.UniqueConstraint(
            "provider", "provider_reference", name="uq_sim_attempt_provider_ref"
        ),
        sa.UniqueConstraint("intent_id", "idempotency_key", name="uq_sim_attempt_key"),
        sa.CheckConstraint("provider = 'mock'", name="ck_sim_attempt_provider"),
        sa.CheckConstraint("currency = 'INR'", name="ck_sim_attempt_currency"),
        sa.CheckConstraint("amount_paise > 0", name="ck_sim_attempt_amount"),
        sa.CheckConstraint(
            "state = 'pending_verification'", name="ck_sim_attempt_state"
        ),
    )
    op.create_index(
        "ix_sim_attempt_created", "simulated_payment_attempts", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_sim_attempt_created", table_name="simulated_payment_attempts")
    op.drop_table("simulated_payment_attempts")
