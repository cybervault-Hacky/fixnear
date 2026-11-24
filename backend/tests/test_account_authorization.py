"""Authorization integration checks against disposable SQLite and synthetic identities."""

from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import (
    AppUser,
    CustomerProfile,
    Role,
    TechnicianProfile,
    UserAuditEvent,
    UserRole,
)

ISSUER = "https://supabase.invalid/auth/v1"


@pytest.fixture
def authorization_database() -> Iterator[Session]:
    """Provide a fresh in-memory database; no external customer accounts are created."""

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False, expire_on_commit=False) as session:
        session.add_all(
            [
                Role(code="customer", description="Customer application access"),
                Role(code="technician", description="Technician application access"),
                Role(code="admin", description="Privileged administrative access"),
            ]
        )
        session.commit()
        yield session
    engine.dispose()


def identity_for(subject: UUID) -> VerifiedIdentity:
    return VerifiedIdentity(
        subject=subject,
        issuer=ISSUER,
        issued_at=2_000_000_000,
        expires_at=2_000_000_300,
    )


@pytest.fixture
def authenticated_client(authorization_database: Session):
    identity_holder = {"value": identity_for(uuid4())}

    def override_identity() -> VerifiedIdentity:
        return identity_holder["value"]

    def override_session() -> Iterator[Session]:
        try:
            yield authorization_database
        except Exception:
            authorization_database.rollback()
            raise

    app.dependency_overrides[get_current_identity] = override_identity
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, identity_holder, authorization_database
    finally:
        app.dependency_overrides.clear()


def create_user(
    session: Session,
    *,
    subject: UUID | None = None,
    account_status: str = "active",
    role_codes: tuple[str, ...] = (),
    customer_name: str | None = None,
    technician_name: str | None = None,
) -> AppUser:
    user = AppUser(
        auth_issuer=ISSUER,
        auth_subject=subject or uuid4(),
        status=account_status,
    )
    session.add(user)
    session.flush()
    for role_code in role_codes:
        session.add(UserRole(user_id=user.id, role_code=role_code, granted_by=user.id))
    if customer_name is not None:
        session.add(CustomerProfile(user_id=user.id, display_name=customer_name))
    if technician_name is not None:
        session.add(TechnicianProfile(user_id=user.id, display_name=technician_name))
    session.commit()
    return user


def test_only_health_and_explicit_public_catalog_discovery_reads_are_anonymous() -> (
    None
):
    paths = app.openapi()["paths"]
    public_paths = {
        "/health",
        "/api/v1/health",
        "/api/v1/services",
        "/api/v1/services/categories",
        "/api/v1/services/{slug}",
        "/api/v1/services/{slug}/nearby-technicians/search",
        "/api/v1/technicians/{technician_user_id}/services/{service_slug}",
    }

    for path, methods in paths.items():
        for operation in methods.values():
            if path in public_paths:
                assert operation.get("security") is None
            else:
                assert {"HTTPBearer": []} in operation.get("security", [])


def test_public_provisioning_is_fixed_role_idempotent_and_supports_multiple_roles(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    subject = identity_holder["value"].subject

    response = client.post(
        "/api/v1/auth/provision/customer",
        json={"display_name": "Sample Customer", "role": "admin", "status": "active"},
    )
    assert response.status_code == 422
    assert (
        session.scalar(select(AppUser).where(AppUser.auth_subject == subject)) is None
    )

    customer_response = client.post(
        "/api/v1/auth/provision/customer",
        json={"display_name": "Sample Customer"},
    )
    assert customer_response.status_code == 200
    customer = customer_response.json()
    assert customer["profile_type"] == "customer"
    assert customer["account_status"] == "active"
    assert customer["display_name"] == "Sample Customer"

    repeated_response = client.post(
        "/api/v1/auth/provision/customer",
        json={"display_name": "Sample Customer"},
    )
    assert repeated_response.status_code == 200
    assert repeated_response.json() == customer

    technician_response = client.post(
        "/api/v1/auth/provision/technician",
        json={"display_name": "Sample Technician"},
    )
    assert technician_response.status_code == 200
    assert technician_response.json()["user_id"] == customer["user_id"]
    assert (
        client.post(
            "/api/v1/auth/provision/admin", json={"display_name": "Not allowed"}
        ).status_code
        == 404
    )
    customer_profile = client.get("/api/v1/account/customer/profile")
    technician_profile = client.get("/api/v1/account/technician/profile")
    assert customer_profile.json()["display_name"] == "Sample Customer"
    assert technician_profile.json()["display_name"] == "Sample Technician"

    user = session.scalar(select(AppUser).where(AppUser.auth_subject == subject))
    assert user is not None
    assert {role.role_code for role in user.roles} == {"customer", "technician"}
    assert session.get(CustomerProfile, user.id).display_name == "Sample Customer"
    assert session.get(TechnicianProfile, user.id).display_name == "Sample Technician"
    audit_events = session.scalars(
        select(UserAuditEvent).where(UserAuditEvent.subject_user_id == user.id)
    ).all()
    assert sum(event.action == "status.changed" for event in audit_events) == 1
    assert sum(event.action == "role.granted" for event in audit_events) == 2


def test_account_routes_authorize_from_database_roles_not_request_data(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    customer = create_user(
        session,
        subject=identity_holder["value"].subject,
        role_codes=("customer",),
        customer_name="Sample Customer",
    )

    current = client.get("/api/v1/auth/me")
    assert current.status_code == 200
    assert current.json()["role_codes"] == ["customer"]

    customer_profile = client.get("/api/v1/account/customer/profile")
    assert customer_profile.status_code == 200
    assert customer_profile.json() == {
        "user_id": str(customer.id),
        "display_name": "Sample Customer",
    }
    assert client.get("/api/v1/account/technician/profile").status_code == 403
    assert client.get(f"/api/v1/admin/users/{customer.id}").status_code == 403


def test_technician_cannot_access_customer_profile(authenticated_client) -> None:
    client, identity_holder, session = authenticated_client
    technician = create_user(
        session,
        subject=identity_holder["value"].subject,
        role_codes=("technician",),
        technician_name="Sample Technician",
    )

    own_profile = client.get("/api/v1/account/technician/profile")

    assert own_profile.status_code == 200
    assert own_profile.json() == {
        "user_id": str(technician.id),
        "display_name": "Sample Technician",
    }
    assert client.get("/api/v1/account/customer/profile").status_code == 403


def test_customer_profile_lookup_is_always_scoped_to_authenticated_owner(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    owner = create_user(
        session,
        subject=identity_holder["value"].subject,
        role_codes=("customer",),
        customer_name="Authenticated Owner",
    )
    other_user = create_user(
        session,
        role_codes=("customer",),
        customer_name="Different Customer",
    )

    attempted_lookup = client.get(
        f"/api/v1/account/customer/profile?user_id={other_user.id}"
    )

    assert attempted_lookup.status_code == 200
    assert attempted_lookup.json() == {
        "user_id": str(owner.id),
        "display_name": "Authenticated Owner",
    }
    assert (
        client.get(f"/api/v1/account/customer/profile/{other_user.id}").status_code
        == 404
    )


@pytest.mark.parametrize("inactive_status", ["suspended", "disabled"])
def test_missing_or_inactive_application_account_is_denied(
    authenticated_client,
    inactive_status: str,
) -> None:
    client, identity_holder, session = authenticated_client
    assert client.get("/api/v1/auth/me").status_code == 403

    inactive_user = create_user(
        session,
        subject=identity_holder["value"].subject,
        account_status=inactive_status,
        role_codes=("customer",),
        customer_name="Sample Customer",
    )
    assert inactive_user.status == inactive_status
    response = client.get("/api/v1/account/customer/profile")
    assert response.status_code == 403
    assert response.json()["detail"] == {
        "code": "forbidden",
        "message": "Access denied.",
    }
    self_service = client.post(
        "/api/v1/auth/provision/technician",
        json={"display_name": "Sample Technician"},
    )
    assert self_service.status_code == 403
    assert session.get(AppUser, inactive_user.id).status == inactive_status
    assert session.get(UserRole, (inactive_user.id, "technician")) is None


def test_admin_role_and_status_changes_are_audited_and_idempotent(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(
        session, role_codes=("customer",), customer_name="Sample Customer"
    )
    identity_holder["value"] = identity_for(admin.auth_subject)

    grant = client.put(f"/api/v1/admin/users/{target.id}/roles/technician")
    assert grant.status_code == 200
    assert grant.json()["role_codes"] == ["customer", "technician"]

    repeat_grant = client.put(f"/api/v1/admin/users/{target.id}/roles/technician")
    assert repeat_grant.status_code == 200
    assert (
        session.scalar(
            select(UserAuditEvent)
            .where(
                UserAuditEvent.subject_user_id == target.id,
                UserAuditEvent.action == "role.granted",
            )
            .order_by(UserAuditEvent.created_at)
        ).actor_user_id
        == admin.id
    )
    assert (
        len(
            session.scalars(
                select(UserAuditEvent).where(
                    UserAuditEvent.subject_user_id == target.id,
                    UserAuditEvent.action == "role.granted",
                    UserAuditEvent.after_value == "technician",
                )
            ).all()
        )
        == 1
    )

    rejected_status = client.patch(
        f"/api/v1/admin/users/{target.id}/status",
        json={"status": "suspended", "role": "admin"},
    )
    assert rejected_status.status_code == 422
    assert session.get(AppUser, target.id).status == "active"

    status_change = client.patch(
        f"/api/v1/admin/users/{target.id}/status",
        json={"status": "suspended"},
    )
    assert status_change.status_code == 200
    assert status_change.json()["account_status"] == "suspended"
    assert (
        client.patch(
            f"/api/v1/admin/users/{target.id}/status",
            json={"status": "suspended"},
        ).status_code
        == 200
    )
    status_events = session.scalars(
        select(UserAuditEvent).where(
            UserAuditEvent.subject_user_id == target.id,
            UserAuditEvent.action == "status.changed",
        )
    ).all()
    assert len(status_events) == 1
    assert status_events[0].actor_user_id == admin.id
    assert status_events[0].before_value == "active"
    assert status_events[0].after_value == "suspended"

    revoke = client.delete(f"/api/v1/admin/users/{target.id}/roles/technician")
    assert revoke.status_code == 200
    assert revoke.json()["role_codes"] == ["customer"]
    assert (
        client.delete(f"/api/v1/admin/users/{target.id}/roles/technician").status_code
        == 200
    )
    role_events = session.scalars(
        select(UserAuditEvent).where(
            UserAuditEvent.subject_user_id == target.id,
            UserAuditEvent.action.in_(("role.granted", "role.revoked")),
        )
    ).all()
    assert {
        (event.action, event.before_value, event.after_value) for event in role_events
    } == {
        ("role.granted", None, "technician"),
        ("role.revoked", "technician", "revoked"),
    }


def test_non_admin_cannot_manage_users_and_body_cannot_assign_privilege(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    customer = create_user(
        session,
        subject=identity_holder["value"].subject,
        role_codes=("customer",),
        customer_name="Sample Customer",
    )
    target = create_user(session)

    grant = client.put(f"/api/v1/admin/users/{target.id}/roles/admin")
    assert grant.status_code == 403
    status_change = client.patch(
        f"/api/v1/admin/users/{target.id}/status",
        json={"status": "disabled"},
    )
    assert status_change.status_code == 403
    assert (
        client.patch(
            f"/api/v1/admin/users/{target.id}/status",
            json={"status": "active", "role": "admin"},
        ).status_code
        == 403
    )

    assert session.get(AppUser, target.id).status == "active"
    assert session.get(UserRole, (target.id, "admin")) is None
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == target.id)
        ).all()
        == []
    )
    assert session.get(AppUser, customer.id) is not None


def test_disabled_admin_cannot_perform_admin_mutations(authenticated_client) -> None:
    client, identity_holder, session = authenticated_client
    inactive_admin = create_user(
        session,
        account_status="disabled",
        role_codes=("admin",),
    )
    target = create_user(session)
    identity_holder["value"] = identity_for(inactive_admin.auth_subject)

    grant = client.put(f"/api/v1/admin/users/{target.id}/roles/admin")

    assert grant.status_code == 403
    assert session.get(UserRole, (target.id, "admin")) is None
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == target.id)
        ).all()
        == []
    )


def test_admin_mutation_and_audit_event_roll_back_together_on_audit_failure(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(session, role_codes=("admin",))
    target = create_user(session)
    identity_holder["value"] = identity_for(admin.auth_subject)

    session.execute(
        text(
            """
            CREATE TRIGGER reject_role_granted_audit
            BEFORE INSERT ON user_audit_events
            WHEN NEW.action = 'role.granted'
            BEGIN
                SELECT RAISE(ABORT, 'synthetic audit insert failure');
            END;
            """
        )
    )
    session.commit()

    response = client.put(f"/api/v1/admin/users/{target.id}/roles/technician")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    session.expire_all()
    assert session.get(UserRole, (target.id, "technician")) is None
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == target.id)
        ).all()
        == []
    )


def test_last_active_admin_cannot_remove_its_own_role_or_disable_itself(
    authenticated_client,
) -> None:
    client, identity_holder, session = authenticated_client
    admin = create_user(
        session,
        subject=identity_holder["value"].subject,
        role_codes=("admin",),
    )

    revoke = client.delete(f"/api/v1/admin/users/{admin.id}/roles/admin")
    assert revoke.status_code == 409
    suspend = client.patch(
        f"/api/v1/admin/users/{admin.id}/status",
        json={"status": "suspended"},
    )
    assert suspend.status_code == 409

    assert session.get(UserRole, (admin.id, "admin")) is not None
    assert session.get(AppUser, admin.id).status == "active"
    assert (
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == admin.id)
        ).all()
        == []
    )
