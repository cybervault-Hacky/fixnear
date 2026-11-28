"""Add owner-scoped in-app booking notifications.

Revision ID: 0014_in_app_notifications
Revises: 0013_booking_location_sharing
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_in_app_notifications"
down_revision: str | None = "0013_booking_location_sharing"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "in_app_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "booking_event_id",
            sa.Uuid(),
            sa.ForeignKey("booking_events.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "recipient_user_id",
            sa.Uuid(),
            sa.ForeignKey("app_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("action_path", sa.String(200), nullable=False),
        sa.Column(
            "state", sa.String(16), server_default=sa.text("'unread'"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "booking_event_id",
            "recipient_user_id",
            name="uq_notification_booking_event_recipient",
        ),
        sa.CheckConstraint(
            "category IN ('booking', 'quote', 'warranty', 'maintenance', 'support', 'security')",
            name="ck_notification_category",
        ),
        sa.CheckConstraint(
            "state IN ('unread', 'read', 'archived')", name="ck_notification_state"
        ),
    )
    op.create_index(
        "ix_notifications_owner_state_created",
        "in_app_notifications",
        ["recipient_user_id", "state", "created_at"],
    )
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("app_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column(
            "enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id", "category", name="uq_notification_preference_user_category"
        ),
        sa.CheckConstraint(
            "category IN ('booking', 'quote', 'warranty', 'maintenance', 'support', 'security')",
            name="ck_notification_preference_category",
        ),
        sa.CheckConstraint(
            "category <> 'security' OR enabled = true",
            name="ck_notification_security_required",
        ),
    )


def downgrade() -> None:
    op.drop_table("notification_preferences")
    op.drop_index(
        "ix_notifications_owner_state_created", table_name="in_app_notifications"
    )
    op.drop_table("in_app_notifications")
