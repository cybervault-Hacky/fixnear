"""Admin-only user management operations and append-only audit event creation."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AppUser, Role, UserAuditEvent, UserRole
from app.schemas.accounts import AccountStatus, AdminManagedUserResponse, RoleCode


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={'code': 'not_found', 'message': 'User or role not found.'},
    )


def _lock_admin_catalog_row(session: Session) -> Role:
    """Serialize admin-role/status transitions to protect the last-admin invariant."""

    role = session.scalar(
        select(Role).where(Role.code == RoleCode.ADMIN.value).with_for_update()
    )
    if role is None:
        raise _not_found()
    return role


def get_managed_user(session: Session, user_id: UUID) -> AppUser:
    user = session.get(AppUser, user_id)
    if user is None:
        raise _not_found()
    return user


def _active_admin_count(session: Session) -> int:
    count = session.scalar(
        select(func.count(AppUser.id))
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(AppUser.status == AccountStatus.ACTIVE.value, UserRole.role_code == RoleCode.ADMIN.value)
    )
    return int(count or 0)


def _managed_user_response(session: Session, user: AppUser) -> AdminManagedUserResponse:
    role_codes = session.scalars(
        select(UserRole.role_code).where(UserRole.user_id == user.id).order_by(UserRole.role_code)
    ).all()
    return AdminManagedUserResponse(
        user_id=user.id,
        account_status=AccountStatus(user.status),
        role_codes=list(role_codes),
    )


def read_managed_user(session: Session, user_id: UUID) -> AdminManagedUserResponse:
    return _managed_user_response(session, get_managed_user(session, user_id))


def grant_role(
    session: Session,
    *,
    actor: AppUser,
    subject_id: UUID,
    role_code: RoleCode,
    reason: str,
) -> AdminManagedUserResponse:
    role = (
        _lock_admin_catalog_row(session)
        if role_code is RoleCode.ADMIN
        else session.get(Role, role_code.value)
    )
    if role is None:
        raise _not_found()
    subject = get_managed_user(session, subject_id)

    assignment = session.get(UserRole, (subject.id, role_code.value))
    if assignment is None:
        session.add(
            UserRole(user_id=subject.id, role_code=role_code.value, granted_by=actor.id)
        )
        session.add(
            UserAuditEvent(
                actor_user_id=actor.id,
                subject_user_id=subject.id,
                action='role.granted',
                before_value=None,
                after_value=role_code.value,
                reason=reason,
            )
        )
        session.flush()

    return _managed_user_response(session, subject)


def revoke_role(
    session: Session,
    *,
    actor: AppUser,
    subject_id: UUID,
    role_code: RoleCode,
    reason: str,
) -> AdminManagedUserResponse:
    role = (
        _lock_admin_catalog_row(session)
        if role_code is RoleCode.ADMIN
        else session.get(Role, role_code.value)
    )
    if role is None:
        raise _not_found()
    subject = get_managed_user(session, subject_id)

    assignment = session.get(UserRole, (subject.id, role_code.value))
    if assignment is not None:
        if (
            role_code is RoleCode.ADMIN
            and subject.status == AccountStatus.ACTIVE.value
            and _active_admin_count(session) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'code': 'last_active_admin',
                    'message': 'At least one active administrator is required.',
                },
            )

        session.delete(assignment)
        session.add(
            UserAuditEvent(
                actor_user_id=actor.id,
                subject_user_id=subject.id,
                action='role.revoked',
                before_value=role_code.value,
                after_value='revoked',
                reason=reason,
            )
        )
        session.flush()

    return _managed_user_response(session, subject)


def change_user_status(
    session: Session,
    *,
    actor: AppUser,
    subject_id: UUID,
    new_status: AccountStatus,
    reason: str,
) -> AdminManagedUserResponse:
    # Serialize status changes against every grant/revoke of the admin role. The lock is
    # intentionally acquired before reading the target so concurrent updates see fresh state.
    _lock_admin_catalog_row(session)
    subject = get_managed_user(session, subject_id)
    previous_status = AccountStatus(subject.status)

    if previous_status is not new_status:
        is_admin = session.get(UserRole, (subject.id, RoleCode.ADMIN.value)) is not None
        if (
            is_admin
            and subject.status == AccountStatus.ACTIVE.value
            and new_status is not AccountStatus.ACTIVE
            and _active_admin_count(session) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'code': 'last_active_admin',
                    'message': 'At least one active administrator is required.',
                },
            )

        if actor.id == subject.id and new_status is not AccountStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'code': 'cannot_suspend_self',
                    'message': 'You cannot suspend your own account.',
                },
            )

        subject.status = new_status.value
        session.add(
            UserAuditEvent(
                actor_user_id=actor.id,
                subject_user_id=subject.id,
                action='status.changed',
                before_value=previous_status.value,
                after_value=new_status.value,
                reason=reason,
            )
        )
        session.flush()

    return _managed_user_response(session, subject)
