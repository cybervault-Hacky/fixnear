"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging_config import configure_logging
from app.schemas.health import HealthResponse
from app.services.health import get_health_response


def create_app() -> FastAPI:
    """Create the configured API application."""

    settings = get_settings()
    configure_logging(settings.log_level)

    application = FastAPI(
        title='FixNear API',
        version=settings.app_version,
        description='Foundation API for the FixNear home-services platform.',
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or [settings.frontend_url],
        allow_credentials=False,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    register_exception_handlers(application)

    @application.get('/health', response_model=HealthResponse, tags=['health'])
    def root_health_check() -> HealthResponse:
        return get_health_response()

    application.include_router(v1_router, prefix='/api/v1')
    return application


app = create_app()
