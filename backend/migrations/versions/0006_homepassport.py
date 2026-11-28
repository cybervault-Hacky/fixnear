"""Add HomePassport appliances, service history, parts, warranties, and claims.

Revision ID: 0006_homepassport
Revises: 0005_location_visits
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_homepassport"
down_revision: str | None = "0005_location_visits"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create HomePassport tables; existing rows are untouched."""

    op.create_table(
        "appliances",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("brand", sa.String(length=120), nullable=False),
        sa.Column("model_number", sa.String(length=120), nullable=False),
        sa.Column("serial_number", sa.String(length=120), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("installation_date", sa.Date(), nullable=True),
        sa.Column("purchase_price_paise", sa.BigInteger(), nullable=True),
        sa.Column("seller_name", sa.String(length=160), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_storage_provider", sa.String(length=40), nullable=True),
        sa.Column("photo_storage_key", sa.String(length=512), nullable=True),
        sa.Column("photo_content_type", sa.String(length=120), nullable=True),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
            "category IN ('air_conditioner', 'refrigerator', 'washing_machine', "
            "'ro_water_purifier', 'television', 'microwave', 'geyser', 'dishwasher', "
            "'electrical', 'other')",
            name="ck_appliances_category",
        ),
        sa.CheckConstraint(
            "length(trim(name)) > 0", name="ck_appliances_name_nonempty"
        ),
        sa.CheckConstraint(
            "length(trim(brand)) > 0", name="ck_appliances_brand_nonempty"
        ),
        sa.CheckConstraint(
            "length(trim(model_number)) > 0", name="ck_appliances_model_nonempty"
        ),
        sa.CheckConstraint(
            "purchase_price_paise IS NULL OR purchase_price_paise >= 0",
            name="ck_appliances_price_nonnegative",
        ),
        sa.CheckConstraint(
            "installation_date IS NULL OR purchase_date IS NULL "
            "OR installation_date >= purchase_date",
            name="ck_appliances_install_after_purchase",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_appliances_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_appliances"),
    )
    op.create_index(
        "ix_appliances_owner_updated",
        "appliances",
        ["customer_user_id", "updated_at"],
    )
    op.create_index(
        "ix_appliances_owner_active",
        "appliances",
        ["customer_user_id", "is_archived"],
    )

    op.create_table(
        "appliance_service_history",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("service_category", sa.String(length=80), nullable=False),
        sa.Column("booking_reference", sa.String(length=64), nullable=True),
        sa.Column("technician_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("technician_name_snapshot", sa.String(length=160), nullable=True),
        sa.Column("problem_description", sa.Text(), nullable=True),
        sa.Column("inspection_findings", sa.Text(), nullable=True),
        sa.Column("work_performed", sa.Text(), nullable=True),
        sa.Column("labour_charges_paise", sa.BigInteger(), nullable=True),
        sa.Column("approved_quote_total_paise", sa.BigInteger(), nullable=True),
        sa.Column(
            "completion_status",
            sa.String(length=32),
            server_default=sa.text("'completed'"),
            nullable=False,
        ),
        sa.Column("customer_feedback", sa.Text(), nullable=True),
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
            "source IN ('fixnear_verified', 'customer_reported')",
            name="ck_service_history_source",
        ),
        sa.CheckConstraint(
            "completion_status IN ('completed')",
            name="ck_service_history_completion_status",
        ),
        sa.CheckConstraint(
            "labour_charges_paise IS NULL OR labour_charges_paise >= 0",
            name="ck_service_history_labour_nonnegative",
        ),
        sa.CheckConstraint(
            "approved_quote_total_paise IS NULL OR approved_quote_total_paise >= 0",
            name="ck_service_history_quote_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_service_history_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["appliance_id"],
            ["appliances.id"],
            name="fk_service_history_appliance_id_appliances",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_service_history_booking_id_bookings",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["technician_user_id"],
            ["technician_profiles.user_id"],
            name="fk_service_history_technician_user_id_technician_profiles",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_appliance_service_history"),
        sa.UniqueConstraint("booking_id", name="uq_service_history_booking"),
    )
    op.create_index(
        "ix_service_history_appliance_date",
        "appliance_service_history",
        ["appliance_id", "service_date"],
    )
    op.create_index(
        "ix_service_history_owner_date",
        "appliance_service_history",
        ["customer_user_id", "service_date"],
    )

    op.create_table(
        "replaced_parts",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("service_history_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column(
            "source",
            sa.String(length=24),
            server_default=sa.text("'customer_reported'"),
            nullable=False,
        ),
        sa.Column("part_name", sa.String(length=160), nullable=False),
        sa.Column("part_category", sa.String(length=80), nullable=True),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("part_number", sa.String(length=120), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("replacement_date", sa.Date(), nullable=False),
        sa.Column("unit_price_paise", sa.BigInteger(), nullable=True),
        sa.Column("total_price_paise", sa.BigInteger(), nullable=True),
        sa.Column("technician_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source IN ('fixnear_verified', 'customer_reported')",
            name="ck_replaced_parts_source",
        ),
        sa.CheckConstraint(
            "quantity >= 1", name="ck_replaced_parts_quantity_positive"
        ),
        sa.CheckConstraint(
            "unit_price_paise IS NULL OR unit_price_paise >= 0",
            name="ck_replaced_parts_unit_nonnegative",
        ),
        sa.CheckConstraint(
            "total_price_paise IS NULL OR total_price_paise >= 0",
            name="ck_replaced_parts_total_nonnegative",
        ),
        sa.CheckConstraint(
            "unit_price_paise IS NULL OR total_price_paise IS NULL "
            "OR total_price_paise = quantity * unit_price_paise",
            name="ck_replaced_parts_total_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_replaced_parts_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["appliance_id"],
            ["appliances.id"],
            name="fk_replaced_parts_appliance_id_appliances",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_history_id"],
            ["appliance_service_history.id"],
            name="fk_replaced_parts_service_history_id_service_history",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_replaced_parts_booking_id_bookings",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_replaced_parts"),
    )
    op.create_index(
        "ix_replaced_parts_appliance_date",
        "replaced_parts",
        ["appliance_id", "replacement_date"],
    )
    op.create_index(
        "ix_replaced_parts_owner_date",
        "replaced_parts",
        ["customer_user_id", "replacement_date"],
    )

    op.create_table(
        "warranty_records",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("part_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("warranty_type", sa.String(length=24), nullable=False),
        sa.Column("provider", sa.String(length=160), nullable=False),
        sa.Column("reference_number", sa.String(length=120), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("terms_summary", sa.Text(), nullable=True),
        sa.Column(
            "verification_status",
            sa.String(length=24),
            server_default=sa.text("'unverified'"),
            nullable=False,
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
        sa.CheckConstraint(
            "warranty_type IN ('manufacturer', 'extended', 'service', 'part')",
            name="ck_warranty_records_type",
        ),
        sa.CheckConstraint(
            "verification_status IN ('unverified', 'pending_review', 'verified')",
            name="ck_warranty_records_verification",
        ),
        sa.CheckConstraint(
            "end_date >= start_date", name="ck_warranty_records_date_range"
        ),
        sa.CheckConstraint(
            "appliance_id IS NOT NULL OR part_id IS NOT NULL",
            name="ck_warranty_records_reference",
        ),
        sa.CheckConstraint(
            "length(trim(provider)) > 0", name="ck_warranty_records_provider_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_warranty_records_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["appliance_id"],
            ["appliances.id"],
            name="fk_warranty_records_appliance_id_appliances",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["replaced_parts.id"],
            name="fk_warranty_records_part_id_replaced_parts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_warranty_records_booking_id_bookings",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_warranty_records"),
    )
    op.create_index(
        "ix_warranty_records_owner_end",
        "warranty_records",
        ["customer_user_id", "end_date"],
    )
    op.create_index(
        "ix_warranty_records_appliance", "warranty_records", ["appliance_id"]
    )
    op.create_index("ix_warranty_records_part", "warranty_records", ["part_id"])

    op.create_table(
        "warranty_claims",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("warranty_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("issue_description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=40),
            server_default=sa.text("'submitted'"),
            nullable=False,
        ),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("decided_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_reason", sa.String(length=1000), nullable=True),
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
            "status IN ('submitted', 'additional_information_requested', 'under_review', "
            "'approved', 'rejected', 'closed')",
            name="ck_warranty_claims_status",
        ),
        sa.ForeignKeyConstraint(
            ["warranty_id"],
            ["warranty_records.id"],
            name="fk_warranty_claims_warranty_id_warranty_records",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_warranty_claims_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_user_id"],
            ["app_users.id"],
            name="fk_warranty_claims_decided_by_user_id_app_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_warranty_claims"),
    )
    op.create_index(
        "ix_warranty_claims_warranty_status",
        "warranty_claims",
        ["warranty_id", "status"],
    )
    op.create_index(
        "ix_warranty_claims_owner_status",
        "warranty_claims",
        ["customer_user_id", "status"],
    )
    op.create_index(
        "uq_warranty_claims_one_open",
        "warranty_claims",
        ["warranty_id"],
        unique=True,
        sqlite_where=sa.text(
            "status IN ('submitted', 'additional_information_requested', 'under_review')"
        ),
        postgresql_where=sa.text(
            "status IN ('submitted', 'additional_information_requested', 'under_review')"
        ),
    )

    op.create_table(
        "warranty_claim_history",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("claim_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("actor_role", sa.String(length=16), nullable=False),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "actor_role IN ('customer', 'admin')", name="ck_claim_history_actor_role"
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["warranty_claims.id"],
            name="fk_warranty_claim_history_claim_id_warranty_claims",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["app_users.id"],
            name="fk_warranty_claim_history_actor_user_id_app_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_warranty_claim_history"),
    )
    op.create_index(
        "ix_claim_history_claim_created",
        "warranty_claim_history",
        ["claim_id", "created_at"],
    )

    op.create_table(
        "appliance_documents",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("warranty_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("claim_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("booking_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=24),
            server_default=sa.text("'pending_upload'"),
            nullable=False,
        ),
        sa.Column("storage_provider", sa.String(length=40), nullable=True),
        sa.Column("storage_key", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "document_type IN ('purchase_invoice', 'warranty_certificate', 'repair_report', "
            "'service_invoice', 'parts_receipt', 'photo', 'other')",
            name="ck_appliance_documents_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending_upload', 'uploaded', 'failed')",
            name="ck_appliance_documents_status",
        ),
        sa.CheckConstraint(
            "size_bytes BETWEEN 1 AND 10485760", name="ck_appliance_documents_size"
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["customer_profiles.user_id"],
            name="fk_appliance_documents_owner_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["appliance_id"],
            ["appliances.id"],
            name="fk_appliance_documents_appliance_id_appliances",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warranty_id"],
            ["warranty_records.id"],
            name="fk_appliance_documents_warranty_id_warranty_records",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["warranty_claims.id"],
            name="fk_appliance_documents_claim_id_warranty_claims",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_appliance_documents_booking_id_bookings",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_appliance_documents"),
    )
    op.create_index(
        "ix_appliance_documents_owner_created",
        "appliance_documents",
        ["owner_user_id", "created_at"],
    )
    op.create_index(
        "ix_appliance_documents_appliance", "appliance_documents", ["appliance_id"]
    )
    op.create_index(
        "ix_appliance_documents_warranty", "appliance_documents", ["warranty_id"]
    )
    op.create_index(
        "ix_appliance_documents_claim", "appliance_documents", ["claim_id"]
    )
    op.create_index(
        "ix_appliance_documents_booking", "appliance_documents", ["booking_id"]
    )

    op.create_table(
        "maintenance_reminders",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("warranty_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reminder_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "timezone_name",
            sa.String(length=64),
            server_default=sa.text("'Asia/Kolkata'"),
            nullable=False,
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
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
        sa.CheckConstraint(
            "reminder_type IN ('warranty_expiry', 'scheduled_maintenance', 'custom')",
            name="ck_maintenance_reminders_type",
        ),
        sa.CheckConstraint(
            "length(trim(title)) > 0", name="ck_maintenance_reminders_title_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"],
            ["customer_profiles.user_id"],
            name="fk_maintenance_reminders_customer_user_id_customer_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["appliance_id"],
            ["appliances.id"],
            name="fk_maintenance_reminders_appliance_id_appliances",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["warranty_id"],
            ["warranty_records.id"],
            name="fk_maintenance_reminders_warranty_id_warranty_records",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_maintenance_reminders"),
        sa.UniqueConstraint(
            "customer_user_id",
            "reminder_type",
            "warranty_id",
            "due_date",
            name="uq_maintenance_reminders_warranty_due",
        ),
    )
    op.create_index(
        "ix_maintenance_reminders_owner_due",
        "maintenance_reminders",
        ["customer_user_id", "due_date"],
    )

    op.create_table(
        "homepassport_audit_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column(
            "changed_fields",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["app_users.id"],
            name="fk_homepassport_audit_events_actor_user_id_app_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_homepassport_audit_events"),
    )
    op.create_index(
        "ix_homepassport_audit_entity",
        "homepassport_audit_events",
        ["entity_type", "entity_id", "created_at"],
    )
    op.create_index(
        "ix_homepassport_audit_actor_created",
        "homepassport_audit_events",
        ["actor_user_id", "created_at"],
    )

    with op.batch_alter_table("bookings") as batch_op:
        batch_op.add_column(sa.Column("appliance_id", sa.Uuid(as_uuid=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_bookings_appliance_id_appliances",
            "appliances",
            ["appliance_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_bookings_appliance", "bookings", ["appliance_id"])


def downgrade() -> None:
    """Remove HomePassport structures; booking rows keep appliance_id dropped."""

    op.drop_index("ix_bookings_appliance", table_name="bookings")
    with op.batch_alter_table("bookings") as batch_op:
        batch_op.drop_constraint("fk_bookings_appliance_id_appliances", type_="foreignkey")
        batch_op.drop_column("appliance_id")

    op.drop_index(
        "ix_homepassport_audit_actor_created", table_name="homepassport_audit_events"
    )
    op.drop_index(
        "ix_homepassport_audit_entity", table_name="homepassport_audit_events"
    )
    op.drop_table("homepassport_audit_events")

    op.drop_index(
        "ix_maintenance_reminders_owner_due", table_name="maintenance_reminders"
    )
    op.drop_table("maintenance_reminders")

    op.drop_index("ix_appliance_documents_booking", table_name="appliance_documents")
    op.drop_index("ix_appliance_documents_claim", table_name="appliance_documents")
    op.drop_index("ix_appliance_documents_warranty", table_name="appliance_documents")
    op.drop_index("ix_appliance_documents_appliance", table_name="appliance_documents")
    op.drop_index(
        "ix_appliance_documents_owner_created", table_name="appliance_documents"
    )
    op.drop_table("appliance_documents")

    op.drop_index("ix_claim_history_claim_created", table_name="warranty_claim_history")
    op.drop_table("warranty_claim_history")

    op.drop_index("uq_warranty_claims_one_open", table_name="warranty_claims")
    op.drop_index("ix_warranty_claims_owner_status", table_name="warranty_claims")
    op.drop_index("ix_warranty_claims_warranty_status", table_name="warranty_claims")
    op.drop_table("warranty_claims")

    op.drop_index("ix_warranty_records_part", table_name="warranty_records")
    op.drop_index("ix_warranty_records_appliance", table_name="warranty_records")
    op.drop_index("ix_warranty_records_owner_end", table_name="warranty_records")
    op.drop_table("warranty_records")

    op.drop_index("ix_replaced_parts_owner_date", table_name="replaced_parts")
    op.drop_index("ix_replaced_parts_appliance_date", table_name="replaced_parts")
    op.drop_table("replaced_parts")

    op.drop_index(
        "ix_service_history_owner_date", table_name="appliance_service_history"
    )
    op.drop_index(
        "ix_service_history_appliance_date", table_name="appliance_service_history"
    )
    op.drop_table("appliance_service_history")

    op.drop_index("ix_appliances_owner_active", table_name="appliances")
    op.drop_index("ix_appliances_owner_updated", table_name="appliances")
    op.drop_table("appliances")
