"""Private self-service technician management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.authorization import require_technician_role
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.technician_management import (
    TechnicianAvailabilityResponse,
    TechnicianAvailabilityUpdateRequest,
    TechnicianCoverageResponse,
    TechnicianCoverageUpdateRequest,
    TechnicianOnboardingResponse,
    TechnicianProfileResponse,
    TechnicianProfileUpdateRequest,
    TechnicianSkillsResponse,
    TechnicianSkillsUpdateRequest,
    TechnicianVerificationStatusResponse,
    VerificationSubmissionRequest,
)
from app.services.technician_management import (
    read_onboarding,
    read_technician_availability,
    read_technician_coverage,
    read_technician_profile,
    read_technician_skills,
    read_verification_status,
    submit_for_verification,
    update_technician_availability,
    update_technician_coverage,
    update_technician_profile,
    update_technician_skills,
)

router = APIRouter(prefix='/technician', tags=['technician management'])
TechnicianActor = Annotated[AppUser, Depends(require_technician_role)]
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get('/profile', response_model=TechnicianProfileResponse)
def read_profile(actor: TechnicianActor, session: DatabaseSession) -> TechnicianProfileResponse:
    """Read only the authenticated technician's private profile."""

    return TechnicianProfileResponse.model_validate(read_technician_profile(session, actor))


@router.patch('/profile', response_model=TechnicianProfileResponse)
def edit_profile(
    request: TechnicianProfileUpdateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianProfileResponse:
    """Update the authenticated technician's editable profile fields only."""

    result = update_technician_profile(session, actor, request)
    session.commit()
    return TechnicianProfileResponse.model_validate(result)


@router.get('/services', response_model=TechnicianSkillsResponse)
def read_services(actor: TechnicianActor, session: DatabaseSession) -> TechnicianSkillsResponse:
    return TechnicianSkillsResponse(
        skills=read_technician_skills(session, actor)  # type: ignore[arg-type]
    )


@router.put('/services', response_model=TechnicianSkillsResponse)
def edit_services(
    request: TechnicianSkillsUpdateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianSkillsResponse:
    skills = update_technician_skills(session, actor, request)
    session.commit()
    return TechnicianSkillsResponse(skills=skills)  # type: ignore[arg-type]


@router.get('/coverage', response_model=TechnicianCoverageResponse)
def read_coverage(actor: TechnicianActor, session: DatabaseSession) -> TechnicianCoverageResponse:
    return TechnicianCoverageResponse(areas=read_technician_coverage(session, actor))  # type: ignore[arg-type]


@router.put('/coverage', response_model=TechnicianCoverageResponse)
def edit_coverage(
    request: TechnicianCoverageUpdateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianCoverageResponse:
    areas = update_technician_coverage(session, actor, request)
    session.commit()
    return TechnicianCoverageResponse(areas=areas)  # type: ignore[arg-type]


@router.get('/availability', response_model=TechnicianAvailabilityResponse)
def read_availability(
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianAvailabilityResponse:
    return TechnicianAvailabilityResponse.model_validate(
        read_technician_availability(session, actor)
    )


@router.put('/availability', response_model=TechnicianAvailabilityResponse)
def edit_availability(
    request: TechnicianAvailabilityUpdateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianAvailabilityResponse:
    result = update_technician_availability(session, actor, request)
    session.commit()
    return TechnicianAvailabilityResponse.model_validate(result)


@router.get('/onboarding', response_model=TechnicianOnboardingResponse)
def read_onboarding_status(
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianOnboardingResponse:
    return TechnicianOnboardingResponse.model_validate(read_onboarding(session, actor))


@router.get('/verification', response_model=TechnicianVerificationStatusResponse)
def read_verification(
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianVerificationStatusResponse:
    return TechnicianVerificationStatusResponse.model_validate(
        read_verification_status(session, actor)
    )


@router.post('/verification/submit', response_model=TechnicianVerificationStatusResponse)
def request_verification_review(
    _request: VerificationSubmissionRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> TechnicianVerificationStatusResponse:
    result = submit_for_verification(session, actor)
    session.commit()
    return TechnicianVerificationStatusResponse.model_validate(result)
