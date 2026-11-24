"""Customer booking requests, assignment, PriceLock quotes, and audit history."""

from datetime import date, datetime, time
from typing import ClassVar
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    false,
    func,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CustomerAddress(Base):
    """A private saved service address owned by one customer account."""

    __tablename__ = "customer_addresses"
    __table_args__ = (
        CheckConstraint(
            "length(trim(label)) > 0", name="ck_customer_addresses_label_nonempty"
        ),
        CheckConstraint(
            "length(trim(address_line1)) > 0",
            name="ck_customer_addresses_line1_nonempty",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_customer_addresses_coordinates_pair",
        ),
        CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
            name="ck_customer_addresses_latitude_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name="ck_customer_addresses_longitude_range",
        ),
        CheckConstraint(
            "location_accuracy_meters IS NULL OR location_accuracy_meters BETWEEN 0 AND 100000",
            name="ck_customer_addresses_accuracy_range",
        ),
        Index("ix_customer_addresses_owner_updated", "customer_user_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(40), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(16), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
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


class Booking(Base):
    """A customer request with an immutable address snapshot and explicit lifecycle."""

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint(
            "status IN ('requested', 'assigned', 'accepted', 'inspection_pending', "
            "'quote_pending', 'quote_rejected', 'approved', 'in_progress', 'completed', 'cancelled')",
            name="ck_bookings_status",
        ),
        CheckConstraint(
            "escalation_status IN ('normal', 'escalated', 'resolved')",
            name="ck_bookings_escalation_status",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_bookings_coordinates_pair",
        ),
        CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
            name="ck_bookings_latitude_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name="ck_bookings_longitude_range",
        ),
        CheckConstraint(
            "location_accuracy_meters IS NULL OR location_accuracy_meters BETWEEN 0 AND 100000",
            name="ck_bookings_accuracy_range",
        ),
        CheckConstraint(
            "preferred_start < preferred_end", name="ck_bookings_preferred_window"
        ),
        CheckConstraint("version >= 1", name="ck_bookings_version_positive"),
        CheckConstraint(
            "event_sequence >= 0", name="ck_bookings_event_sequence_nonnegative"
        ),
        Index("ix_bookings_customer_created", "customer_user_id", "created_at"),
        Index("ix_bookings_status_requested", "status", "preferred_date"),
        Index("ix_bookings_technician_status", "assigned_technician_user_id", "status"),
        Index("ix_bookings_service_status", "service_id", "status"),
        Index("ix_bookings_escalation_created", "escalation_status", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_profiles.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    service_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("services.id", ondelete="RESTRICT"),
        nullable=False,
    )
    service_slug_snapshot: Mapped[str] = mapped_column(String(80), nullable=False)
    service_title_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    saved_address_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_addresses.id", ondelete="SET NULL"),
        nullable=True,
    )
    address_label: Mapped[str] = mapped_column(String(40), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(16), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    problem_description: Mapped[str] = mapped_column(Text, nullable=False)
    preferred_date: Mapped[date] = mapped_column(Date, nullable=False)
    preferred_start: Mapped[time] = mapped_column(Time(), nullable=False)
    preferred_end: Mapped[time] = mapped_column(Time(), nullable=False)
    timezone_name: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Asia/Kolkata'")
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'requested'")
    )
    assigned_technician_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("technician_profiles.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    escalation_status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'normal'")
    )
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    escalation_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    event_sequence: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
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

    __mapper_args__: ClassVar[dict[str, object]] = {"version_id_col": version}


class BookingQuote(Base):
    """One immutable PriceLock quotation version for a booking."""

    __tablename__ = "booking_quotes"
    __table_args__ = (
        UniqueConstraint("booking_id", "version", name="uq_booking_quotes_version"),
        CheckConstraint("version >= 1", name="ck_booking_quotes_version_positive"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'superseded', 'expired')",
            name="ck_booking_quotes_status",
        ),
        CheckConstraint("total_paise >= 0", name="ck_booking_quotes_total_nonnegative"),
        Index("ix_booking_quotes_booking_created", "booking_id", "issued_at"),
        Index(
            "uq_booking_quotes_current",
            "booking_id",
            unique=True,
            sqlite_where=text("is_current = 1"),
            postgresql_where=text("is_current = true"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'pending'")
    )
    is_current: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'INR'")
    )
    total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    technician_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    decision_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    booking: Mapped[Booking] = relationship()
    line_items: Mapped[list["BookingQuoteLineItem"]] = relationship(
        back_populates="quote",
        order_by="BookingQuoteLineItem.position",
        cascade="all, delete-orphan",
    )


class BookingQuoteLineItem(Base):
    """Immutable, explicitly-priced line in one quote version; amounts use paise."""

    __tablename__ = "booking_quote_line_items"
    __table_args__ = (
        CheckConstraint(
            "line_type IN ('inspection', 'labour', 'part', 'additional_fee', 'tax')",
            name="ck_booking_quote_line_items_type",
        ),
        CheckConstraint(
            "quantity BETWEEN 1 AND 10000", name="ck_booking_quote_line_items_quantity"
        ),
        CheckConstraint(
            "unit_amount_paise >= 0",
            name="ck_booking_quote_line_items_unit_nonnegative",
        ),
        CheckConstraint(
            "line_total_paise >= 0",
            name="ck_booking_quote_line_items_total_nonnegative",
        ),
        Index("ix_booking_quote_line_items_quote_position", "quote_id", "position"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    quote_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("booking_quotes.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    line_type: Mapped[str] = mapped_column(String(24), nullable=False)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)

    quote: Mapped[BookingQuote] = relationship(back_populates="line_items")


class BookingEvent(Base):
    """Append-only state, assignment, quote, escalation, and cancellation audit event."""

    __tablename__ = "booking_events"
    __table_args__ = (
        UniqueConstraint("booking_id", "sequence", name="uq_booking_events_sequence"),
        Index("ix_booking_events_booking_created", "booking_id", "sequence"),
        Index("ix_booking_events_actor_created", "actor_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    target_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_internal: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BookingVisit(Base):
    """One manually updated, visit-specific status/ETA record; stores no live GPS track."""

    __tablename__ = "booking_visits"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_booking_visits_booking"),
        CheckConstraint(
            "status IN ('scheduled', 'en_route', 'arrived', 'completed', 'cancelled')",
            name="ck_booking_visits_status",
        ),
        Index("ix_booking_visits_status_eta", "status", "eta_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    eta_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
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


class BookingLocationAccessEvent(Base):
    """Append-only access audit for private saved-address and booking-location data."""

    __tablename__ = "booking_location_access_events"
    __table_args__ = (
        CheckConstraint(
            "(booking_id IS NOT NULL AND address_id IS NULL) OR "
            "(booking_id IS NULL AND address_id IS NOT NULL)",
            name="ck_booking_location_access_resource_pair",
        ),
        CheckConstraint(
            "actor_role IN ('customer', 'technician', 'admin')",
            name="ck_booking_location_access_actor_role",
        ),
        Index("ix_booking_location_access_booking_created", "booking_id", "created_at"),
        Index("ix_booking_location_access_address_created", "address_id", "created_at"),
        Index(
            "ix_booking_location_access_actor_created", "actor_user_id", "created_at"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=True,
    )
    address_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_role: Mapped[str] = mapped_column(String(16), nullable=False)
    fields_accessed: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BookingAttachment(Base):
    """Private attachment metadata prepared for a future storage adapter."""

    __tablename__ = "booking_attachments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_upload', 'uploaded', 'failed')",
            name="ck_booking_attachments_status",
        ),
        CheckConstraint(
            "size_bytes BETWEEN 1 AND 20000000", name="ck_booking_attachments_size"
        ),
        Index("ix_booking_attachments_booking_created", "booking_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
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


class MutationIdempotency(Base):
    """Actor- and operation-scoped request fingerprint for retry-safe mutations."""

    __tablename__ = "mutation_idempotency"
    __table_args__ = (
        UniqueConstraint(
            "actor_user_id",
            "operation",
            "key",
            name="uq_mutation_idempotency_actor_operation_key",
        ),
        Index("ix_mutation_idempotency_created", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    actor_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    key: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
