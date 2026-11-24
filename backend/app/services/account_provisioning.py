"""Idempotent self-service role/profile provisioning with server-owned policy."""

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.tokens import VerifiedIdentity
from app.models import (
    AppUser,
    CustomerProfile,
    Role,
    TechnicianProfile,
    UserAuditEvent,
    UserRole,
)
from app.schemas.accounts import AccountStatus, ProvisionedProfileResponse


def _lookup_external_user(session: Session, identity: VerifiedIdentity) -> AppUser | None:
    return session.scalar(
        select(AppUser)
        .where(
            AppUser.auth_issuer == identity.issuer,
            AppUser.auth_subject == identity.subject,
        )
        .with_for_update()
    )


def _get_or_create_user(session: Session, identity: VerifiedIdentity) -> AppUser:
    user = _lookup_external_user(session, identity)
    if user is not None:
        if user.status != AccountStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={'code': 'forbidden', 'message': 'Access denied.'},
            )
        return user

    candidate = AppUser(
        auth_issuer=identity.issuer,
        auth_subject=identity.subject,
        status=AccountStatus.ACTIVE.value,
    )
    try:
        # A savepoint lets concurrent first-time requests recover from the unique identity
        # constraint without aborting the request's outer transaction.
        with session.begin_nested():
            session.add(candidate)
            session.flush()
    except IntegrityError:
        user = _lookup_external_user(session, identity)
        if user is None:
            raise
        if user.status != AccountStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={'code': 'forbidden', 'message': 'Access denied.'},
            )
        return user

    session.add(
        UserAuditEvent(
            actor_user_id=candidate.id,
            subject_user_id=candidate.id,
            action='status.changed',
            before_value=None,
            after_value=AccountStatus.ACTIVE.value,
        )
    )
    return candidate


def provision_self_service_profile(
    session: Session,
    identity: VerifiedIdentity,
    *,
    profile_type: Literal['customer', 'technician'],
    display_name: str,
) -> ProvisionedProfileResponse:
    """Create a server-selected public role and its matching profile at most once."""

    user = _get_or_create_user(session, identity)
    role = session.get(Role, profile_type)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'account_setup_unavailable', 'message': 'Account setup is unavailable.'},
        )

    assignment = session.get(UserRole, (user.id, profile_type))
    if assignment is None:
        session.add(UserRole(user_id=user.id, role_code=profile_type, granted_by=user.id))
        session.add(
            UserAuditEvent(
                actor_user_id=user.id,
                subject_user_id=user.id,
                action='role.granted',
                before_value=None,
                after_value=profile_type,
            )
        )

    if profile_type == 'customer':
        profile = session.get(CustomerProfile, user.id)
        if profile is None:
            profile = CustomerProfile(user_id=user.id, display_name=display_name)
            session.add(profile)
    else:
        profile = session.get(TechnicianProfile, user.id)
        if profile is None:
            profile = TechnicianProfile(user_id=user.id, display_name=display_name)
            session.add(profile)

    session.flush()
    return ProvisionedProfileResponse(
        user_id=user.id,
        account_status=AccountStatus(user.status),
        profile_type=profile_type,
        display_name=profile.display_name,
    )
