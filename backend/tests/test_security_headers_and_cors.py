"""Actual-response tests for security headers and CORS policy (S3/S5).

These hit the real middleware stack via TestClient rather than asserting on
configuration alone, so a regression in wiring is caught here.
"""


from app.core.config import get_settings


def test_security_headers_present_on_api_responses(authenticated_client) -> None:
    client, _, _ = authenticated_client
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_hsts_is_not_sent_outside_production(authenticated_client) -> None:
    client, _, _ = authenticated_client
    response = client.get("/api/v1/health")
    assert "strict-transport-security" not in {k.lower() for k in response.headers}


def test_hsts_is_sent_in_production(authenticated_client, monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    client, _, _ = authenticated_client
    response = client.get("/api/v1/health")
    assert response.headers["strict-transport-security"] == (
        "max-age=31536000; includeSubDomains"
    )


def test_security_headers_also_applied_to_error_responses(authenticated_client) -> None:
    client, _, _ = authenticated_client
    # 404 for an unknown API route — still a hardened response
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" in response.headers


def _preflight(client, origin: str, method: str, headers: str):
    return client.options(
        "/api/v1/services/categories",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )


def test_cors_preflight_allowed_origin_gets_explicit_method_and_header_list(
    authenticated_client,
) -> None:
    # CORSMiddleware is built once at app creation, so the allow-list comes from the
    # process defaults: CORS_ORIGINS=[] falls back to frontend_url=http://localhost:3000.
    client, _, _ = authenticated_client

    response = _preflight(client, "http://localhost:3000", "GET", "Authorization")

    assert response.status_code == 200
    allow_origin = response.headers.get("access-control-allow-origin")
    assert allow_origin == "http://localhost:3000"
    allow_methods = response.headers.get("access-control-allow-methods", "")
    assert "*" not in allow_methods
    for method in ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
        assert method in allow_methods
    allow_headers = response.headers.get("access-control-allow-headers", "")
    assert "*" not in allow_headers
    assert "Authorization" in allow_headers
    # Credentials are never enabled
    assert response.headers.get("access-control-allow-credentials") != "true"


def test_cors_preflight_unknown_origin_is_rejected(
    authenticated_client,
) -> None:
    client, _, _ = authenticated_client

    response = _preflight(client, "https://attacker.example", "GET", "Authorization")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_simple_request_from_allowed_origin_echoes_origin(
    authenticated_client,
) -> None:
    client, _, _ = authenticated_client

    response = client.get(
        "/api/v1/services/categories",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert response.headers.get("access-control-allow-credentials") != "true"


def test_cors_simple_request_from_unknown_origin_gets_no_allow_origin(
    authenticated_client,
) -> None:
    client, _, _ = authenticated_client

    response = client.get(
        "/api/v1/services/categories",
        headers={"Origin": "https://attacker.example"},
    )
    assert response.status_code == 200  # not a browser-enforced block, but no grant either
    assert "access-control-allow-origin" not in response.headers


def test_cors_allow_methods_do_not_include_method_wildcard(authenticated_client) -> None:
    """Main app's CORS config uses explicit lists, never '*'."""
    from app.main import CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS

    assert "*" not in CORS_ALLOW_METHODS
    assert "*" not in CORS_ALLOW_HEADERS
    assert set(CORS_ALLOW_METHODS) == {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
