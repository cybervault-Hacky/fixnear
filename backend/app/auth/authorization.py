"""Database-backed account lookup and role authorization dependencies."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.accounts import RoleCode


def _access_denied() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={'code': 'forbidden', 'message': 'Access denied.'},
    )


def get_current_app_user(
    identity: Annotated[VerifiedIdentity, Depends(get_current_identity)],
    session: Annotated[Session, Depends(get_db_session)],
) -> AppUser:
    """Resolve a validated external subject to an active application account."""

    user = session.scalar(
        select(AppUser)
        .where(
            AppUser.auth_issuer == identity.issuer,
            AppUser.auth_subject == identity.subject,
        )
        .options(selectinload(AppUser.roles))
    )
    if user is None or user.status != 'active':
        raise _access_denied()
    return user


def require_role(role: RoleCode) -> Callable[..., AppUser]:
    """Build a dependency that checks the server-managed role grant table."""

    def require_database_role(
        user: Annotated[AppUser, Depends(get_current_app_user)],
    ) -> AppUser:
        if not any(assignment.role_code == role.value for assignment in user.roles):
            raise _access_denied()
        return user

    require_database_role.__name__ = f'require_{role.value}_role'
    return require_database_role


require_customer_role = require_role(RoleCode.CUSTOMER)
require_technician_role = require_role(RoleCode.TECHNICIAN)
require_admin_role = require_role(RoleCode.ADMIN)
