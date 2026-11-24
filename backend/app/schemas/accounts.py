"""Request and response contracts for account provisioning and authorization."""

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class AdminStatusUpdateRequest(BaseModel):
    """An explicit status transition requested by an authenticated administrator."""

    model_config = ConfigDict(extra='forbid')

    status: AccountStatus


class AdminManagedUserResponse(BaseModel):
    """Server-side status and role assignments for an admin-only user operation."""

    user_id: UUID
    account_status: AccountStatus
    role_codes: list[str]
