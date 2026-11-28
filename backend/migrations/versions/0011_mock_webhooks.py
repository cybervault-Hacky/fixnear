"""Durable verified mock events and non-financial attempt outcomes.

Revision ID: 0011_mock_webhooks
Revises: 0010_simulated_attempt
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_mock_webhooks"
down_revision: str | None = "0010_simulated_attempt"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("simulated_payment_attempts") as batch:
        batch.drop_constraint("ck_sim_attempt_state", type_="check")
        batch.create_check_constraint(
            "ck_sim_attempt_state",
            "state IN ('pending_verification', 'verified_success_simulation', 'verified_failure_simulation', 'verified_cancelled_simulation', 'verified_expired_simulation')",
        )
    op.create_table(
        "mock_webhook_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("provider_reference", sa.String(80), nullable=False),
        sa.Column("attempt_reference", sa.Uuid(), nullable=False),
        sa.Column(
            "attempt_id",
            sa.Uuid(),
            sa.ForeignKey("simulated_payment_attempts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("event_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("signature_verified", sa.Boolean(), nullable=False),
        sa.Column("processing_state", sa.String(16), nullable=False),
        sa.Column("processing_attempts", sa.Integer(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason_code", sa.String(64)),
        sa.Column("body_hash", sa.String(64), nullable=False),
        sa.CheckConstraint("provider = 'mock'", name="ck_mock_event_provider"),
        sa.CheckConstraint(
            "outcome IN ('success', 'failure', 'cancellation', 'expiration', 'delayed')",
            name="ck_mock_event_outcome",
        ),
        sa.CheckConstraint(
            "processing_state IN ('received', 'processed', 'rejected')",
            name="ck_mock_event_state",
        ),
        sa.CheckConstraint("processing_attempts >= 0", name="ck_mock_event_attempts"),
    )
    op.create_index("ix_mock_event_attempt", "mock_webhook_events", ["attempt_id"])
    op.create_index("ix_mock_event_received", "mock_webhook_events", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_mock_event_received", table_name="mock_webhook_events")
    op.drop_index("ix_mock_event_attempt", table_name="mock_webhook_events")
    op.drop_table("mock_webhook_events")
    # Fail safely if terminal outcomes exist; migration does not discard history.
    with op.batch_alter_table("simulated_payment_attempts") as batch:
        batch.drop_constraint("ck_sim_attempt_state", type_="check")
        batch.create_check_constraint(
            "ck_sim_attempt_state", "state = 'pending_verification'"
        )
