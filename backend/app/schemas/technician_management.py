"""Private technician profile, preference, and review contracts."""

import re
import unicodedata
from datetime import datetime, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OnboardingStatus = Literal['incomplete', 'complete']
VerificationStatus = Literal['not_submitted', 'pending_review', 'approved', 'rejected']
Weekday = Literal['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']


class TechnicianProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    display_name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    professional_description: Annotated[str, Field(max_length=2000)] | None = None
    years_experience: Annotated[int, Field(ge=0, le=60)] | None = None

    @model_validator(mode='after')
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError('At least one field must be provided.')
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None and field_name != 'years_experience':
                raise ValueError(f'{field_name} cannot be null.')
        return self


class TechnicianProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    display_name: str
    email: str | None
    professional_description: str
    years_experience: int | None
    onboarding_status: OnboardingStatus
    account_status: Literal['pending', 'active', 'suspended', 'disabled'] | None = None
    verification_status: VerificationStatus
    verification_submitted_at: datetime | None
    verification_reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TechnicianSkillInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    service_slug: Annotated[
        str, Field(min_length=1, max_length=80, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    ]
    years_experience: Annotated[int, Field(ge=0, le=60)] | None = None


class TechnicianSkillsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    skills: Annotated[list[TechnicianSkillInput], Field(max_length=100)]

    @model_validator(mode='after')
    def require_unique_services(self):
        slugs = [skill.service_slug for skill in self.skills]
        if len(set(slugs)) != len(slugs):
            raise ValueError('A service can be selected only once.')
        return self


class TechnicianSkillResponse(BaseModel):
    service_id: UUID
    service_slug: str
    title: str
    is_active: bool
    years_experience: int | None


class TechnicianSkillsResponse(BaseModel):
    skills: list[TechnicianSkillResponse]


class TechnicianCoverageAreaInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    area_name: Annotated[str, Field(min_length=1, max_length=120)]
    city: Annotated[str, Field(min_length=1, max_length=120)]
    state: Annotated[str, Field(min_length=1, max_length=120)]
    postal_code: Annotated[str, Field(max_length=12)] = ''
    center_latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    center_longitude: Annotated[float, Field(ge=-180, le=180)] | None = None

    @model_validator(mode='after')
    def validate_optional_map_center(self):
        if (self.center_latitude is None) != (self.center_longitude is None):
            raise ValueError('An approximate service-area center needs both coordinates.')
        return self

    @field_validator('postal_code')
    @classmethod
    def clean_postal_code(cls, value: str) -> str:
        value = value.strip()
        if value and not value.replace('-', '').replace(' ', '').isalnum():
            raise ValueError('Postal code contains unsupported characters.')
        return value


class TechnicianCoverageUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    areas: Annotated[list[TechnicianCoverageAreaInput], Field(max_length=30)]

    @model_validator(mode='after')
    def require_unique_areas(self):
        def normalize(value: str) -> str:
            return re.sub(
                r'\s+',
                ' ',
                unicodedata.normalize('NFKC', value).strip(),
            ).casefold()

        keys = {
            '|'.join(
                normalize(value)
                for value in (area.area_name, area.city, area.state, area.postal_code)
            )
            for area in self.areas
        }
        if len(keys) != len(self.areas):
            raise ValueError('Coverage areas must be unique for this technician.')
        return self


class TechnicianCoverageAreaResponse(TechnicianCoverageAreaInput):
    id: UUID


class TechnicianCoverageResponse(BaseModel):
    areas: list[TechnicianCoverageAreaResponse]


class AvailabilityDayPreference(BaseModel):
    model_config = ConfigDict(extra='forbid')

    available: bool
    start: time | None = None
    end: time | None = None

    @model_validator(mode='after')
    def validate_times(self):
        if self.available and (self.start is None or self.end is None):
            raise ValueError('Available days require start and end times.')
        if self.start is not None and self.end is not None and self.start >= self.end:
            raise ValueError('End time must be later than start time.')
        return self


class TechnicianAvailabilityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    timezone_name: Annotated[str, Field(min_length=1, max_length=64)] = 'Asia/Kolkata'
    weekly_schedule: dict[Weekday, AvailabilityDayPreference]

    @model_validator(mode='after')
    def require_all_weekdays(self):
        expected = {
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
        }
        if set(self.weekly_schedule) != expected:
            raise ValueError('Availability preferences must specify every weekday.')
        return self


class TechnicianAvailabilityResponse(BaseModel):
    timezone_name: str
    weekly_schedule: dict[Weekday, AvailabilityDayPreference]


class VerificationSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')


class TechnicianOnboardingResponse(BaseModel):
    onboarding_status: OnboardingStatus
    verification_status: VerificationStatus
    missing_requirements: list[str]


class TechnicianVerificationStatusResponse(BaseModel):
    verification_status: VerificationStatus
    onboarding_status: OnboardingStatus
    verification_submitted_at: datetime | None
    verification_reviewed_at: datetime | None


class AdminVerificationDecisionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    decision: Literal['approved', 'rejected']
    note: Annotated[str, Field(max_length=2000)] = ''

    @model_validator(mode='after')
    def require_rejection_reason(self):
        if self.decision == 'rejected' and not self.note.strip():
            raise ValueError('A reason is required when rejecting verification.')
        return self


class AdminVerificationReviewResponse(BaseModel):
    id: UUID
    technician_user_id: UUID
    reviewer_user_id: UUID
    decision: Literal['approved', 'rejected']
    note: str | None
    created_at: datetime


class AdminTechnicianResponse(BaseModel):
    user_id: UUID
    email: str | None
    display_name: str
    professional_description: str
    years_experience: int | None
    onboarding_status: OnboardingStatus
    verification_status: VerificationStatus
    verification_submitted_at: datetime | None
    verification_reviewed_at: datetime | None
    skills: list[TechnicianSkillResponse]
    coverage_areas: list[TechnicianCoverageAreaResponse]
    created_at: datetime
    updated_at: datetime


class AdminTechnicianDetailResponse(AdminTechnicianResponse):
    reviews: list[AdminVerificationReviewResponse]
