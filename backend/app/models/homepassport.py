"""HomePassport appliances, service history, parts, warranties, claims, and reminders."""

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

APPLIANCE_CATEGORIES = (
    "air_conditioner",
    "refrigerator",
    "washing_machine",
    "ro_water_purifier",
    "television",
    "microwave",
    "geyser",
    "dishwasher",
    "electrical",
    "other",
)

SERVICE_HISTORY_SOURCES = ("fixnear_verified", "customer_reported")
WARRANTY_TYPES = ("manufacturer", "extended", "service", "part")
VERIFICATION_STATUSES = ("unverified", "pending_review", "verified")
CLAIM_STATUSES = (
    "submitted",
    "additional_information_requested",
    "under_review",
    "approved",
    "rejected",
    "closed",
)
DOCUMENT_TYPES = (
    "purchase_invoice",
    "warranty_certificate",
    "repair_report",
    "service_invoice",
    "parts_receipt",
    "photo",
    "other",
)
REMINDER_TYPES = ("warranty_expiry", "scheduled_maintenance", "custom")


class Appliance(Base):
    """A household appliance registered by one customer; archived before deletion."""

    __tablename__ = "appliances"
    __table_args__ = (
        CheckConstraint(
            "category IN ('air_conditioner', 'refrigerator', 'washing_machine', "
            "'ro_water_purifier', 'television', 'microwave', 'geyser', 'dishwasher', "
            "'electrical', 'other')",
            name="ck_appliances_category",
        ),
        CheckConstraint("length(trim(name)) > 0", name="ck_appliances_name_nonempty"),
        CheckConstraint("length(trim(brand)) > 0", name="ck_appliances_brand_nonempty"),
        CheckConstraint(
            "length(trim(model_number)) > 0", name="ck_appliances_model_nonempty"
        ),
        CheckConstraint(
            "purchase_price_paise IS NULL OR purchase_price_paise >= 0",
            name="ck_appliances_price_nonnegative",
        ),
        CheckConstraint(
            "installation_date IS NULL OR purchase_date IS NULL "
            "OR installation_date >= purchase_date",
            name="ck_appliances_install_after_purchase",
        ),
        Index("ix_appliances_owner_updated", "customer_user_id", "updated_at"),
        Index("ix_appliances_owner_active", "customer_user_id", "is_archived"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    brand: Mapped[str] = mapped_column(String(120), nullable=False)
    model_number: Mapped[str] = mapped_column(String(120), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    installation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_price_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    seller_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_storage_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    photo_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    photo_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    service_history: Mapped[list["ApplianceServiceHistory"]] = relationship(
        back_populates="appliance",
        order_by="ApplianceServiceHistory.service_date.desc()",
    )
    parts: Mapped[list["ReplacedPart"]] = relationship(
        back_populates="appliance",
        order_by="ReplacedPart.replacement_date.desc()",
    )


class ApplianceServiceHistory(Base):
    """One permanent record of completed work; verified rows come from bookings."""

    __tablename__ = "appliance_service_history"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_service_history_booking"),
        CheckConstraint(
            "source IN ('fixnear_verified', 'customer_reported')",
            name="ck_service_history_source",
        ),
        CheckConstraint(
            "completion_status IN ('completed')",
            name="ck_service_history_completion_status",
        ),
        CheckConstraint(
            "labour_charges_paise IS NULL OR labour_charges_paise >= 0",
            name="ck_service_history_labour_nonnegative",
        ),
        CheckConstraint(
            "approved_quote_total_paise IS NULL OR approved_quote_total_paise >= 0",
            name="ck_service_history_quote_nonnegative",
        ),
        Index("ix_service_history_appliance_date", "appliance_id", "service_date"),
        Index("ix_service_history_owner_date", "customer_user_id", "service_date"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    appliance_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliances.id", ondelete="RESTRICT"),
        nullable=False,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    service_category: Mapped[str] = mapped_column(String(80), nullable=False)
    booking_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    technician_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("technician_profiles.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    technician_name_snapshot: Mapped[str | None] = mapped_column(
        String(160), nullable=True
    )
    problem_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    inspection_findings: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_performed: Mapped[str | None] = mapped_column(Text, nullable=True)
    labour_charges_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    approved_quote_total_paise: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    completion_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'completed'")
    )
    customer_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    appliance: Mapped[Appliance] = relationship(back_populates="service_history")
    parts: Mapped[list["ReplacedPart"]] = relationship(
        back_populates="service_history",
        order_by="ReplacedPart.replacement_date.desc()",
    )


class ReplacedPart(Base):
    """A structured record of one part replacement; never asserts authenticity."""

    __tablename__ = "replaced_parts"
    __table_args__ = (
        CheckConstraint(
            "source IN ('fixnear_verified', 'customer_reported')",
            name="ck_replaced_parts_source",
        ),
        CheckConstraint("quantity >= 1", name="ck_replaced_parts_quantity_positive"),
        CheckConstraint(
            "unit_price_paise IS NULL OR unit_price_paise >= 0",
            name="ck_replaced_parts_unit_nonnegative",
        ),
        CheckConstraint(
            "total_price_paise IS NULL OR total_price_paise >= 0",
            name="ck_replaced_parts_total_nonnegative",
        ),
        CheckConstraint(
            "unit_price_paise IS NULL OR total_price_paise IS NULL "
            "OR total_price_paise = quantity * unit_price_paise",
            name="ck_replaced_parts_total_consistent",
        ),
        Index("ix_replaced_parts_appliance_date", "appliance_id", "replacement_date"),
        Index("ix_replaced_parts_owner_date", "customer_user_id", "replacement_date"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    appliance_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliances.id", ondelete="RESTRICT"),
        nullable=False,
    )
    service_history_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliance_service_history.id", ondelete="CASCADE"),
        nullable=True,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default=text("'customer_reported'")
    )
    part_name: Mapped[str] = mapped_column(String(160), nullable=False)
    part_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    part_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    replacement_date: Mapped[date] = mapped_column(Date, nullable=False)
    unit_price_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_price_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    technician_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    appliance: Mapped[Appliance] = relationship(back_populates="parts")
    service_history: Mapped[ApplianceServiceHistory | None] = relationship(
        back_populates="parts"
    )


class WarrantyRecord(Base):
    """One warranty obligation; coverage is decided by the responsible provider."""

    __tablename__ = "warranty_records"
    __table_args__ = (
        CheckConstraint(
            "warranty_type IN ('manufacturer', 'extended', 'service', 'part')",
            name="ck_warranty_records_type",
        ),
        CheckConstraint(
            "verification_status IN ('unverified', 'pending_review', 'verified')",
            name="ck_warranty_records_verification",
        ),
        CheckConstraint("end_date >= start_date", name="ck_warranty_records_date_range"),
        CheckConstraint(
            "appliance_id IS NOT NULL OR part_id IS NOT NULL",
            name="ck_warranty_records_reference",
        ),
        CheckConstraint(
            "length(trim(provider)) > 0", name="ck_warranty_records_provider_nonempty"
        ),
        Index("ix_warranty_records_owner_end", "customer_user_id", "end_date"),
        Index("ix_warranty_records_appliance", "appliance_id"),
        Index("ix_warranty_records_part", "part_id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    appliance_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliances.id", ondelete="RESTRICT"),
        nullable=True,
    )
    part_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("replaced_parts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
    )
    warranty_type: Mapped[str] = mapped_column(String(24), nullable=False)
    provider: Mapped[str] = mapped_column(String(160), nullable=False)
    reference_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    terms_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default=text("'unverified'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class WarrantyClaim(Base):
    """One customer claim against a warranty; approval always belongs to admins."""

    __tablename__ = "warranty_claims"
    __table_args__ = (
        CheckConstraint(
            "status IN ('submitted', 'additional_information_requested', 'under_review', "
            "'approved', 'rejected', 'closed')",
            name="ck_warranty_claims_status",
        ),
        Index("ix_warranty_claims_warranty_status", "warranty_id", "status"),
        Index("ix_warranty_claims_owner_status", "customer_user_id", "status"),
        Index(
            "uq_warranty_claims_one_open",
            "warranty_id",
            unique=True,
            sqlite_where=text(
                "status IN ('submitted', 'additional_information_requested', 'under_review')"
            ),
            postgresql_where=text(
                "status IN ('submitted', 'additional_information_requested', 'under_review')"
            ),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    warranty_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_records.id", ondelete="RESTRICT"),
        nullable=False,
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default=text("'submitted'")
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    decided_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decision_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class WarrantyClaimHistory(Base):
    """Append-only audit trail for claim state changes and customer responses."""

    __tablename__ = "warranty_claim_history"
    __table_args__ = (
        CheckConstraint(
            "actor_role IN ('customer', 'admin')", name="ck_claim_history_actor_role"
        ),
        Index("ix_claim_history_claim_created", "claim_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    claim_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_claims.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_role: Mapped[str] = mapped_column(String(16), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_status: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ApplianceDocument(Base):
    """Private document metadata; storage keys are never exposed to clients."""

    __tablename__ = "appliance_documents"
    __table_args__ = (
        CheckConstraint(
            "document_type IN ('purchase_invoice', 'warranty_certificate', 'repair_report', "
            "'service_invoice', 'parts_receipt', 'photo', 'other')",
            name="ck_appliance_documents_type",
        ),
        CheckConstraint(
            "status IN ('pending_upload', 'uploaded', 'failed')",
            name="ck_appliance_documents_status",
        ),
        CheckConstraint(
            "size_bytes BETWEEN 1 AND 10485760", name="ck_appliance_documents_size"
        ),
        Index("ix_appliance_documents_owner_created", "owner_user_id", "created_at"),
        Index("ix_appliance_documents_appliance", "appliance_id"),
        Index("ix_appliance_documents_warranty", "warranty_id"),
        Index("ix_appliance_documents_claim", "claim_id"),
        Index("ix_appliance_documents_booking", "booking_id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    appliance_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliances.id", ondelete="SET NULL"),
        nullable=True,
    )
    warranty_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_records.id", ondelete="SET NULL"),
        nullable=True,
    )
    claim_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_claims.id", ondelete="SET NULL"),
        nullable=True,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
    )
    document_type: Mapped[str] = mapped_column(String(32), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default=text("'pending_upload'")
    )
    storage_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MaintenanceReminder(Base):
    """An in-app reminder; no external delivery is configured by this build."""

    __tablename__ = "maintenance_reminders"
    __table_args__ = (
        CheckConstraint(
            "reminder_type IN ('warranty_expiry', 'scheduled_maintenance', 'custom')",
            name="ck_maintenance_reminders_type",
        ),
        CheckConstraint(
            "length(trim(title)) > 0", name="ck_maintenance_reminders_title_nonempty"
        ),
        UniqueConstraint(
            "customer_user_id",
            "reminder_type",
            "warranty_id",
            "due_date",
            name="uq_maintenance_reminders_warranty_due",
        ),
        Index("ix_maintenance_reminders_owner_due", "customer_user_id", "due_date"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    appliance_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("appliances.id", ondelete="CASCADE"),
        nullable=True,
    )
    warranty_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_records.id", ondelete="CASCADE"),
        nullable=True,
    )
    reminder_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone_name: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Asia/Kolkata'")
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class HomePassportAuditEvent(Base):
    """Append-only audit for corrections, verification decisions, and closures."""

    __tablename__ = "homepassport_audit_events"
    __table_args__ = (
        Index("ix_homepassport_audit_entity", "entity_type", "entity_id", "created_at"),
        Index("ix_homepassport_audit_actor_created", "actor_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
