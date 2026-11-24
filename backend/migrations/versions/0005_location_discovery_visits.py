"""Add approximate service-area discovery, private coordinates, and visit status foundation.

Revision ID: 0005_location_visits
Revises: 0004_booking_pricelock
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_location_visits"
down_revision: str | None = "0004_booking_pricelock"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable coordinates; existing rows remain location-unknown by default."""

    with op.batch_alter_table("customer_addresses") as batch_op:
        batch_op.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("longitude", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("location_accuracy_meters", sa.Float(), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_customer_addresses_coordinates_pair",
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
        )
        batch_op.create_check_constraint(
            "ck_customer_addresses_latitude_range",
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
        )
        batch_op.create_check_constraint(
            "ck_customer_addresses_longitude_range",
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
        )
        batch_op.create_check_constraint(
            "ck_customer_addresses_accuracy_range",
            "location_accuracy_meters IS NULL OR location_accuracy_meters BETWEEN 0 AND 100000",
        )

    with op.batch_alter_table("bookings") as batch_op:
        batch_op.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("longitude", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("location_accuracy_meters", sa.Float(), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_bookings_coordinates_pair",
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
        )
        batch_op.create_check_constraint(
            "ck_bookings_latitude_range",
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
        )
        batch_op.create_check_constraint(
            "ck_bookings_longitude_range",
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
        )
        batch_op.create_check_constraint(
            "ck_bookings_accuracy_range",
            "location_accuracy_meters IS NULL OR location_accuracy_meters BETWEEN 0 AND 100000",
        )

    with op.batch_alter_table("technician_coverage_areas") as batch_op:
        batch_op.add_column(sa.Column("center_latitude", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("center_longitude", sa.Float(), nullable=True))
        batch_op.create_check_constraint(
            "ck_technician_coverage_coordinates_pair",
            "(center_latitude IS NULL AND center_longitude IS NULL) OR "
            "(center_latitude IS NOT NULL AND center_longitude IS NOT NULL)",
        )
        batch_op.create_check_constraint(
            "ck_technician_coverage_latitude_range",
            "center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90",
        )
        batch_op.create_check_constraint(
            "ck_technician_coverage_longitude_range",
            "center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180",
        )
    op.create_index(
        "ix_technician_coverage_coordinates",
        "technician_coverage_areas",
        ["center_latitude", "center_longitude"],
    )

    op.create_table(
        "booking_visits",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("eta_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('scheduled', 'en_route', 'arrived', 'completed', 'cancelled')",
            name="ck_booking_visits_status",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_booking_visits_booking_id_bookings",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["app_users.id"],
            name="fk_booking_visits_updated_by_app_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_booking_visits"),
        sa.UniqueConstraint("booking_id", name="uq_booking_visits_booking"),
    )
    op.create_index(
        "ix_booking_visits_status_eta", "booking_visits", ["status", "eta_at"]
    )

    op.create_table(
        "booking_location_access_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("address_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("actor_role", sa.String(length=16), nullable=False),
        sa.Column(
            "fields_accessed", sa.JSON(), server_default=sa.text("'[]'"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(booking_id IS NOT NULL AND address_id IS NULL) OR "
            "(booking_id IS NULL AND address_id IS NOT NULL)",
            name="ck_booking_location_access_resource_pair",
        ),
        sa.CheckConstraint(
            "actor_role IN ('customer', 'technician', 'admin')",
            name="ck_booking_location_access_actor_role",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_booking_location_access_booking_id_bookings",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["app_users.id"],
            name="fk_booking_location_access_actor_app_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_booking_location_access_events"),
    )
    op.create_index(
        "ix_booking_location_access_booking_created",
        "booking_location_access_events",
        ["booking_id", "created_at"],
    )
    op.create_index(
        "ix_booking_location_access_address_created",
        "booking_location_access_events",
        ["address_id", "created_at"],
    )
    op.create_index(
        "ix_booking_location_access_actor_created",
        "booking_location_access_events",
        ["actor_user_id", "created_at"],
    )


def downgrade() -> None:
    """Remove only the additive location and visit structures."""

    op.drop_index(
        "ix_booking_location_access_actor_created",
        table_name="booking_location_access_events",
    )
    op.drop_index(
        "ix_booking_location_access_address_created",
        table_name="booking_location_access_events",
    )
    op.drop_index(
        "ix_booking_location_access_booking_created",
        table_name="booking_location_access_events",
    )
    op.drop_table("booking_location_access_events")
    op.drop_index("ix_booking_visits_status_eta", table_name="booking_visits")
    op.drop_table("booking_visits")
    op.drop_index(
        "ix_technician_coverage_coordinates", table_name="technician_coverage_areas"
    )

    with op.batch_alter_table("technician_coverage_areas") as batch_op:
        batch_op.drop_constraint(
            "ck_technician_coverage_longitude_range", type_="check"
        )
        batch_op.drop_constraint("ck_technician_coverage_latitude_range", type_="check")
        batch_op.drop_constraint(
            "ck_technician_coverage_coordinates_pair", type_="check"
        )
        batch_op.drop_column("center_longitude")
        batch_op.drop_column("center_latitude")

    with op.batch_alter_table("bookings") as batch_op:
        batch_op.drop_constraint("ck_bookings_accuracy_range", type_="check")
        batch_op.drop_constraint("ck_bookings_longitude_range", type_="check")
        batch_op.drop_constraint("ck_bookings_latitude_range", type_="check")
        batch_op.drop_constraint("ck_bookings_coordinates_pair", type_="check")
        batch_op.drop_column("location_accuracy_meters")
        batch_op.drop_column("longitude")
        batch_op.drop_column("latitude")

    with op.batch_alter_table("customer_addresses") as batch_op:
        batch_op.drop_constraint("ck_customer_addresses_accuracy_range", type_="check")
        batch_op.drop_constraint("ck_customer_addresses_longitude_range", type_="check")
        batch_op.drop_constraint("ck_customer_addresses_latitude_range", type_="check")
        batch_op.drop_constraint(
            "ck_customer_addresses_coordinates_pair", type_="check"
        )
        batch_op.drop_column("location_accuracy_meters")
        batch_op.drop_column("longitude")
        batch_op.drop_column("latitude")
