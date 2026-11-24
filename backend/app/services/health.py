"""Health-check response construction."""

from app.core.config import get_settings
from app.schemas.health import HealthResponse


def get_health_response() -> HealthResponse:
    """Build the stable health response without touching the database."""

    settings = get_settings()
    return HealthResponse(
        status='ok',
        service=settings.app_name,
        version=settings.app_version,
    )
