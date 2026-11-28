"""Validated request and response contracts for bookings and PriceLock quotes."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator

BookingStatus = Literal[
    "requested",
    "assigned",
    "accepted",
    "inspection_pending",
    "quote_pending",
    "quote_rejected",
    "approved",
    "in_progress",
    "completed",
    "cancelled",
]
QuoteStatus = Literal["pending", "approved", "rejected", "superseded", "expired"]
QuoteLineType = Literal["inspection", "labour", "part", "additional_fee", "tax"]


class CustomerAddressInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: Annotated[str, Field(min_length=1, max_length=40)]
    recipient_name: Annotated[str, Field(min_length=1, max_length=120)]
    address_line1: Annotated[str, Field(min_length=5, max_length=200)]
    address_line2: Annotated[str, Field(max_length=200)] | None = None
    locality: Annotated[str, Field(min_length=1, max_length=120)]
    city: Annotated[str, Field(min_length=1, max_length=120)]
    state: Annotated[str, Field(min_length=1, max_length=120)]
    postal_code: Annotated[
        str, Field(min_length=4, max_length=12, pattern=r"^[0-9A-Za-z -]+$")
    ]
    contact_phone: (
        Annotated[
            str, Field(min_length=8, max_length=16, pattern=r"^\+[1-9][0-9]{7,14}$")
        ]
        | None
    ) = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    location_accuracy_meters: Annotated[float, Field(ge=0, le=100000)] | None = None
    is_default: bool = False

    @model_validator(mode="after")
    def validate_optional_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("A saved location needs both latitude and longitude.")
        if self.location_accuracy_meters is not None and self.latitude is None:
            raise ValueError("Location accuracy requires saved coordinates.")
        return self


class CustomerAddressUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: Annotated[str, Field(min_length=1, max_length=40)] | None = None
    recipient_name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    address_line1: Annotated[str, Field(min_length=5, max_length=200)] | None = None
    address_line2: Annotated[str, Field(max_length=200)] | None = None
    locality: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    city: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    state: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    postal_code: (
        Annotated[str, Field(min_length=4, max_length=12, pattern=r"^[0-9A-Za-z -]+$")]
        | None
    ) = None
    contact_phone: (
        Annotated[
            str, Field(min_length=8, max_length=16, pattern=r"^\+[1-9][0-9]{7,14}$")
        ]
        | None
    ) = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    location_accuracy_meters: Annotated[float, Field(ge=0, le=100000)] | None = None
    is_default: bool | None = None

    @model_validator(mode="after")
    def require_patch_fields(self):
        if not self.model_fields_set:
            raise ValueError("At least one address field must be provided.")
        nullable_fields = {
            "address_line2",
            "contact_phone",
            "latitude",
            "longitude",
            "location_accuracy_meters",
        }
        if any(
            getattr(self, field) is None
            for field in self.model_fields_set
            if field not in nullable_fields
        ):
            raise ValueError("Address fields cannot be cleared.")
        coordinate_fields = {"latitude", "longitude"} & self.model_fields_set
        if coordinate_fields and not {"latitude", "longitude"} <= self.model_fields_set:
            raise ValueError("Update latitude and longitude together.")
        if (
            self.latitude is None
            and self.longitude is None
            and self.location_accuracy_meters is not None
        ):
            raise ValueError("Location accuracy requires saved coordinates.")
        return self


class CustomerAddressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    recipient_name: str
    address_line1: str
    address_line2: str | None
    locality: str
    city: str
    state: str
    postal_code: str
    contact_phone: str | None
    latitude: float | None
    longitude: float | None
    location_accuracy_meters: float | None
    is_default: bool
    created_at: datetime
    updated_at: datetime


class BookingCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    service_slug: Annotated[
        str, Field(min_length=1, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    ]
    appliance_id: UUID | None = None
    address_id: UUID | None = None
    new_address: CustomerAddressInput | None = None
    save_new_address: bool = False
    problem_description: Annotated[str, Field(min_length=20, max_length=4000)]
    preferred_date: date
    preferred_start: time
    preferred_end: time
    timezone_name: Annotated[str, Field(min_length=1, max_length=64)] = "Asia/Kolkata"

    @model_validator(mode="after")
    def validate_booking_request(self):
        if (self.address_id is None) == (self.new_address is None):
            raise ValueError(
                "Select one saved address or enter a new address, not both."
            )
        if self.save_new_address and self.new_address is None:
            raise ValueError("Only a newly entered address can be saved.")
        if self.preferred_start >= self.preferred_end:
            raise ValueError("Preferred end time must be later than the start time.")
        try:
            ZoneInfo(self.timezone_name)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Select a supported time zone.") from None
        return self


class BookingCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: Annotated[str, Field(min_length=5, max_length=1000)]


class BookingAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    technician_user_id: UUID
    note: Annotated[str, Field(max_length=500)] | None = None


class BookingAssignmentDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision: Literal["accept", "decline"]
    note: Annotated[str, Field(max_length=500)] | None = None


class BookingAssignmentDecisionResponse(BaseModel):
    booking_id: UUID
    decision: Literal["accept", "decline"]
    status: BookingStatus


class BookingTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: Literal["start_inspection", "start_work", "complete"]
    note: Annotated[str, Field(max_length=500)] | None = None


class BookingEscalationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["escalated", "resolved"]
    reason: Annotated[str, Field(min_length=5, max_length=1000)]


class QuoteLineItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    line_type: QuoteLineType
    description: Annotated[str, Field(min_length=1, max_length=240)]
    quantity: Annotated[int, Field(ge=1, le=10_000)] = 1
    unit_amount_paise: Annotated[int, Field(ge=0, le=10_000_000_000)]


class BookingQuoteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    items: Annotated[list[QuoteLineItemInput], Field(min_length=1, max_length=40)]
    expires_at: datetime
    technician_notes: Annotated[str, Field(max_length=2000)] | None = None

    @model_validator(mode="after")
    def validate_quote(self):
        if self.expires_at.tzinfo is None or self.expires_at.utcoffset() is None:
            raise ValueError("Quote expiry must include a time zone offset.")
        now = datetime.now(UTC)
        expiry = self.expires_at.astimezone(UTC)
        if expiry <= now or expiry > now + timedelta(days=90):
            raise ValueError(
                "Quote expiry must be in the future and no more than 90 days away."
            )
        total = sum(item.quantity * item.unit_amount_paise for item in self.items)
        if total > 1_000_000_000_000:
            raise ValueError("The calculated quotation exceeds the supported amount.")
        return self


class QuoteDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision: Literal["approved", "rejected"]
    note: Annotated[str, Field(min_length=5, max_length=1000)] | None = None

    @model_validator(mode="after")
    def require_rejection_reason(self):
        if self.decision == "rejected" and not self.note:
            raise ValueError("A short reason is required when rejecting a quotation.")
        return self


class AttachmentUploadIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    original_filename: Annotated[str, Field(min_length=1, max_length=255)]
    content_type: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]
    size_bytes: Annotated[int, Field(ge=1, le=20_000_000)]


class BookingEventResponse(BaseModel):
    id: UUID
    sequence: int
    event_type: str
    actor_user_id: UUID | None
    target_user_id: UUID | None
    from_status: str | None
    to_status: str | None
    reference_id: UUID | None
    note: str | None
    is_internal: bool
    created_at: datetime


class BookingQuoteLineItemResponse(BaseModel):
    id: UUID
    position: int
    line_type: QuoteLineType
    description: str
    quantity: int
    unit_amount_paise: int
    line_total_paise: int


class BookingQuoteResponse(BaseModel):
    id: UUID
    version: int
    status: QuoteStatus
    is_current: bool
    currency: str
    total_paise: int
    technician_notes: str | None
    issued_at: datetime
    expires_at: datetime
    is_expired: bool
    created_by_user_id: UUID
    decision_by_user_id: UUID | None
    decided_at: datetime | None
    decision_note: str | None
    line_items: list[BookingQuoteLineItemResponse]


VisitStatus = Literal["scheduled", "en_route", "arrived", "completed", "cancelled"]


class BookingVisitUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: VisitStatus
    eta_at: datetime | None = None

    @model_validator(mode="after")
    def validate_eta(self):
        if self.eta_at is not None:
            if self.eta_at.tzinfo is None or self.eta_at.utcoffset() is None:
                raise ValueError("ETA must include a time zone offset.")
            if self.status in {"scheduled", "en_route"} and self.eta_at.astimezone(
                UTC
            ) <= datetime.now(UTC):
                raise ValueError(
                    "ETA must be in the future for a scheduled or en-route visit."
                )
        return self


class BookingVisitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    booking_id: UUID
    status: VisitStatus
    eta_at: datetime | None
    eta_source: Literal["technician_manual", "admin_manual"] | None = None
    eta_updated_at: datetime | None = None
    updated_by_user_id: UUID | None
    updated_at: datetime
    live_tracking_status: Literal["unavailable"] = "unavailable"

    @model_validator(mode="after")
    def hide_unattributed_eta(self):
        if self.eta_source is None or self.eta_updated_at is None:
            self.eta_at = None
        return self


class BookingAddressSnapshotResponse(BaseModel):
    label: str
    recipient_name: str
    address_line1: str
    address_line2: str | None
    locality: str
    city: str
    state: str
    postal_code: str
    contact_phone: str | None
    latitude: float | None
    longitude: float | None
    location_accuracy_meters: float | None


class BookingSummaryResponse(BaseModel):
    id: UUID
    service_slug: str
    service_title: str
    appliance_id: UUID | None = None
    status: BookingStatus
    preferred_date: date
    preferred_start: time
    preferred_end: time
    timezone_name: str
    address_locality: str | None
    city: str | None
    assigned_technician_user_id: UUID | None
    assigned_technician_name: str | None
    current_quote_total_paise: int | None
    current_quote_status: QuoteStatus | None
    escalation_status: Literal["normal", "escalated", "resolved"]
    created_at: datetime
    updated_at: datetime
    version: int


class BookingDetailResponse(BookingSummaryResponse):
    customer_user_id: UUID
    customer_display_name: str | None
    service_id: UUID
    address: BookingAddressSnapshotResponse | None
    location_access_limited: bool = False
    problem_description: str
    cancellation_reason: str | None
    escalation_reason: str | None
    visit: BookingVisitResponse | None
    quotes: list[BookingQuoteResponse]
    events: list[BookingEventResponse]


class EligibleTechnicianResponse(BaseModel):
    user_id: UUID
    display_name: str
    coverage_area: str
    years_experience: int | None


class BookingListResponse(BaseModel):
    items: list[BookingSummaryResponse]
    total: int


class AttachmentUploadIntentResponse(BaseModel):
    attachment_id: UUID
    upload_url: str
    headers: dict[str, str]
    expires_at: datetime
