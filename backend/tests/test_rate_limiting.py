"""Tests for the configurable rate limiting added in the security hardening pass.

Covers store behavior, identity resolution, trusted-proxy handling, the 429 +
Retry-After contract, fail-closed 503 behavior when storage is unavailable, and
per-route enforcement on admin/review/support endpoints.
"""

import hashlib

import pytest
from starlette.requests import Request

from app.core import rate_limit
from app.core.config import get_settings
from app.core.rate_limit import (
    InMemoryRateLimitStore,
    RateLimitUnavailable,
    check_rate_limit,
    client_ip,
    is_trusted_proxy,
    resolve_identity,
    set_rate_limit_store,
)
from tests.test_account_authorization import create_user, identity_for

ISSUER = "https://supabase.invalid/auth/v1"


def make_request(
    *,
    authorization: str | None = None,
    x_forwarded_for: str | None = None,
    peer: str = "203.0.113.10",
    path: str = "/api/v1/admin/overview",
) -> Request:
    headers = []
    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))
    if x_forwarded_for is not None:
        headers.append((b"x-forwarded-for", x_forwarded_for.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": headers,
        "client": (peer, 54321),
        "server": ("api.fixnear.test", 443),
        "query_string": b"",
    }
    return Request(scope)


@pytest.fixture
def in_memory_store():
    store = InMemoryRateLimitStore()
    set_rate_limit_store(store)
    try:
        yield store
    finally:
        set_rate_limit_store(None)


# ---------------------------------------------------------------------------
# Store primitives
# ---------------------------------------------------------------------------

def test_in_memory_store_counts_within_a_window(in_memory_store):
    count_one, retry_one = in_memory_store.hit("k", 60)
    count_two, retry_two = in_memory_store.hit("k", 60)
    assert count_one == 1
    assert count_two == 2
    assert 1 <= retry_one <= 60
    assert 1 <= retry_two <= 60


def test_in_memory_store_restart_loses_buckets():
    # A fresh store (as after a process restart) starts buckets from zero —
    # this is why production needs the Redis backend.
    store = InMemoryRateLimitStore()
    store.hit("k", 60)
    assert store.hit("k", 60)[0] == 2
    fresh = InMemoryRateLimitStore()
    assert fresh.hit("k", 60)[0] == 1


# ---------------------------------------------------------------------------
# Identity resolution
# ---------------------------------------------------------------------------

def test_identity_prefers_hashed_bearer_over_ip():
    token = "super-secret-token-value"
    request = make_request(authorization=f"Bearer {token}")
    identity = resolve_identity(request)
    expected = hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]
    assert identity == f"u:{expected}"
    assert token not in identity


def test_identity_falls_back_to_ip_without_bearer():
    request = make_request(peer="198.51.100.7")
    assert resolve_identity(request) == "ip:198.51.100.7"


def test_identity_ignores_non_bearer_authorization_and_empty_bearer():
    assert resolve_identity(make_request(authorization="Basic abc")).startswith("ip:")
    assert resolve_identity(make_request(authorization="Bearer   ")).startswith("ip:")


def test_identity_separates_two_bearer_tokens():
    first = resolve_identity(make_request(authorization="Bearer token-a"))
    second = resolve_identity(make_request(authorization="Bearer token-b"))
    assert first != second


# ---------------------------------------------------------------------------
# Trusted proxy / X-Forwarded-For handling
# ---------------------------------------------------------------------------

def test_forwarded_for_is_ignored_when_peer_is_not_trusted():
    request = make_request(
        x_forwarded_for="203.0.113.99",
        peer="198.51.100.7",
    )
    assert client_ip(request, trusted_proxies=["10.0.0.1"]) == "198.51.100.7"


def test_forwarded_for_first_hop_is_used_behind_trusted_proxy():
    request = make_request(
        x_forwarded_for="203.0.113.99, 10.0.0.1, 10.0.0.2",
        peer="10.0.0.1",
    )
    assert client_ip(request, trusted_proxies=["10.0.0.1"]) == "10.0.0.2"


def test_forwarded_for_supports_cidr_trust_lists():
    assert is_trusted_proxy("10.1.2.3", ["10.0.0.0/8"]) is True
    assert is_trusted_proxy("10.1.2.3", ["192.168.0.0/16"]) is False
    request = make_request(x_forwarded_for="203.0.113.99", peer="10.1.2.3")
    assert client_ip(request, trusted_proxies=["10.0.0.0/8"]) == "203.0.113.99"


def test_forwarded_for_rejects_malformed_entries_even_behind_proxy():
    request = make_request(x_forwarded_for="not-an-ip", peer="10.0.0.1")
    assert client_ip(request, trusted_proxies=["10.0.0.1"]) == "10.0.0.1"


def test_unparseable_peer_is_not_trusted():
    assert is_trusted_proxy("not-an-ip", ["10.0.0.0/8", "10.0.0.1"]) is False


def test_client_ip_defaults_to_peer_when_no_client_info():
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "client": None,
        "server": ("api.fixnear.test", 443),
        "query_string": b"",
    }
    assert client_ip(Request(scope), trusted_proxies=[]) == "unknown"


# ---------------------------------------------------------------------------
# 429 + Retry-After contract and isolation
# ---------------------------------------------------------------------------

def test_check_rate_limit_raises_429_with_retry_after_after_limit(
    in_memory_store, monkeypatch
):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_admin_overview_limit", 2)
    monkeypatch.setattr(settings, "rate_limit_admin_overview_window_seconds", 60)

    request = make_request(authorization="Bearer isolation-token-a")
    check_rate_limit("admin_overview", request)
    check_rate_limit("admin_overview", request)
    with pytest.raises(Exception) as excinfo:
        check_rate_limit("admin_overview", request)

    exc = excinfo.value
    assert getattr(exc, "status_code", None) == 429
    assert "Retry-After" in (exc.headers or {})
    retry_after = int(exc.headers["Retry-After"])
    assert 1 <= retry_after <= 60
    assert exc.detail["code"] == "rate_limited"


def test_limits_are_isolated_between_bearer_identities(in_memory_store, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_review_submit_limit", 1)

    first = make_request(authorization="Bearer identity-a")
    second = make_request(authorization="Bearer identity-b")
    check_rate_limit("review_submit", first)
    with pytest.raises(Exception) as excinfo:
        check_rate_limit("review_submit", first)
    assert getattr(excinfo.value, "status_code", None) == 429
    # A different token must not share the exhausted bucket
    check_rate_limit("review_submit", second)


def test_limits_are_isolated_between_rules(in_memory_store, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_ticket_create_limit", 1)

    request = make_request(authorization="Bearer shared-subject")
    check_rate_limit("ticket_create", request)
    # A different rule has an independent bucket for the same identity
    check_rate_limit("ticket_reply", request)


def test_rate_limit_disabled_short_circuits(in_memory_store, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    monkeypatch.setattr(settings, "rate_limit_global_limit", 1)
    request = make_request()
    for _ in range(5):
        check_rate_limit("global", request)


# ---------------------------------------------------------------------------
# Fail-closed behavior when storage is unavailable
# ---------------------------------------------------------------------------

class _ExplodingStore:
    def hit(self, key: str, window_seconds: int):
        raise RateLimitUnavailable("boom")


def test_unavailable_store_fails_closed_with_503_and_retry_after(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    set_rate_limit_store(_ExplodingStore())
    try:
        request = make_request(authorization="Bearer anything")
        with pytest.raises(Exception) as excinfo:
            check_rate_limit("global", request)
        exc = excinfo.value
        assert getattr(exc, "status_code", None) == 503
        assert exc.detail["code"] == "rate_limit_unavailable"
        assert "Retry-After" in (exc.headers or {})
    finally:
        set_rate_limit_store(InMemoryRateLimitStore())


def test_init_with_redis_url_but_redis_package_missing_fails_closed(monkeypatch):
    settings = get_settings()
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "rate_limit_redis_url", SecretStr("redis://localhost:6399/0"))
    monkeypatch.setattr(rate_limit, "RedisRateLimitStore", lambda url: (_ for _ in ()).throw(ImportError()))
    store = rate_limit.init_rate_limit_store()
    try:
        with pytest.raises(RateLimitUnavailable):
            store.hit("probe", 60)
    finally:
        set_rate_limit_store(InMemoryRateLimitStore())


# ---------------------------------------------------------------------------
# End-to-end: dependency wiring on real admin routes
# ---------------------------------------------------------------------------

def test_admin_overview_route_enforces_429_via_dependency(
    authenticated_client, monkeypatch
) -> None:
    client, identity_holder, session = authenticated_client
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_admin_overview_limit", 2)
    # Hold the limiter clock inside one fixed window; otherwise a test running at
    # a wall-clock boundary can legitimately split these requests across windows.
    from types import SimpleNamespace

    monkeypatch.setattr(rate_limit, "time", SimpleNamespace(time=lambda: 1_700_000_000))

    admin = create_user(session, role_codes=("admin",))
    identity_holder["value"] = identity_for(admin.auth_subject)

    first = client.get("/api/v1/admin/overview")
    second = client.get("/api/v1/admin/overview")
    third = client.get("/api/v1/admin/overview")

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert third.json()["detail"]["code"] == "rate_limited"
    assert "retry-after" in {name.lower() for name in third.headers}


def test_admin_audit_route_returns_503_when_store_is_down(
    authenticated_client, monkeypatch
) -> None:
    client, identity_holder, session = authenticated_client
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    set_rate_limit_store(_ExplodingStore())
    try:
        admin = create_user(session, role_codes=("admin",))
        identity_holder["value"] = identity_for(admin.auth_subject)

        response = client.get("/api/v1/admin/audit")
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "rate_limit_unavailable"
        assert "retry-after" in {name.lower() for name in response.headers}
    finally:
        set_rate_limit_store(InMemoryRateLimitStore())


def test_global_middleware_enforces_limit_and_returns_retry_after(
    authenticated_client, monkeypatch
) -> None:
    client, _, _ = authenticated_client
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_global_limit", 2)

    assert client.get("/health").status_code == 200  # health probes are exempt
    assert client.get("/api/v1/health").status_code == 200  # versioned health is exempt too
    r1 = client.get("/api/v1/services/categories")
    r2 = client.get("/api/v1/services/categories")
    r3 = client.get("/api/v1/services/categories")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    assert r3.json()["detail"]["code"] == "rate_limited"
    assert "retry-after" in {name.lower() for name in r3.headers}


def test_global_middleware_fails_closed_when_store_is_down(
    authenticated_client,
) -> None:
    client, _, _ = authenticated_client
    set_rate_limit_store(_ExplodingStore())
    try:
        response = client.get("/api/v1/services/categories")
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "rate_limit_unavailable"
        assert "retry-after" in {name.lower() for name in response.headers}
    finally:
        set_rate_limit_store(InMemoryRateLimitStore())


def test_network_limit_blocks_rotating_tokens_and_spoofed_headers(authenticated_client, monkeypatch):
    client, _, _ = authenticated_client
    monkeypatch.setattr(get_settings(), "rate_limit_network_limit", 2)
    for index in range(2):
        response = client.get("/api/v1/services/categories", headers={
            "Authorization": f"Bearer fake-{index}", "X-Forwarded-For": f"192.0.2.{index+1}",
            "X-Real-IP": f"192.0.2.{index+1}",
        })
        assert response.status_code == 200
    response = client.get("/api/v1/services/categories", headers={"Authorization": "Bearer fake-3"})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


def test_proxy_chain_ignores_spoofed_leftmost_hop():
    req = make_request(peer="10.0.0.1", x_forwarded_for="192.0.2.99, 198.51.100.7, 10.0.0.2")
    assert client_ip(req, ["10.0.0.0/8"]) == "198.51.100.7"
    assert client_ip(req, []) == "10.0.0.1"


def test_bad_trusted_proxy_configuration_rejected():
    from pydantic import ValidationError

    from app.core.config import Settings
    for entry in ("invalid", "0.0.0.0/0", "::/0"):
        with pytest.raises(ValidationError):
            Settings(rate_limit_trusted_proxies=[entry])


def test_production_redis_validation_and_ping(monkeypatch):
    from pydantic import SecretStr
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_redis_url", None)
    with pytest.raises(RuntimeError, match="requires"):
        rate_limit.init_rate_limit_store()
    monkeypatch.setattr(settings, "rate_limit_redis_url", SecretStr("https://invalid"))
    with pytest.raises(RuntimeError, match="initialization failed"):
        rate_limit.init_rate_limit_store()
    monkeypatch.setattr(settings, "rate_limit_redis_url", SecretStr("redis://redis.invalid:6379/0"))
    class MockStore:
        def __init__(self, url):
            self.url = url
        def ping(self):
            self.pinged = True
    monkeypatch.setattr(rate_limit, "RedisRateLimitStore", MockStore)
    assert rate_limit.init_rate_limit_store().pinged
    def fail(self):
        raise OSError("offline")
    monkeypatch.setattr(MockStore, "ping", fail)
    with pytest.raises(RuntimeError, match="initialization failed"):
        rate_limit.init_rate_limit_store()
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    with pytest.raises(RuntimeError, match="requires"):
        rate_limit.init_rate_limit_store()


def test_redis_atomic_increment_and_failure(monkeypatch):
    import redis
    class FakeClient:
        def eval(self, script, keys, key, expiry):
            assert "EXPIRE" in script and "INCR" in script
            assert keys == 1 and expiry == 60
            return 1
    monkeypatch.setattr(redis.Redis, "from_url", lambda *a, **kw: FakeClient())
    store = rate_limit.RedisRateLimitStore("redis://redis.invalid")
    assert store.hit("key", 60)[0] == 1
    monkeypatch.setattr(store._client, "eval", lambda *args: (_ for _ in ()).throw(OSError()))
    with pytest.raises(RateLimitUnavailable):
        store.hit("key", 60)


def test_production_missing_redis_dependency_fails_startup(monkeypatch):
    from pydantic import SecretStr

    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_redis_url", SecretStr("redis://redis.invalid/0"))
    def missing(_url):
        raise ImportError("redis unavailable")
    monkeypatch.setattr(rate_limit, "RedisRateLimitStore", missing)
    with pytest.raises(RuntimeError, match="initialization failed"):
        rate_limit.init_rate_limit_store()


def test_auth_attempt_gate_limits_shared_peer_and_fails_closed(authenticated_client, monkeypatch):
    client, _, _ = authenticated_client
    monkeypatch.setattr(get_settings(), 'rate_limit_auth_limit', 2)
    assert client.post('/api/v1/auth/attempt').status_code == 204
    assert client.post('/api/v1/auth/attempt').status_code == 204
    response = client.post('/api/v1/auth/attempt')
    assert response.status_code == 429
    assert int(response.headers['Retry-After']) > 0
    set_rate_limit_store(_ExplodingStore())
    response = client.post('/api/v1/auth/attempt')
    assert response.status_code == 503
