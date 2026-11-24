"""Admin-only technician verification queue and review decisions."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.technician_management import (
    AdminTechnicianDetailResponse,
    AdminTechnicianResponse,
    AdminVerificationDecisionRequest,
    AdminVerificationReviewResponse,
)
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
) -> list[AdminTechnicianResponse]:
    """List private technician records for admins, optionally filtered by review state."""

    return [
        AdminTechnicianResponse.model_validate(item)
        for item in list_admin_technicians(session, verification_status=verification_status)
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
