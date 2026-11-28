"""Self-service provisioning and role-protected account APIs."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.authorization import (
    get_current_app_user,
    require_customer_role,
    require_technician_role,
)
from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import (
    AppUser,
    CustomerProfile,
    Service,
    ServiceCategory,
    TechnicianProfile,
)
from app.schemas.accounts import (
    AccountProfileResponse,
    AccountStatus,
    CurrentAccountResponse,
    ProvisionAccountRequest,
    ProvisionedProfileResponse,
    TechnicianRegistrationRequest,
)
from app.services.account_provisioning import provision_self_service_profile

router = APIRouter(tags=['accounts'])
customer_router = APIRouter(prefix='/account/customer', tags=['customer account'])
technician_router = APIRouter(prefix='/account/technician', tags=['technician account'])


@router.post('/auth/attempt', status_code=204, include_in_schema=False)
def limit_auth_attempt(
    _limited: Annotated[None, Depends(rate_limit('auth'))],
) -> None:
    """BFF abuse gate; buckets by ASGI network peer, never forwarded browser claims."""


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


@router.post('/auth/provision/technician-application')
def provision_technician_application(
    request: TechnicianRegistrationRequest,
    identity: Annotated[VerifiedIdentity, Depends(get_current_identity)],
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Atomically submit a complete owner-scoped application for review."""
    from app.schemas.technician_management import (
        TechnicianCoverageAreaInput,
        TechnicianCoverageUpdateRequest,
        TechnicianProfileUpdateRequest,
        TechnicianSkillInput,
        TechnicianSkillsUpdateRequest,
    )
    from app.services.technician_management import (
        submit_for_verification,
        update_technician_coverage,
        update_technician_profile,
        update_technician_skills,
    )

    # Validate catalog references before creating any identity or role rows. This
    # also avoids SQLite SAVEPOINT behavior persisting a new user on early failure.
    available = set(session.scalars(
        select(Service.slug).join(ServiceCategory, Service.category_id == ServiceCategory.id).where(
            Service.slug.in_(request.service_slugs), Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
    ).all())
    if available != set(request.service_slugs):
        raise HTTPException(status_code=422, detail={
            'code': 'invalid_service', 'message': 'Skills may reference active services only.'
        })
    result = provision_self_service_profile(
        session, identity, profile_type='technician', display_name=request.display_name
    )
    user = session.get(AppUser, result.user_id)
    profile = session.scalar(
        select(TechnicianProfile).where(TechnicianProfile.user_id == result.user_id).with_for_update()
    )
    assert user is not None and profile is not None
    # Retrying a previously submitted application never changes reviewed information.
    if profile.verification_status == 'pending_review':
        return {'status': 'pending_review'}
    if profile.verification_status != 'not_submitted':
        raise HTTPException(
            status_code=409,
            detail={'code': 'application_exists', 'message': 'An application already exists.'},
        )
    profile.phone_e164 = request.phone_e164
    update_technician_profile(session, user, TechnicianProfileUpdateRequest(
        display_name=request.display_name,
        professional_description=request.professional_description,
        years_experience=request.years_experience,
    ))
    update_technician_skills(session, user, TechnicianSkillsUpdateRequest(
        skills=[TechnicianSkillInput(service_slug=slug) for slug in request.service_slugs],
    ))
    update_technician_coverage(session, user, TechnicianCoverageUpdateRequest(
        areas=[TechnicianCoverageAreaInput(
            area_name=request.area_name, city=request.city,
            state=request.state, postal_code=request.postal_code,
        )],
    ))
    submit_for_verification(session, user)
    session.commit()
    return {'status': 'pending_review'}


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
