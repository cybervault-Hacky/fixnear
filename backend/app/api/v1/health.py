"""Versioned health-check endpoint."""

from fastapi import APIRouter

from app.schemas.health import HealthResponse
from app.services.health import get_health_response

router = APIRouter(tags=['health'])


@router.get('/health', response_model=HealthResponse)
def versioned_health_check() -> HealthResponse:
    return get_health_response()
