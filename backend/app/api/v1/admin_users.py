"""Audited administrative role and account-status management APIs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.accounts import (
    AdminManagedUserResponse,
    AdminRoleChangeRequest,
    AdminStatusUpdateRequest,
    RoleCode,
)
from app.services.admin_user_management import (
    change_user_status,
    grant_role,
    read_managed_user,
    revoke_role,
)

router = APIRouter(prefix='/admin/users', tags=['admin user management'])
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get('/{user_id}', response_model=AdminManagedUserResponse)
def get_user_for_management(
    user_id: UUID,
    _actor: AdminActor,
    session: DatabaseSession,
) -> AdminManagedUserResponse:
    """Read status and application-role assignments for one managed user."""

    return read_managed_user(session, user_id)


@router.put('/{user_id}/roles/{role_code}', response_model=AdminManagedUserResponse)
def grant_user_role(
    user_id: UUID,
    role_code: RoleCode,
    request: AdminRoleChangeRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> AdminManagedUserResponse:
    """Grant a catalogued role; the mandatory reason is stored on the audit event."""

    response = grant_role(
        session,
        actor=actor,
        subject_id=user_id,
        role_code=role_code,
        reason=request.reason,
    )
    session.commit()
    return response


@router.delete('/{user_id}/roles/{role_code}', response_model=AdminManagedUserResponse)
def revoke_user_role(
    user_id: UUID,
    role_code: RoleCode,
    request: AdminRoleChangeRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> AdminManagedUserResponse:
    """Revoke a role; the mandatory reason is stored on the audit event."""

    response = revoke_role(
        session,
        actor=actor,
        subject_id=user_id,
        role_code=role_code,
        reason=request.reason,
    )
    session.commit()
    return response


@router.patch('/{user_id}/status', response_model=AdminManagedUserResponse)
def change_managed_user_status(
    user_id: UUID,
    request: AdminStatusUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> AdminManagedUserResponse:
    """Change status from an explicit allowlisted request and audit actual changes."""

    response = change_user_status(
        session,
        actor=actor,
        subject_id=user_id,
        new_status=request.status,
        reason=request.reason,
    )
    session.commit()
    return response
