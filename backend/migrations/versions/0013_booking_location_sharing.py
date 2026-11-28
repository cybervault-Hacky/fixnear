"""Add explicit booking-scoped technician location sharing.

Revision ID: 0013_booking_location_sharing
Revises: 0012_simulated_ledger
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_booking_location_sharing"
down_revision: str | None = "0012_simulated_ledger"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "booking_visits", sa.Column("eta_source", sa.String(32), nullable=True)
    )
    op.add_column(
        "booking_visits",
        sa.Column("eta_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "booking_location_sharing",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "technician_user_id",
            sa.Uuid(),
            sa.ForeignKey("technician_profiles.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("booking_version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("accuracy_meters", sa.Float()),
        sa.Column("location_updated_at", sa.DateTime(timezone=True)),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("booking_id", name="uq_booking_location_sharing_booking"),
        sa.CheckConstraint(
            "state IN ('enabled', 'paused', 'stopped')", name="ck_booking_sharing_state"
        ),
        sa.CheckConstraint("booking_version > 0", name="ck_booking_sharing_version"),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_booking_sharing_coordinate_pair",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
            name="ck_booking_sharing_latitude",
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name="ck_booking_sharing_longitude",
        ),
        sa.CheckConstraint(
            "accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 100000",
            name="ck_booking_sharing_accuracy",
        ),
    )
    op.create_index(
        "ix_booking_sharing_technician",
        "booking_location_sharing",
        ["technician_user_id"],
    )


def downgrade() -> None:
    op.drop_column("booking_visits", "eta_updated_at")
    op.drop_column("booking_visits", "eta_source")
    op.drop_index(
        "ix_booking_sharing_technician", table_name="booking_location_sharing"
    )
    op.drop_table("booking_location_sharing")
