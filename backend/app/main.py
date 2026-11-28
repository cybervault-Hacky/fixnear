"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging_config import configure_logging
from app.core.rate_limit import init_rate_limit_store
from app.core.rate_limit_middleware import RateLimitMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.schemas.health import HealthResponse
from app.services.health import get_health_response

# Minimum set of methods and headers the FixNear frontend actually uses through the
# same-origin BFF. Cross-origin credentials are never allowed; browsers reach the API
# same-origin via the Next.js proxy in the supported deployment.
CORS_ALLOW_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
CORS_ALLOW_HEADERS = [
    'Authorization',
    'Content-Type',
    'Idempotency-Key',
    'X-CSRF-Token',
    'Accept',
    'Origin',
]


def create_app() -> FastAPI:
    """Create the configured API application."""

    settings = get_settings()
    configure_logging(settings.log_level)
    store = init_rate_limit_store()

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        try:
            yield
        finally:
            close = getattr(store, 'close', None)
            if close:
                close()

    application = FastAPI(
        lifespan=lifespan,
        title='FixNear API',
        version=settings.app_version,
        description='Foundation API for the FixNear home-services platform.',
    )
    # Middleware order: last added is outermost, so the security headers set on
    # everything (including rate-limit 429/503 and CORS preflight responses).
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or [settings.frontend_url],
        allow_credentials=False,
        allow_methods=CORS_ALLOW_METHODS,
        allow_headers=CORS_ALLOW_HEADERS,
        max_age=600,
    )
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(SecurityHeadersMiddleware)
    register_exception_handlers(application)

    @application.get('/health', response_model=HealthResponse, tags=['health'])
    def root_health_check() -> HealthResponse:
        return get_health_response()

    application.include_router(v1_router, prefix='/api/v1')
    return application


app = create_app()
