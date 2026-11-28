"""Validated request and response contracts for the HomePassport APIs."""

from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator

ApplianceCategory = Literal[
    'air_conditioner',
    'refrigerator',
    'washing_machine',
    'ro_water_purifier',
    'television',
    'microwave',
    'geyser',
    'dishwasher',
    'electrical',
    'other',
]
ServiceHistorySource = Literal['fixnear_verified', 'customer_reported']
WarrantyType = Literal['manufacturer', 'extended', 'service', 'part']
VerificationStatus = Literal['unverified', 'pending_review', 'verified']
ClaimStatus = Literal[
    'submitted',
    'additional_information_requested',
    'under_review',
    'approved',
    'rejected',
    'closed',
]
WarrantyDisplayStatus = Literal[
    'upcoming',
    'active',
    'expired',
    'claim_submitted',
    'under_review',
    'approved',
    'rejected',
    'closed',
]
DocumentType = Literal[
    'purchase_invoice',
    'warranty_certificate',
    'repair_report',
    'service_invoice',
    'parts_receipt',
    'photo',
    'other',
]
AllowedDocumentContentType = Literal[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]
ReminderType = Literal['scheduled_maintenance', 'custom']

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024


def _validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ValueError('Select a supported time zone.') from None
    return value


def _not_future(value: date | None, field: str) -> date | None:
    if value is not None and value > datetime.now(UTC).date():
        raise ValueError(f'{field} cannot be in the future.')
    return value


class ApplianceCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    name: Annotated[str, Field(min_length=1, max_length=120)]
    category: ApplianceCategory
    brand: Annotated[str, Field(min_length=1, max_length=120)]
    model_number: Annotated[str, Field(min_length=1, max_length=120)]
    serial_number: Annotated[str, Field(max_length=120)] | None = None
    purchase_date: date | None = None
    installation_date: date | None = None
    purchase_price_paise: Annotated[int, Field(ge=0, le=10_000_000_000)] | None = None
    seller_name: Annotated[str, Field(max_length=160)] | None = None
    notes: Annotated[str, Field(max_length=4000)] | None = None

    @model_validator(mode='after')
    def validate_dates(self):
        _not_future(self.purchase_date, 'Purchase date')
        if (
            self.installation_date is not None
            and self.purchase_date is not None
            and self.installation_date < self.purchase_date
        ):
            raise ValueError('Installation date cannot be before the purchase date.')
        return self


class ApplianceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    category: ApplianceCategory | None = None
    brand: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    model_number: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    serial_number: Annotated[str, Field(max_length=120)] | None = None
    purchase_date: date | None = None
    installation_date: date | None = None
    purchase_price_paise: Annotated[int, Field(ge=0, le=10_000_000_000)] | None = None
    seller_name: Annotated[str, Field(max_length=160)] | None = None
    notes: Annotated[str, Field(max_length=4000)] | None = None

    @model_validator(mode='after')
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError('At least one appliance field must be provided.')
        clearable = {
            'serial_number',
            'purchase_date',
            'installation_date',
            'purchase_price_paise',
            'seller_name',
            'notes',
        }
        for field in self.model_fields_set:
            if getattr(self, field) is None and field not in clearable:
                raise ValueError('Appliance fields cannot be cleared.')
        if 'purchase_date' in self.model_fields_set:
            _not_future(self.purchase_date, 'Purchase date')
        return self


class ApplianceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: ApplianceCategory
    brand: str
    model_number: str
    serial_number: str | None
    purchase_date: date | None
    installation_date: date | None
    purchase_price_paise: int | None
    seller_name: str | None
    notes: str | None
    has_photo: bool
    is_archived: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ServiceHistoryCreateRequest(BaseModel):
    """Customer-entered historical repair; always labelled as not verified."""

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    service_date: date
    service_category: Annotated[str, Field(min_length=2, max_length=80)]
    provider_name: Annotated[str, Field(max_length=160)] | None = None
    problem_description: Annotated[str, Field(max_length=4000)] | None = None
    work_performed: Annotated[str, Field(max_length=4000)] | None = None
    labour_charges_paise: Annotated[int, Field(ge=0, le=10_000_000_000)] | None = None

    @model_validator(mode='after')
    def validate_date(self):
        _not_future(self.service_date, 'Service date')
        if (
            self.problem_description is None
            and self.work_performed is None
        ):
            raise ValueError('Describe the problem or the work that was performed.')
        return self


class ServiceHistoryFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    customer_feedback: Annotated[str, Field(min_length=2, max_length=2000)] | None


class ServiceHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    appliance_id: UUID
    booking_id: UUID | None
    source: ServiceHistorySource
    service_date: date
    service_category: str
    booking_reference: str | None
    technician_name: str | None
    problem_description: str | None
    inspection_findings: str | None
    work_performed: str | None
    labour_charges_paise: int | None
    approved_quote_total_paise: int | None
    completion_status: str
    customer_feedback: str | None
    created_at: datetime
    updated_at: datetime


class PartCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    part_name: Annotated[str, Field(min_length=1, max_length=160)]
    part_category: Annotated[str, Field(max_length=80)] | None = None
    brand: Annotated[str, Field(max_length=120)] | None = None
    part_number: Annotated[str, Field(max_length=120)] | None = None
    quantity: Annotated[int, Field(ge=1, le=10_000)] = 1
    replacement_date: date
    unit_price_paise: Annotated[int, Field(ge=0, le=10_000_000_000)] | None = None
    total_price_paise: Annotated[int, Field(ge=0, le=10_000_000_000_000)] | None = None
    technician_notes: Annotated[str, Field(max_length=2000)] | None = None

    @model_validator(mode='after')
    def validate_part(self):
        _not_future(self.replacement_date, 'Replacement date')
        if self.unit_price_paise is not None and self.total_price_paise is None:
            self.total_price_paise = self.quantity * self.unit_price_paise
        elif (
            self.unit_price_paise is not None
            and self.total_price_paise is not None
            and self.total_price_paise != self.quantity * self.unit_price_paise
        ):
            raise ValueError('Total price must equal quantity times unit price.')
        return self


class PartResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    appliance_id: UUID
    service_history_id: UUID | None
    booking_id: UUID | None
    source: ServiceHistorySource
    part_name: str
    part_category: str | None
    brand: str | None
    part_number: str | None
    quantity: int
    replacement_date: date
    unit_price_paise: int | None
    total_price_paise: int | None
    technician_notes: str | None
    created_at: datetime


class WarrantyCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    warranty_type: WarrantyType
    appliance_id: UUID | None = None
    part_id: UUID | None = None
    booking_id: UUID | None = None
    provider: Annotated[str, Field(min_length=2, max_length=160)]
    reference_number: Annotated[str, Field(max_length=120)] | None = None
    start_date: date
    end_date: date
    terms_summary: Annotated[str, Field(max_length=4000)] | None = None
    create_expiry_reminder: bool = True

    @model_validator(mode='after')
    def validate_warranty(self):
        if self.appliance_id is None and self.part_id is None:
            raise ValueError('Select an appliance or a replaced part for this warranty.')
        if self.end_date < self.start_date:
            raise ValueError('Warranty end date cannot be before the start date.')
        return self


class WarrantyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    provider: Annotated[str, Field(min_length=2, max_length=160)] | None = None
    reference_number: Annotated[str, Field(max_length=120)] | None = None
    start_date: date | None = None
    end_date: date | None = None
    terms_summary: Annotated[str, Field(max_length=4000)] | None = None

    @model_validator(mode='after')
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError('At least one warranty field must be provided.')
        if self.reference_number is None and 'reference_number' in self.model_fields_set:
            return self  # Explicitly clearing the reference number is allowed.
        for field in self.model_fields_set:
            if getattr(self, field) is None and field not in {
                'reference_number',
                'terms_summary',
            }:
                raise ValueError('Warranty fields cannot be cleared.')
        return self


class WarrantyClaimCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    issue_description: Annotated[str, Field(min_length=10, max_length=4000)]


class WarrantyClaimRespondRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    note: Annotated[str, Field(min_length=2, max_length=4000)]


class ClaimTransitionRequest(BaseModel):
    """Admin decisions; notes are mandatory for adverse or evidence-seeking steps."""

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    action: Literal[
        'start_review',
        'request_information',
        'approve',
        'reject',
        'close',
    ]
    note: Annotated[str, Field(max_length=1000)] | None = None

    @model_validator(mode='after')
    def require_note_for_reasoned_actions(self):
        if self.action in {'request_information', 'approve', 'reject'} and (
            self.note is None or len(self.note.strip()) < 3
        ):
            raise ValueError(
                'A recorded reason of at least 3 characters is required.'
            )
        return self


class AdminServiceHistoryCorrectionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    problem_description: Annotated[str, Field(max_length=4000)] | None = None
    inspection_findings: Annotated[str, Field(max_length=4000)] | None = None
    work_performed: Annotated[str, Field(max_length=4000)] | None = None
    note: Annotated[str, Field(min_length=3, max_length=1000)]

    @model_validator(mode='after')
    def require_changes(self):
        if not (
            self.model_fields_set
            & {'problem_description', 'inspection_findings', 'work_performed'}
        ):
            raise ValueError('Provide at least one field to correct.')
        return self


class AdminVerificationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    verification_status: VerificationStatus
    note: Annotated[str, Field(min_length=3, max_length=1000)]


class DocumentUploadIntentRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    document_type: DocumentType
    original_filename: Annotated[str, Field(min_length=1, max_length=255)]
    content_type: AllowedDocumentContentType
    size_bytes: Annotated[int, Field(ge=1, le=MAX_DOCUMENT_BYTES)]
    appliance_id: UUID | None = None
    warranty_id: UUID | None = None
    claim_id: UUID | None = None
    booking_id: UUID | None = None

    @model_validator(mode='after')
    def validate_filename(self):
        filename = self.original_filename.strip()
        if any(part in filename for part in ('\x00', '/', '\\')) or filename in {'.', '..'}:
            raise ValueError('The file name is not allowed.')
        self.original_filename = filename
        return self


class ReminderCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    reminder_type: ReminderType
    title: Annotated[str, Field(min_length=1, max_length=160)]
    due_date: date
    timezone_name: Annotated[str, Field(min_length=1, max_length=64)] = 'Asia/Kolkata'
    appliance_id: UUID | None = None

    @model_validator(mode='after')
    def validate_timezone(self):
        _validate_timezone(self.timezone_name)
        return self


class ReminderUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    title: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    due_date: date | None = None
    is_enabled: bool | None = None

    @model_validator(mode='after')
    def require_changes(self):
        if not self.model_fields_set:
            raise ValueError('At least one reminder field must be provided.')
        if 'title' in self.model_fields_set and self.title is None:
            raise ValueError('Title cannot be cleared.')
        if 'due_date' in self.model_fields_set and self.due_date is None:
            raise ValueError('Due date cannot be cleared.')
        if 'is_enabled' in self.model_fields_set and self.is_enabled is None:
            raise ValueError('is_enabled cannot be cleared.')
        return self


class ApplianceListResponse(BaseModel):
    items: list[ApplianceResponse]
    total: int


class ServiceHistoryListResponse(BaseModel):
    items: list[ServiceHistoryResponse]
    total: int


class PartListResponse(BaseModel):
    items: list[PartResponse]
    total: int


class WarrantyResponse(BaseModel):
    id: UUID
    appliance_id: UUID | None
    appliance_name: str | None
    part_id: UUID | None
    part_name: str | None
    booking_id: UUID | None
    warranty_type: WarrantyType
    provider: str
    reference_number: str | None
    start_date: date
    end_date: date
    terms_summary: str | None
    verification_status: VerificationStatus
    status: WarrantyDisplayStatus
    days_remaining: int
    claim_eligible: bool
    open_claim_id: UUID | None
    latest_claim_status: ClaimStatus | None
    created_at: datetime
    updated_at: datetime


class WarrantyListResponse(BaseModel):
    items: list[WarrantyResponse]
    total: int


class ClaimHistoryResponse(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    actor_role: Literal['customer', 'admin']
    from_status: ClaimStatus | None
    to_status: ClaimStatus
    note: str | None
    created_at: datetime


class ClaimResponse(BaseModel):
    id: UUID
    warranty_id: UUID
    warranty_provider: str
    warranty_type: WarrantyType
    appliance_id: UUID | None
    appliance_name: str | None
    customer_user_id: UUID
    issue_description: str
    status: ClaimStatus
    submitted_at: datetime
    decided_by_user_id: UUID | None
    decided_at: datetime | None
    decision_reason: str | None
    created_at: datetime
    updated_at: datetime
    history: list[ClaimHistoryResponse]


class ClaimListResponse(BaseModel):
    items: list[ClaimResponse]
    total: int


class DocumentResponse(BaseModel):
    id: UUID
    appliance_id: UUID | None
    warranty_id: UUID | None
    claim_id: UUID | None
    booking_id: UUID | None
    document_type: DocumentType
    original_filename: str
    content_type: str
    size_bytes: int
    status: Literal['pending_upload', 'uploaded', 'failed']
    created_at: datetime


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    upload_available: bool


class DocumentUploadIntentResponse(BaseModel):
    document_id: UUID
    upload_url: str
    headers: dict[str, str]
    expires_at: datetime


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    appliance_id: UUID | None
    warranty_id: UUID | None
    reminder_type: str
    title: str
    due_date: date
    timezone_name: str
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class ReminderListResponse(BaseModel):
    items: list[ReminderResponse]
    total: int


class ApplianceDetailResponse(ApplianceResponse):
    service_history: list[ServiceHistoryResponse]
    parts: list[PartResponse]
    warranties: list[WarrantyResponse]
    reminders: list[ReminderResponse]
    documents: list[DocumentResponse]


class HomePassportOverviewResponse(BaseModel):
    total_appliances: int
    active_warranties: int
    expiring_warranties_30d: int
    expired_warranties: int
    open_claims: int
    recent_service_history: list[ServiceHistoryResponse]
    recent_parts: list[PartResponse]


class AdminClaimFilter(BaseModel):
    model_config = ConfigDict(extra='forbid')

    status: ClaimStatus | None = None


class AdminWarrantySummaryResponse(BaseModel):
    id: UUID
    customer_display_name: str | None
    appliance_name: str | None
    part_name: str | None
    warranty_type: WarrantyType
    provider: str
    reference_number: str | None
    start_date: date
    end_date: date
    verification_status: VerificationStatus
    status: WarrantyDisplayStatus


class AdminWarrantyListResponse(BaseModel):
    items: list[AdminWarrantySummaryResponse]
    total: int


class AdminAuditEventResponse(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    changed_fields: list[str]
    note: str | None
    actor_user_id: UUID | None
    created_at: datetime


class AdminAuditListResponse(BaseModel):
    items: list[AdminAuditEventResponse]
    total: int
