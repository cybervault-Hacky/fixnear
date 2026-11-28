"""Add non-charging simulated payment intent drafts.

Revision ID: 0009_simulated_intent
Revises: 0008_technician_phone
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_simulated_intent"
down_revision: str | None = "0008_technician_phone"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulated_payment_intents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "customer_user_id",
            sa.Uuid(),
            sa.ForeignKey("customer_profiles.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "quote_id",
            sa.Uuid(),
            sa.ForeignKey("booking_quotes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quote_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "currency", sa.String(3), nullable=False, server_default=sa.text("'INR'")
        ),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'draft_simulation'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "customer_user_id", "idempotency_key", name="uq_sim_payment_customer_key"
        ),
        sa.UniqueConstraint("quote_id", name="uq_sim_payment_quote"),
        sa.CheckConstraint("amount_paise > 0", name="ck_sim_payment_amount_positive"),
        sa.CheckConstraint("quote_version > 0", name="ck_sim_payment_quote_version"),
        sa.CheckConstraint("currency = 'INR'", name="ck_sim_payment_currency"),
        sa.CheckConstraint("status = 'draft_simulation'", name="ck_sim_payment_status"),
    )
    op.create_index(
        "ix_sim_payment_customer_created",
        "simulated_payment_intents",
        ["customer_user_id", "created_at"],
    )
    op.create_index(
        "ix_sim_payment_booking", "simulated_payment_intents", ["booking_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_sim_payment_booking", table_name="simulated_payment_intents")
    op.drop_index(
        "ix_sim_payment_customer_created", table_name="simulated_payment_intents"
    )
    op.drop_table("simulated_payment_intents")
