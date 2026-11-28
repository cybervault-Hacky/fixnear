"""Regression tests: privileged admin mutations require a meaningful audited reason.

Covers PUT/DELETE /admin/users/{id}/roles/{role} and PATCH /admin/users/{id}/status.
Missing, short, and whitespace-only reasons are rejected with 422 before any
database write happens; valid reasons are stored on the audit event.
"""

import pytest
from sqlalchemy import select

from app.models import UserAuditEvent
from tests.test_account_authorization import create_user, identity_for

VALID_REASON = "Verified policy violation reported by three separate customers."

GRANT = ("put", "/api/v1/admin/users/{user_id}/roles/technician", None)
REVOKE = ("delete", "/api/v1/admin/users/{user_id}/roles/technician", None)
STATUS = ("patch", "/api/v1/admin/users/{user_id}/status", {"status": "disabled"})


def _call(client, method: str, url: str, body: dict | None):
    if method == "put":
        return client.put(url, json=body)
    if method == "delete":
        return client.request("DELETE", url, json=body)
    return client.patch(url, json=body)


@pytest.mark.parametrize("method,path,extra", [GRANT, REVOKE, STATUS])
def test_missing_reason_is_rejected_before_any_write(
    authenticated_client, method, path, extra
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(session, role_codes=("customer",))
    identity_holder["value"] = identity_for(admin.auth_subject)

    body = dict(extra) if extra else {}
    response = _call(client, method, path.format(user_id=target.id), body)

    assert response.status_code == 422
    assert session.get(type(target), target.id).status == "active"
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == target.id)
        ).all()
        == []
    )


@pytest.mark.parametrize("method,path,extra", [GRANT, REVOKE, STATUS])
@pytest.mark.parametrize("bad_reason", ["short", "         ", "123456789", "\t\n  \t"])
def test_short_or_whitespace_only_reason_is_rejected(
    authenticated_client, method, path, extra, bad_reason
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(session, role_codes=("customer",))
    identity_holder["value"] = identity_for(admin.auth_subject)

    body = dict(extra) if extra else {}
    body["reason"] = bad_reason
    response = _call(client, method, path.format(user_id=target.id), body)

    assert response.status_code == 422
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == target.id)
        ).all()
        == []
    )


@pytest.mark.parametrize("method,path,extra,expected_action", [
    ("put", "/api/v1/admin/users/{user_id}/roles/technician", None, "role.granted"),
    ("delete", "/api/v1/admin/users/{user_id}/roles/technician", None, "role.revoked"),
    ("patch", "/api/v1/admin/users/{user_id}/status", {"status": "disabled"}, "status.changed"),
])
def test_valid_reason_is_stored_on_the_audit_event(
    authenticated_client, method, path, extra, expected_action
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(session, role_codes=("customer",))
    if expected_action == "role.revoked":
        # ensure the role exists so revocation produces an event
        from app.models import UserRole

        session.add(UserRole(user_id=target.id, role_code="technician", granted_by=admin.id))
        session.commit()
    identity_holder["value"] = identity_for(admin.auth_subject)

    body = dict(extra) if extra else {}
    body["reason"] = VALID_REASON
    response = _call(client, method, path.format(user_id=target.id), body)

    assert response.status_code == 200, response.text
    event = session.scalar(
        select(UserAuditEvent).where(
            UserAuditEvent.subject_user_id == target.id,
            UserAuditEvent.action == expected_action,
        )
    )
    assert event is not None
    assert event.reason == VALID_REASON


def test_reason_is_stripped_before_length_validation(authenticated_client) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(session, role_codes=("customer",))
    identity_holder["value"] = identity_for(admin.auth_subject)

    # 10 visible chars plus heavy padding: passes, and the stored reason is trimmed
    response = client.patch(
        f"/api/v1/admin/users/{target.id}/status",
        json={"status": "disabled", "reason": "   policy violation confirmed   "},
    )
    assert response.status_code == 200
    event = session.scalar(
        select(UserAuditEvent).where(
            UserAuditEvent.subject_user_id == target.id,
            UserAuditEvent.action == "status.changed",
        )
    )
    assert event.reason == "policy violation confirmed"
