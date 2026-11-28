"""Request and response contracts for account provisioning and authorization."""

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RoleCode(str, Enum):
    """Role codes that exist in the server-controlled role catalog."""

    CUSTOMER = 'customer'
    TECHNICIAN = 'technician'
    ADMIN = 'admin'


class AccountStatus(str, Enum):
    """Supported application-owned account statuses."""

    PENDING = 'pending'
    ACTIVE = 'active'
    SUSPENDED = 'suspended'
    DISABLED = 'disabled'


class ProvisionAccountRequest(BaseModel):
    """Display data accepted for a fixed-role self-service provisioning route."""

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=120)


class ProvisionedProfileResponse(BaseModel):
    """Result of idempotently provisioning one requested public profile type."""

    user_id: UUID
    account_status: AccountStatus
    profile_type: Literal['customer', 'technician']
    display_name: str


class CurrentAccountResponse(BaseModel):
    """The current database-backed application account, not JWT role metadata."""

    user_id: UUID
    account_status: AccountStatus
    role_codes: list[str]


class AccountProfileResponse(BaseModel):
    """Minimal authenticated customer or technician profile."""

    user_id: UUID
    display_name: str


class AdminReasonMixin(BaseModel):
    """Shared mandatory-justification contract for privileged admin mutations.

    The reason must be at least 10 visible characters after whitespace stripping;
    it is stored verbatim on the audit event and is never trusted from the client
    beyond this contract.
    """

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    reason: str = Field(min_length=10, max_length=500)


class AdminRoleChangeRequest(AdminReasonMixin):
    """Mandatory justification for granting or revoking an administrative role."""


class AdminStatusUpdateRequest(AdminReasonMixin):
    """An explicit status transition requested by an authenticated administrator."""

    status: AccountStatus


class AdminManagedUserResponse(BaseModel):
    """Server-side status and role assignments for an admin-only user operation."""

    user_id: UUID
    account_status: AccountStatus
    role_codes: list[str]


class TechnicianRegistrationRequest(BaseModel):
    """Verified-identity application with no caller-controlled role or status."""

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    display_name: str = Field(min_length=2, max_length=120)
    phone_e164: str = Field(pattern=r'^\+[1-9][0-9]{7,14}$')
    professional_description: str = Field(min_length=30, max_length=2000)
    years_experience: int = Field(ge=0, le=60, strict=True)
    service_slugs: list[str] = Field(min_length=1, max_length=20)
    area_name: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=1, max_length=120)
    postal_code: str = Field(pattern=r'^[1-9][0-9]{5}$')

    @field_validator('service_slugs')
    @classmethod
    def validate_services(cls, value: list[str]) -> list[str]:
        import re

        if len(value) != len(set(value)) or any(
            not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', item) for item in value
        ):
            raise ValueError('Service choices must be unique slugs')
        return value
