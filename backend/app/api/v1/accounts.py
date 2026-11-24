"""Self-service provisioning and role-protected account APIs."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.authorization import (
    get_current_app_user,
    require_customer_role,
    require_technician_role,
)
from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.session import get_db_session
from app.models import AppUser, CustomerProfile, TechnicianProfile
from app.schemas.accounts import (
    AccountProfileResponse,
    AccountStatus,
    CurrentAccountResponse,
    ProvisionAccountRequest,
    ProvisionedProfileResponse,
)
from app.services.account_provisioning import provision_self_service_profile

router = APIRouter(tags=['accounts'])
customer_router = APIRouter(prefix='/account/customer', tags=['customer account'])
technician_router = APIRouter(prefix='/account/technician', tags=['technician account'])


@router.post('/auth/provision/customer', response_model=ProvisionedProfileResponse)
def provision_customer_profile(
    request: ProvisionAccountRequest,
    identity: Annotated[VerifiedIdentity, Depends(get_current_identity)],
    session: Annotated[Session, Depends(get_db_session)],
) -> ProvisionedProfileResponse:
    """Provision only the customer role; caller-supplied roles and status are rejected."""

    result = provision_self_service_profile(
        session,
        identity,
        profile_type='customer',
        display_name=request.display_name,
    )
    session.commit()
    return result


@router.post('/auth/provision/technician', response_model=ProvisionedProfileResponse)
def provision_technician_profile(
    request: ProvisionAccountRequest,
    identity: Annotated[VerifiedIdentity, Depends(get_current_identity)],
    session: Annotated[Session, Depends(get_db_session)],
) -> ProvisionedProfileResponse:
    """Provision only the technician role; admin registration is not a public route."""

    result = provision_self_service_profile(
        session,
        identity,
        profile_type='technician',
        display_name=request.display_name,
    )
    session.commit()
    return result


@router.get('/auth/me', response_model=CurrentAccountResponse)
def read_current_account(
    user: Annotated[AppUser, Depends(get_current_app_user)],
) -> CurrentAccountResponse:
    """Return database-backed roles for display; authorization never uses client copies."""

    return CurrentAccountResponse(
        user_id=user.id,
        account_status=AccountStatus(user.status),
        role_codes=sorted(assignment.role_code for assignment in user.roles),
    )


@customer_router.get('/profile', response_model=AccountProfileResponse)
def read_customer_profile(
    user: Annotated[AppUser, Depends(require_customer_role)],
    session: Annotated[Session, Depends(get_db_session)],
) -> AccountProfileResponse:
    profile = session.get(CustomerProfile, user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'profile_not_found', 'message': 'Account profile not found.'},
        )
    return AccountProfileResponse(user_id=user.id, display_name=profile.display_name)


@technician_router.get('/profile', response_model=AccountProfileResponse)
def read_technician_profile(
    user: Annotated[AppUser, Depends(require_technician_role)],
    session: Annotated[Session, Depends(get_db_session)],
) -> AccountProfileResponse:
    profile = session.get(TechnicianProfile, user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'profile_not_found', 'message': 'Account profile not found.'},
        )
    return AccountProfileResponse(user_id=user.id, display_name=profile.display_name)
