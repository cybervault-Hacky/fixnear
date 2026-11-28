"""Configurable fixed-window rate limiting for the FixNear API.

Design
------
- A global network bucket is enforced independently of bearer tokens.
- Per-rule identity resolution prefers the presented bearer token (hashed with SHA-256, never
  stored or logged) over the client IP, so authenticated users are not collapsed into one
  bucket per proxy. Unauthenticated callers are bucketed by IP.
- The client IP is only trusted from ``X-Forwarded-For`` when the direct peer is listed in
  ``RATE_LIMIT_TRUSTED_PROXIES`` (exact IPs or CIDR ranges). Otherwise the peer address is
  used and forwarded headers are ignored entirely.
- Two storage backends are supported:
    * ``InMemoryRateLimitStore`` — default. Correct for a single-process deployment and
      for local development/tests. NOT shared across multiple application instances.
    * ``RedisRateLimitStore`` — used when ``RATE_LIMIT_REDIS_URL`` is set. Required for
      multi-instance production deployments. Requires the ``redis`` package, which is
      imported lazily; misconfiguration or outage fails closed with HTTP 503.
- Limits are fixed-window counters. When a client exceeds a limit the API returns
  HTTP 429 with a ``Retry-After`` header (whole seconds until the window resets).
- When the configured store is unavailable, limited endpoints return HTTP 503
  ``rate_limit_unavailable`` with a ``Retry-After`` header rather than silently allowing
  unlimited traffic (fail closed).
"""

import hashlib
import ipaddress
import logging
import math
import time
from collections.abc import Callable
from typing import Protocol
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RULE_NAMES = (
    "global",
    "auth",
    "admin_overview",
    "admin_audit",
    "admin_search",
    "review_submit",
    "ticket_create",
    "ticket_reply",
)


class RateLimitUnavailable(Exception):
    """Raised when the configured rate-limit store cannot serve a check."""


class RateLimitStore(Protocol):
    """Fixed-window counter backend."""

    def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        """Increment the counter for ``key`` in the current window.

        Returns ``(count, retry_after_seconds)`` where ``retry_after_seconds`` is the time
        until the current window resets.
        """
        ...


class InMemoryRateLimitStore:
    """Process-local fixed-window counters. Local development and single-process use only."""

    def __init__(self) -> None:
        import threading

        self._lock = threading.Lock()
        self._windows: dict[str, tuple[int, float]] = {}

    def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        now = time.time()
        window_index = int(now // window_seconds)
        reset_at = (window_index + 1) * window_seconds
        compound = f"{key}:{window_index}"
        with self._lock:
            count, expires = self._windows.get(compound, (0, reset_at))
            count += 1
            self._windows[compound] = (count, expires)
            if len(self._windows) > 10_000:
                self._prune(now)
        return count, max(1, math.ceil(reset_at - now))

    def _prune(self, now: float) -> None:
        expired = [key for key, (_, expires) in self._windows.items() if expires <= now]
        for key in expired:
            del self._windows[key]


class RedisRateLimitStore:
    """Redis-backed fixed-window counters for multi-instance deployments."""

    def __init__(self, url: str) -> None:
        try:
            import redis
        except ImportError as exc:  # pragma: no cover - exercised via monkeypatched import
            raise RateLimitUnavailable(
                "RATE_LIMIT_REDIS_URL is set but the 'redis' package is not installed. "
                "Install it with `pip install redis`."
            ) from exc
        self._client = redis.Redis.from_url(
            url,
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            decode_responses=False,
        )

    def ping(self) -> None:
        if not self._client.ping():
            raise RateLimitUnavailable("Rate-limit storage ping failed.")

    def close(self) -> None:
        self._client.close()

    def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        now = int(time.time())
        window_index = now // window_seconds
        reset_at = (window_index + 1) * window_seconds
        compound = f"rl:{key}:{window_index}"
        try:
            # Atomic increment + expiry, including when a worker dies mid-request.
            count = self._client.eval(
                "local n = redis.call('INCR', KEYS[1]); "
                "if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n",
                1, compound, window_seconds,
            )
            return int(count), max(1, reset_at - now)
        except Exception as exc:
            raise RateLimitUnavailable("Rate-limit storage is unavailable.") from exc


_store: RateLimitStore | None = None


def init_rate_limit_store() -> RateLimitStore:
    """Create the configured store. Called once at app creation; safe to call again in tests."""

    global _store
    settings = get_settings()
    production = settings.app_env.lower() == "production"
    if production and (not settings.rate_limit_enabled or not settings.rate_limit_redis_url):
        raise RuntimeError("Production requires enabled rate limiting and RATE_LIMIT_REDIS_URL")
    if settings.rate_limit_redis_url:
        url = settings.rate_limit_redis_url.get_secret_value()
        store = None
        try:
            parsed = urlsplit(url)
            if parsed.scheme not in ("redis", "rediss") or not parsed.hostname:
                raise ValueError("invalid Redis URL")
            _ = parsed.port
            store = RedisRateLimitStore(url)
            if production:
                store.ping()
            _store = store
        except Exception:  # noqa: BLE001 - all client setup failures must fail closed
            if store is not None:
                close = getattr(store, "close", None)
                if close:
                    close()
            if production:
                raise RuntimeError("Production rate-limit Redis initialization failed") from None
            logger.warning("Rate-limit Redis initialization failed; requests will fail closed")
            _store = _UnavailableStore()
    else:
        _store = InMemoryRateLimitStore()
    return _store


def get_rate_limit_store() -> RateLimitStore:
    global _store
    if _store is None:
        _store = init_rate_limit_store()
    return _store


def set_rate_limit_store(store: RateLimitStore | None) -> None:
    """Test hook: replace or reset the configured store."""

    global _store
    _store = store


class _UnavailableStore:
    def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        raise RateLimitUnavailable("Rate-limit storage failed to initialize.")


def _validated_forwarded_ip(value: str) -> str | None:
    candidate = value.strip()
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate


def is_trusted_proxy(peer: str, trusted: list[str]) -> bool:
    """Return True when ``peer`` matches one of the configured proxy IPs/CIDRs."""

    try:
        peer_address = ipaddress.ip_address(peer.strip())
    except ValueError:
        return False
    for entry in trusted:
        item = entry.strip()
        if not item:
            continue
        try:
            if "/" in item:
                if peer_address in ipaddress.ip_network(item, strict=False):
                    return True
            elif peer_address == ipaddress.ip_address(item):
                return True
        except ValueError:
            logger.warning("Ignoring invalid RATE_LIMIT_TRUSTED_PROXIES entry %r.", item)
    return False


def client_ip(request: Request, trusted_proxies: list[str]) -> str:
    """Resolve the caller IP, honoring forwarded headers only behind trusted proxies."""

    peer = request.client.host if request.client else "unknown"
    try:
        peer = str(ipaddress.ip_address(peer))
    except ValueError:
        return "unknown"
    if not is_trusted_proxy(peer, trusted_proxies):
        return peer
    # Walk from the network peer towards the client, discarding only trusted hops.
    # A malformed chain is collapsed to the peer bucket, never to an attacker value.
    values = request.headers.getlist("x-forwarded-for")
    if not values:
        return peer
    hops = [part.strip() for value in values for part in value.split(",")]
    if len(hops) > 64:
        return peer
    try:
        hops = [str(ipaddress.ip_address(hop)) for hop in hops]
    except ValueError:
        return peer
    current = peer
    for hop in reversed(hops):
        if not is_trusted_proxy(current, trusted_proxies):
            break
        current = hop
    return current



def resolve_identity(request: Request) -> str:
    """Stable, privacy-safe identity for bucketing; never stores raw tokens."""

    authorization = request.headers.get("authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        token = token.strip()
        if scheme.lower() == "bearer" and token:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
            return f"u:{digest[:32]}"
    return f"ip:{client_ip(request, get_settings().rate_limit_trusted_proxies)}"


def rule_limits(rule_name: str) -> tuple[int, int]:
    settings = get_settings()
    limit = getattr(settings, f"rate_limit_{rule_name}_limit")
    window = getattr(settings, f"rate_limit_{rule_name}_window_seconds")
    return int(limit), int(window)


def _too_many(retry_after: int, limit: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "rate_limited",
            "message": f"Too many requests. Try again in {retry_after} seconds.",
        },
        headers={"Retry-After": str(retry_after)},
    )


def _unavailable(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "rate_limit_unavailable",
            "message": "Rate limiting is temporarily unavailable. Try again shortly.",
        },
        headers={"Retry-After": str(retry_after)},
    )


def check_rate_limit(rule_name: str, request: Request) -> None:
    """Shared check used by the dependency and the global middleware."""

    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    limit, window = rule_limits(rule_name)
    identity = (f"ip:{client_ip(request, settings.rate_limit_trusted_proxies)}"
                if rule_name == "network" else resolve_identity(request))
    try:
        count, retry_after = get_rate_limit_store().hit(f"{rule_name}:{identity}", window)
    except RateLimitUnavailable:
        raise _unavailable(window) from None
    if count > limit:
        raise _too_many(retry_after, limit)


def rate_limit(rule_name: str) -> Callable[[Request], None]:
    """Build a FastAPI dependency enforcing ``rule_name`` for a route."""

    def dependency(request: Request) -> None:
        check_rate_limit(rule_name, request)

    dependency.__name__ = f"rate_limit_{rule_name}"
    return dependency
