"""Response security headers for the FixNear API.

The API serves JSON only, so it needs no scripts/styles/images policy of its own; the
Content-Security-Policy here is a deny-by-default backstop. The HTML-serving app (Next.js)
sets its own policy in ``frontend/next.config.ts``; the two policies are intentionally
independent; the frontend policy currently permits inline scripts and styles.

Strict-Transport-Security is emitted only when APP_ENV=production (i.e. behind a real
HTTPS terminator). Local HTTP development never sends HSTS.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings


def build_security_headers(app_env: str) -> dict[str, str]:
    headers = {
        "Content-Security-Policy": (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        ),
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
    }
    if app_env == "production":
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach the fixed security-header set to every response, including errors."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for name, value in build_security_headers(get_settings().app_env).items():
            response.headers.setdefault(name, value)
        return response
