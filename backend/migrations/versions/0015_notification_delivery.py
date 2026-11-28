"""Durable simulated/in-app delivery work and attempt history."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_notification_delivery"
down_revision: str | None = "0014_in_app_notifications"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "notification_id",
            sa.Uuid(),
            sa.ForeignKey("in_app_notifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column(
            "state", sa.String(24), nullable=False, server_default=sa.text("'pending'")
        ),
        sa.Column(
            "attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "max_attempts", sa.Integer(), nullable=False, server_default=sa.text("3")
        ),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_token", sa.Uuid()),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason", sa.String(120)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_delivery_idempotency_key"),
        sa.CheckConstraint(
            "state IN ('pending', 'processing', 'delivered', 'retry_pending', 'permanently_failed')",
            name="ck_delivery_state",
        ),
        sa.CheckConstraint(
            "channel IN ('in_app', 'email', 'sms', 'web_push', 'mobile_push')",
            name="ck_delivery_channel",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND max_attempts > 0", name="ck_delivery_attempt_bounds"
        ),
    )
    op.create_index(
        "ix_delivery_ready", "notification_deliveries", ["state", "next_attempt_at"]
    )
    op.create_table(
        "notification_delivery_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "delivery_id",
            sa.Uuid(),
            sa.ForeignKey("notification_deliveries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(24), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("failure_reason", sa.String(120)),
        sa.UniqueConstraint(
            "delivery_id", "attempt_number", name="uq_delivery_attempt_number"
        ),
    )


def downgrade() -> None:
    op.drop_table("notification_delivery_attempts")
    op.drop_index("ix_delivery_ready", table_name="notification_deliveries")
    op.drop_table("notification_deliveries")
