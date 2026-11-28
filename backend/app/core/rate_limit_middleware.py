"""Global authenticated-API rate limiting as a Starlette middleware.

Counts every ``/api/v1/*`` request (except the health probes) against a generous
independent network-IP ceiling and a per-identity ceiling. The latter uses the
(unverified, hashed) bearer token if present; forwarding is accepted only from
configured proxies. Strict, route-specific limits layer on top of this
middleware as dependencies (see ``app.core.rate_limit``).
"""

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.core.rate_limit import check_rate_limit

_EXEMPT_PATHS = frozenset({"/health", "/api/v1/health"})


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path.rstrip("/") or "/"
        if path in _EXEMPT_PATHS:
            return await call_next(request)
        try:
            check_rate_limit("network", request)
            check_rate_limit("global", request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=dict(exc.headers or {}),
            )
        return await call_next(request)
