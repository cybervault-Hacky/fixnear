"""Public technician service profiles; residential and contact details are omitted."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.location_discovery import PublicTechnicianServiceProfileResponse
from app.services.technician_discovery import read_public_technician_service_profile

router = APIRouter(prefix='/technicians', tags=['public technician discovery'])
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get(
    '/{technician_user_id}/services/{service_slug}',
    response_model=PublicTechnicianServiceProfileResponse,
)
def read_public_technician_service(
    technician_user_id: UUID,
    service_slug: str,
    session: DatabaseSession,
) -> PublicTechnicianServiceProfileResponse:
    """Show only technicians eligible for the active service, without private contact data."""

    return PublicTechnicianServiceProfileResponse.model_validate(
        read_public_technician_service_profile(
            session,
            technician_user_id=technician_user_id,
            service_slug=service_slug,
        )
    )
