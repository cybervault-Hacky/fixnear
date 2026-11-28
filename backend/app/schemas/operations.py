"""Request and response contracts for reviews, support, and admin operations."""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

Rating = Annotated[int, Field(ge=1, le=5)]

ReviewStatus = Literal["published", "hidden"]
ReviewReportReason = Literal[
    "spam", "abuse", "harassment", "privacy", "off_topic", "fraud", "other"
]
ReviewReportStatus = Literal["open", "reviewed", "dismissed"]


class ReviewCreateRequest(BaseModel):
    """A verified review tied to one completed booking."""

    model_config = ConfigDict(extra="forbid")

    rating: Rating
    service_quality: Rating | None = None
    professionalism: Rating | None = None
    timeliness: Rating | None = None
    communication: Rating | None = None
    feedback: Annotated[str, Field(min_length=10, max_length=2000)]


class ReviewUpdateRequest(BaseModel):
    """Customer edit to their own published review, within the 30-day window."""

    model_config = ConfigDict(extra="forbid")

    rating: Rating | None = None
    service_quality: Rating | None = None
    professionalism: Rating | None = None
    timeliness: Rating | None = None
    communication: Rating | None = None
    feedback: Annotated[str, Field(min_length=10, max_length=2000)] | None = None


class ReviewResponse(BaseModel):
    id: UUID
    booking_id: UUID
    technician_user_id: UUID
    technician_display_name: str
    service_slug: str | None
    rating: int
    service_quality: int | None
    professionalism: int | None
    timeliness: int | None
    communication: int | None
    feedback: str
    status: ReviewStatus
    customer_label: str
    edited: bool
    created_at: datetime
    updated_at: datetime


class ReviewListResponse(BaseModel):
    items: list[ReviewResponse]
    total: int


class ReviewSummaryResponse(BaseModel):
    published_review_count: int
    average_rating: float | None


class ReviewReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: ReviewReportReason
    note: Annotated[str, Field(min_length=1, max_length=1000)] | None = None


class ReviewReportResponse(BaseModel):
    id: UUID
    review_id: UUID
    reporter_user_id: UUID
    reason: ReviewReportReason
    note: str | None
    status: ReviewReportStatus
    created_at: datetime


class ReviewReportListResponse(BaseModel):
    items: list[ReviewReportResponse]
    total: int


class AdminReviewResponse(ReviewResponse):
    hidden_reason: str | None
    hidden_at: datetime | None
    report_count: int


class AdminReviewListResponse(BaseModel):
    items: list[AdminReviewResponse]
    total: int


class AdminReviewModerationRequest(BaseModel):
    """Mandatory reason recorded in audit history; original content is preserved."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: Annotated[str, Field(min_length=10, max_length=500)]


class ReportResolutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: ReviewReportStatus


# ---------------------------------------------------------------------------
# Support tickets
# ---------------------------------------------------------------------------

TicketCategory = Literal[
    "booking_issue",
    "technician_issue",
    "payment_query",
    "warranty_claim",
    "repair_quality",
    "refund_request",
    "account_issue",
    "other",
]
TicketStatus = Literal[
    "open",
    "assigned",
    "in_progress",
    "waiting_for_customer",
    "resolved",
    "closed",
]
TicketPriority = Literal["normal", "high", "urgent"]
TicketEscalationStatus = Literal["normal", "escalated"]


class TicketCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: TicketCategory
    subject: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    description: Annotated[str, Field(min_length=10, max_length=5000)]
    booking_id: UUID | None = None
    technician_user_id: UUID | None = None
    warranty_claim_id: UUID | None = None


class TicketMessageCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    body: Annotated[str, Field(min_length=1, max_length=4000)]


class TicketMessageResponse(BaseModel):
    id: UUID
    author_kind: Literal["customer", "staff"]
    body: str
    created_at: datetime


class TicketEventResponse(BaseModel):
    """Customer-safe lifecycle entry; staff notes and identities are not exposed."""

    event_type: str
    from_status: TicketStatus | None
    to_status: TicketStatus | None
    created_at: datetime


class TicketSummaryResponse(BaseModel):
    id: UUID
    category: TicketCategory
    subject: str
    status: TicketStatus
    priority: TicketPriority
    escalation_status: TicketEscalationStatus
    booking_id: UUID | None
    technician_user_id: UUID | None
    warranty_claim_id: UUID | None
    created_at: datetime
    updated_at: datetime


class TicketListResponse(BaseModel):
    items: list[TicketSummaryResponse]
    total: int


class TicketDetailResponse(TicketSummaryResponse):
    description: str
    resolved_at: datetime | None
    closed_at: datetime | None
    messages: list[TicketMessageResponse]
    events: list[TicketEventResponse]


class AdminTicketInternalNoteResponse(BaseModel):
    id: UUID
    author_user_id: UUID
    body: str
    created_at: datetime


class AdminTicketEventResponse(TicketEventResponse):
    actor_user_id: UUID | None


class AdminTicketListItem(TicketSummaryResponse):
    customer_user_id: UUID
    customer_display_name: str | None
    assigned_to: UUID | None
    assigned_to_name: str | None


class AdminTicketListResponse(BaseModel):
    items: list[AdminTicketListItem]
    total: int


class AdminTicketDetailResponse(AdminTicketListItem):
    description: str
    resolved_at: datetime | None
    closed_at: datetime | None
    assigned_at: datetime | None
    messages: list[TicketMessageResponse]
    internal_notes: list[AdminTicketInternalNoteResponse]
    events: list[AdminTicketEventResponse]


class TicketAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_user_id: UUID


class TicketStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: TicketStatus


class TicketEscalateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: Annotated[str, Field(min_length=10, max_length=500)]


# ---------------------------------------------------------------------------
# Admin customers
# ---------------------------------------------------------------------------


class AdminAccountStatusRequest(BaseModel):
    """Mandatory justification for suspending or reactivating an account."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: Annotated[str, Field(min_length=10, max_length=500)]


class AdminCustomerBookingSummary(BaseModel):
    id: UUID
    service_slug: str
    status: str
    preferred_date: date
    created_at: datetime


class AdminCustomerTicketSummary(BaseModel):
    id: UUID
    category: TicketCategory
    subject: str
    status: TicketStatus
    created_at: datetime


class AdminCustomerSummary(BaseModel):
    user_id: UUID
    email: str | None
    display_name: str | None
    account_status: str
    role_codes: list[str]
    created_at: datetime
    bookings_total: int
    last_booking_at: datetime | None


class AdminCustomerListResponse(BaseModel):
    items: list[AdminCustomerSummary]
    total: int


class AdminCustomerDetailResponse(BaseModel):
    user_id: UUID
    email: str | None
    display_name: str | None
    phone_e164: str | None
    account_status: str
    role_codes: list[str]
    created_at: datetime
    bookings_total: int
    bookings_completed: int
    bookings_cancelled: int
    reviews_submitted: int
    open_tickets: int
    appliance_count: int
    warranty_count: int
    open_warranty_claims: int
    recent_bookings: list[AdminCustomerBookingSummary]
    recent_tickets: list[AdminCustomerTicketSummary]


# ---------------------------------------------------------------------------
# Admin audit
# ---------------------------------------------------------------------------


class AuditEntry(BaseModel):
    id: UUID | None
    source: str
    actor_user_id: UUID | None
    actor_label: str | None
    action: str
    entity_type: str
    entity_id: UUID
    detail: str | None
    note: str | None
    is_internal: bool
    created_at: datetime


class AuditListResponse(BaseModel):
    items: list[AuditEntry]
    total: int


# ---------------------------------------------------------------------------
# Admin overview
# ---------------------------------------------------------------------------


class OverviewMetrics(BaseModel):
    total_customers: int
    total_technicians: int
    verified_technicians: int | None
    pending_technician_verifications: int | None
    total_bookings: int
    active_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    pending_quotations: int
    approved_quotations: int
    open_support_tickets: int
    average_rating: float | None
    review_count: int


class BookingTrendPoint(BaseModel):
    date: date
    count: int


class StatusDistributionPoint(BaseModel):
    status: str
    count: int


class CategoryPopularityPoint(BaseModel):
    service_slug: str
    count: int


class TechnicianPerformancePoint(BaseModel):
    technician_user_id: UUID
    display_name: str
    completed_bookings: int
    average_rating: float | None
    review_count: int


class SatisfactionTrendPoint(BaseModel):
    week_start: date
    average_rating: float | None
    review_count: int


class RecentActivityEntry(BaseModel):
    source: str
    actor_label: str | None
    action: str
    entity_type: str
    created_at: datetime


class AdminOverviewResponse(BaseModel):
    range_days: int
    metrics: OverviewMetrics
    booking_trend: list[BookingTrendPoint]
    status_distribution: list[StatusDistributionPoint]
    category_popularity: list[CategoryPopularityPoint]
    technician_performance: list[TechnicianPerformancePoint]
    satisfaction_trend: list[SatisfactionTrendPoint]
    recent_activity: list[RecentActivityEntry]
