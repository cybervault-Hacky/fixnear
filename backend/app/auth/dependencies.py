"""FastAPI bearer-token dependency with generic, non-logging auth failures."""

from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.tokens import (
    AuthConfigurationError,
    InvalidAccessToken,
    SupabaseAccessTokenVerifier,
    VerifiedIdentity,
    build_supabase_verifier,
)
from app.core.config import get_settings

_bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def get_access_token_verifier() -> SupabaseAccessTokenVerifier:
    """Construct the configured JWKS client lazily, without a startup network call."""

    settings = get_settings()
    return build_supabase_verifier(
        jwks_url=settings.supabase_jwks_url,
        issuer=settings.supabase_jwt_issuer,
        audience=settings.supabase_jwt_audience,
        cache_ttl_seconds=settings.supabase_jwks_cache_ttl_seconds,
        leeway_seconds=settings.supabase_jwt_leeway_seconds,
    )


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={'code': 'unauthorized', 'message': 'Authentication required.'},
        headers={'WWW-Authenticate': 'Bearer'},
    )


def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),  # noqa: B008
) -> VerifiedIdentity:
    """Validate a bearer token and expose only the external identity subject."""

    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise _unauthenticated()

    try:
        verifier = get_access_token_verifier()
    except AuthConfigurationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'auth_unavailable', 'message': 'Authentication is unavailable.'},
        ) from None

    try:
        return verifier.verify(credentials.credentials)
    except InvalidAccessToken:
        raise _unauthenticated() from None
