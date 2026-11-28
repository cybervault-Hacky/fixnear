"""Reviews, support tickets, and privileged-operations audit events."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

REVIEW_STATUSES = ("published", "hidden")
REVIEW_REPORT_REASONS = (
    "spam",
    "abuse",
    "harassment",
    "privacy",
    "off_topic",
    "fraud",
    "other",
)
REVIEW_REPORT_STATUSES = ("open", "reviewed", "dismissed")

TICKET_CATEGORIES = (
    "booking_issue",
    "technician_issue",
    "payment_query",
    "warranty_claim",
    "repair_quality",
    "refund_request",
    "account_issue",
    "other",
)
TICKET_STATUSES = (
    "open",
    "assigned",
    "in_progress",
    "waiting_for_customer",
    "resolved",
    "closed",
)
TICKET_PRIORITIES = ("normal", "high", "urgent")
TICKET_ESCALATIONS = ("normal", "escalated")
MESSAGE_AUTHOR_KINDS = ("customer", "staff")


class Review(Base):
    """A verified review tied to one completed booking."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_reviews_booking"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
        CheckConstraint(
            "service_quality IS NULL OR service_quality BETWEEN 1 AND 5",
            name="ck_reviews_service_quality",
        ),
        CheckConstraint(
            "professionalism IS NULL OR professionalism BETWEEN 1 AND 5",
            name="ck_reviews_professionalism",
        ),
        CheckConstraint(
            "timeliness IS NULL OR timeliness BETWEEN 1 AND 5",
            name="ck_reviews_timeliness",
        ),
        CheckConstraint(
            "communication IS NULL OR communication BETWEEN 1 AND 5",
            name="ck_reviews_communication",
        ),
        CheckConstraint(
            "length(trim(feedback)) BETWEEN 10 AND 2000",
            name="ck_reviews_feedback_length",
        ),
        CheckConstraint(
            "status IN ('published', 'hidden')",
            name="ck_reviews_status",
        ),
        Index("ix_reviews_technician_status_created", "technician_user_id", "status", "created_at"),
        Index("ix_reviews_customer_created", "customer_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    service_slug_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    service_quality: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    professionalism: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    timeliness: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    communication: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'published'")
    )
    hidden_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hidden_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True
    )
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReviewReport(Base):
    """A customer/technician report about a review; feeds the moderation queue."""

    __tablename__ = "review_reports"
    __table_args__ = (
        UniqueConstraint("review_id", "reporter_user_id", name="uq_review_reports_review_reporter"),
        CheckConstraint(
            "reason IN ('spam', 'abuse', 'harassment', 'privacy', 'off_topic', 'fraud', 'other')",
            name="ck_review_reports_reason",
        ),
        CheckConstraint(
            "status IN ('open', 'reviewed', 'dismissed')",
            name="ck_review_reports_status",
        ),
        Index("ix_review_reports_status_created", "status", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    review_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
    )
    reporter_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(24), nullable=False)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'open'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SupportTicket(Base):
    """A customer complaint or query routed to authorized support staff."""

    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint(
            "category IN ('booking_issue', 'technician_issue', 'payment_query', "
            "'warranty_claim', 'repair_quality', 'refund_request', 'account_issue', 'other')",
            name="ck_support_tickets_category",
        ),
        CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'waiting_for_customer', "
            "'resolved', 'closed')",
            name="ck_support_tickets_status",
        ),
        CheckConstraint(
            "priority IN ('normal', 'high', 'urgent')",
            name="ck_support_tickets_priority",
        ),
        CheckConstraint(
            "escalation_status IN ('normal', 'escalated')",
            name="ck_support_tickets_escalation",
        ),
        CheckConstraint(
            "length(trim(subject)) BETWEEN 1 AND 200",
            name="ck_support_tickets_subject_length",
        ),
        CheckConstraint(
            "length(trim(description)) BETWEEN 10 AND 5000",
            name="ck_support_tickets_description_length",
        ),
        Index("ix_support_tickets_status_created", "status", "created_at"),
        Index("ix_support_tickets_customer_created", "customer_user_id", "created_at"),
        Index("ix_support_tickets_assigned_created", "assigned_to", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    customer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
    )
    technician_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    warranty_claim_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warranty_claims.id", ondelete="SET NULL"),
        nullable=True,
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'open'")
    )
    priority: Mapped[str] = mapped_column(
        String(8), nullable=False, server_default=text("'normal'")
    )
    escalation_status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'normal'")
    )
    assigned_to: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SupportMessage(Base):
    """Customer-visible messages on a support ticket."""

    __tablename__ = "support_messages"
    __table_args__ = (
        CheckConstraint(
            "author_kind IN ('customer', 'staff')",
            name="ck_support_messages_author_kind",
        ),
        CheckConstraint(
            "length(trim(body)) BETWEEN 1 AND 4000",
            name="ck_support_messages_body_length",
        ),
        Index("ix_support_messages_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    author_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SupportInternalNote(Base):
    """Staff-only note; never serialized into customer-visible responses."""

    __tablename__ = "support_internal_notes"
    __table_args__ = (
        CheckConstraint(
            "length(trim(body)) BETWEEN 1 AND 4000",
            name="ck_support_internal_notes_body_length",
        ),
        Index("ix_support_internal_notes_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SupportTicketEvent(Base):
    """Customer-safe lifecycle history for a ticket; staff notes stay elsewhere."""

    __tablename__ = "support_ticket_events"
    __table_args__ = (
        Index("ix_support_ticket_events_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OperationsAuditEvent(Base):
    """Append-only audit for privileged operations (reviews, support, accounts)."""

    __tablename__ = "operations_audit_events"
    __table_args__ = (
        Index("ix_operations_audit_entity", "entity_type", "entity_id", "created_at"),
        Index("ix_operations_audit_actor_created", "actor_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_internal: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
