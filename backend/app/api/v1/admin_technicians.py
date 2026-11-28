"""Admin-only technician verification queue and review decisions."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import AppUser, UserRole
from app.schemas.accounts import AccountStatus, AdminManagedUserResponse
from app.schemas.operations import AdminAccountStatusRequest
from app.schemas.technician_management import (
    AdminTechnicianDetailResponse,
    AdminTechnicianResponse,
    AdminVerificationDecisionRequest,
    AdminVerificationReviewResponse,
)
from app.services.admin_user_management import change_user_status
from app.services.technician_management import (
    get_admin_technician,
    list_admin_technicians,
    review_technician_verification,
)

router = APIRouter(prefix='/admin/technicians', tags=['admin technician review'])
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get('', response_model=list[AdminTechnicianResponse])
def list_technician_reviews(
    _actor: AdminActor,
    session: DatabaseSession,
    verification_status: Annotated[
        Literal['not_submitted', 'pending_review', 'approved', 'rejected'] | None,
        Query(),
    ] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    account_status: Annotated[
        Literal['pending', 'active', 'suspended', 'disabled'] | None, Query()
    ] = None,
    _rate_limit: Annotated[None, Depends(rate_limit('admin_search'))] = None,
) -> list[AdminTechnicianResponse]:
    """List private technician records for admins with optional search and status filters."""

    return [
        AdminTechnicianResponse.model_validate(item)
        for item in list_admin_technicians(
            session,
            verification_status=verification_status,
            search=search,
            account_status=account_status,
        )
    ]


@router.get('/{technician_user_id}', response_model=AdminTechnicianDetailResponse)
def read_technician_review(
    technician_user_id: UUID,
    _actor: AdminActor,
    session: DatabaseSession,
) -> AdminTechnicianDetailResponse:
    """Read a private technician dossier and its append-only review history."""

    return AdminTechnicianDetailResponse.model_validate(
        get_admin_technician(session, technician_user_id)
    )


def _require_technician_role(session, technician_user_id: UUID) -> AppUser:
    from fastapi import HTTPException
    from sqlalchemy import select

    role = session.scalar(
        select(UserRole).where(
            UserRole.user_id == technician_user_id,
            UserRole.role_code == 'technician',
        )
    )
    subject = session.get(AppUser, technician_user_id)
    if role is None or subject is None:
        raise HTTPException(
            status_code=404,
            detail={'code': 'technician_not_found', 'message': 'Technician not found.'},
        )
    return subject


@router.post('/{technician_user_id}/suspend', response_model=AdminManagedUserResponse)
def suspend_technician(
    technician_user_id: UUID,
    request: AdminAccountStatusRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    """Suspend a technician; mandatory, audited reason. New assignments stop immediately."""

    _require_technician_role(session, technician_user_id)
    response = change_user_status(
        session,
        actor=actor,
        subject_id=technician_user_id,
        new_status=AccountStatus.SUSPENDED,
        reason=request.reason,
    )
    session.commit()
    return response


@router.post('/{technician_user_id}/reactivate', response_model=AdminManagedUserResponse)
def reactivate_technician(
    technician_user_id: UUID,
    request: AdminAccountStatusRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    _require_technician_role(session, technician_user_id)
    response = change_user_status(
        session,
        actor=actor,
        subject_id=technician_user_id,
        new_status=AccountStatus.ACTIVE,
        reason=request.reason,
    )
    session.commit()
    return response


@router.patch(
    '/{technician_user_id}/verification', response_model=AdminVerificationReviewResponse
)
def decide_technician_verification(
    technician_user_id: UUID,
    request: AdminVerificationDecisionRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> AdminVerificationReviewResponse:
    """Approve or reject only a pending request as an authenticated active admin."""

    result = review_technician_verification(
        session,
        reviewer=actor,
        technician_user_id=technician_user_id,
        request=request,
    )
    session.commit()
    return AdminVerificationReviewResponse.model_validate(result)
