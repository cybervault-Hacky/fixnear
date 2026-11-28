"""HomePassport appliance, warranty, claim, document, reminder, and audit tests."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import (
    Appliance,
    ApplianceServiceHistory,
    AppUser,
    HomePassportAuditEvent,
    MaintenanceReminder,
    ReplacedPart,
    Role,
    Service,
    ServiceCategory,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    UserRole,
    WarrantyClaim,
)
from app.services import homepassport as homepassport_service
from app.services.document_storage import get_document_storage

ISSUER = "https://supabase.invalid/auth/v1"


@pytest.fixture
def passport_api() -> Iterator[tuple[TestClient, dict[str, VerifiedIdentity], Session]]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session = Session(engine, autoflush=False, expire_on_commit=False)
    session.add_all(
        [
            Role(code="customer", description="Customer access"),
            Role(code="technician", description="Technician access"),
            Role(code="admin", description="Administrative access"),
        ]
    )
    session.commit()
    identity_holder = {"value": _identity(uuid4())}

    def override_identity() -> VerifiedIdentity:
        return identity_holder["value"]

    def override_session() -> Iterator[Session]:
        try:
            yield session
        except Exception:
            session.rollback()
            raise

    app.dependency_overrides[get_current_identity] = override_identity
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, identity_holder, session
    finally:
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def _identity(subject: UUID) -> VerifiedIdentity:
    return VerifiedIdentity(
        subject=subject,
        issuer=ISSUER,
        issued_at=2_000_000_000,
        expires_at=2_000_000_300,
    )


def _create_user(
    session: Session,
    role_codes: tuple[str, ...],
    *,
    display_name: str,
    verification_status: str = "not_submitted",
) -> AppUser:
    from app.models import AppUser, CustomerProfile

    user = AppUser(auth_issuer=ISSUER, auth_subject=uuid4(), status="active")
    session.add(user)
    session.flush()
    for role_code in role_codes:
        session.add(UserRole(user_id=user.id, role_code=role_code, granted_by=user.id))
    if "customer" in role_codes:
        session.add(CustomerProfile(user_id=user.id, display_name=display_name))
    if "technician" in role_codes:
        session.add(
            TechnicianProfile(
                user_id=user.id,
                display_name=display_name,
                professional_description="Fixture technician.",
                onboarding_status="complete",
                verification_status=verification_status,
            )
        )
    session.commit()
    return user


def _seed_catalog(session: Session) -> Service:
    category = ServiceCategory(
        slug="home-repair",
        title="Home repair",
        description="Fixture category.",
        is_active=True,
    )
    session.add(category)
    session.flush()
    service = Service(
        category=category,
        slug="ac-repair",
        title="Air conditioner repair",
        home_title="Air conditioner",
        home_description="Cooling problems",
        description="Guide content only.",
        listing_description="Guide content only.",
        keywords=["cooling"],
        is_active=True,
    )
    session.add(service)
    session.commit()
    return service


def _add_technician_eligibility(
    session: Session, technician, service: Service
) -> None:
    session.add(
        TechnicianSkill(
            technician_user_id=technician.id, service_id=service.id, years_experience=4
        )
    )
    session.add(
        TechnicianCoverageArea(
            technician_user_id=technician.id,
            area_name="Kothrud",
            area_key="kothrud|pune|maharashtra|411038",
            city="Pune",
            state="Maharashtra",
            postal_code="411038",
        )
    )
    session.commit()


def _set_actor(identity_holder: dict[str, VerifiedIdentity], user) -> None:
    identity_holder["value"] = _identity(user.auth_subject)


def _create_appliance(client: TestClient, **overrides) -> dict:
    payload = {
        "name": "Living room AC",
        "category": "air_conditioner",
        "brand": "FixtureCool",
        "model_number": "FC-2024-X",
        "serial_number": "SN-0001",
        "purchase_date": "2024-05-01",
        "installation_date": "2024-05-02",
        "purchase_price_paise": 45_000_00,
        "seller_name": "Sample Electronics",
        "notes": "Wall mount, bedroom.",
    }
    payload.update(overrides)
    response = client.post(
        "/api/v1/customer/homepassport/appliances",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _complete_booking_flow(
    client: TestClient,
    session: Session,
    identity_holder,
    *,
    customer,
    service: Service,
    appliance_id: str | None,
) -> str:
    admin = _create_user(session, ("admin",), display_name="Admin")
    tech = _create_user(
        session, ("technician",), display_name="Fixture Tech", verification_status="approved"
    )
    _add_technician_eligibility(session, tech, service)

    _set_actor(identity_holder, customer)
    booking_payload = {
        "service_slug": "ac-repair",
        "problem_description": "The air conditioner is not cooling the living room.",
        "preferred_date": (date.today() + timedelta(days=7)).isoformat(),
        "preferred_start": "09:00:00",
        "preferred_end": "12:00:00",
        "timezone_name": "Asia/Kolkata",
        "appliance_id": appliance_id,
        "new_address": {
            "label": "Home",
            "recipient_name": "Customer Example",
            "address_line1": "12 Sample Road",
            "locality": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
            "contact_phone": "+919876543210",
        },
    }
    created = client.post(
        "/api/v1/customer/bookings",
        json=booking_payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]

    _set_actor(identity_holder, admin)
    assigned = client.post(
        f"/api/v1/admin/bookings/{booking_id}/assign",
        json={"technician_user_id": str(tech.id)},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert assigned.status_code == 200, assigned.text

    _set_actor(identity_holder, tech)
    accepted = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "accept"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert accepted.status_code == 200, accepted.text
    inspection = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_inspection"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert inspection.status_code == 200, inspection.text
    quote = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json={
            "items": [
                {
                    "line_type": "inspection",
                    "description": "Inspection charge",
                    "quantity": 1,
                    "unit_amount_paise": 250_00,
                },
                {
                    "line_type": "labour",
                    "description": "Repair labor",
                    "quantity": 2,
                    "unit_amount_paise": 900_00,
                },
                {
                    "line_type": "part",
                    "description": "Replacement filter",
                    "quantity": 2,
                    "unit_amount_paise": 125_00,
                },
            ],
            "expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
            "technician_notes": "Filter and coil service needed.",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert quote.status_code == 200, quote.text
    quote_id = quote.json()["quotes"][-1]["id"]

    _set_actor(identity_holder, customer)
    decision = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{quote_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert decision.status_code == 200, decision.text

    _set_actor(identity_holder, tech)
    started = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_work"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert started.status_code == 200, started.text
    completed = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "complete", "note": "Filters replaced; unit cooling normally."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert completed.status_code == 200, completed.text
    return booking_id


# ---------------------------------------------------------------------------
# Appliances
# ---------------------------------------------------------------------------


def test_appliance_creation_ownership_and_validation(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identity_holder, customer)

    created = _create_appliance(client)
    appliance_id = created["id"]
    assert created["serial_number"] == "SN-0001"
    assert created["has_photo"] is False
    assert created["is_archived"] is False

    # Creation is idempotent on the client-provided key.
    replay_key = str(uuid4())
    first = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Spare fan",
            "category": "electrical",
            "brand": "FixtureCool",
            "model_number": "FC-FAN-1",
        },
        headers={"Idempotency-Key": replay_key},
    )
    assert first.status_code == 201
    replay = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Spare fan",
            "category": "electrical",
            "brand": "FixtureCool",
            "model_number": "FC-FAN-1",
        },
        headers={"Idempotency-Key": replay_key},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert (
        session.scalar(select(func.count(Appliance.id))) == 2
    )

    listing = client.get("/api/v1/customer/homepassport/appliances")
    assert listing.status_code == 200
    assert listing.json()["total"] == 2

    detail = client.get(f"/api/v1/customer/homepassport/appliances/{appliance_id}")
    assert detail.status_code == 200
    assert detail.json()["service_history"] == []
    assert detail.json()["parts"] == []

    invalid = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Bad category",
            "category": "time_machine",
            "brand": "FixtureCool",
            "model_number": "FC-1",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert invalid.status_code == 422

    future_purchase = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Future purchase",
            "category": "geyser",
            "brand": "FixtureCool",
            "model_number": "FC-2",
            "purchase_date": (date.today() + timedelta(days=30)).isoformat(),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert future_purchase.status_code == 422

    bad_order = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Bad order",
            "category": "geyser",
            "brand": "FixtureCool",
            "model_number": "FC-3",
            "purchase_date": "2024-05-02",
            "installation_date": "2024-05-01",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert bad_order.status_code == 422

    _set_actor(identity_holder, other)
    assert client.get(f"/api/v1/customer/homepassport/appliances/{appliance_id}").status_code == 404
    assert (
        client.patch(
            f"/api/v1/customer/homepassport/appliances/{appliance_id}",
            json={"name": "Not mine"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/customer/homepassport/appliances/{appliance_id}/archive"
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/customer/homepassport/appliances/{appliance_id}").status_code == 404


def test_appliance_edit_archive_and_delete_retention(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    created = _create_appliance(client)
    appliance_id = created["id"]

    updated = client.patch(
        f"/api/v1/customer/homepassport/appliances/{appliance_id}",
        json={"notes": "Moved to master bedroom", "seller_name": None},
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Moved to master bedroom"
    assert updated.json()["seller_name"] is None

    archived = client.post(f"/api/v1/customer/homepassport/appliances/{appliance_id}/archive")
    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    archived_again = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance_id}/archive"
    )
    assert archived_again.status_code == 200

    default_list = client.get("/api/v1/customer/homepassport/appliances")
    assert default_list.json()["total"] == 0
    include_archived = client.get(
        "/api/v1/customer/homepassport/appliances?include_archived=true"
    )
    assert include_archived.json()["total"] == 1

    blocked_edit = client.patch(
        f"/api/v1/customer/homepassport/appliances/{appliance_id}",
        json={"notes": "Cannot edit archived"},
    )
    assert blocked_edit.status_code == 409

    # An appliance with records cannot be hard deleted; it must be archived instead.
    fresh = _create_appliance(client, name="Washing machine", category="washing_machine")
    history = client.post(
        f"/api/v1/customer/homepassport/appliances/{fresh['id']}/service-history",
        json={
            "service_date": "2025-01-10",
            "service_category": "washing_machine",
            "provider_name": "Sample Service Co.",
            "work_performed": "Drum belt replaced.",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert history.status_code == 201
    blocked_delete = client.delete(f"/api/v1/customer/homepassport/appliances/{fresh['id']}")
    assert blocked_delete.status_code == 409
    assert blocked_delete.json()["detail"]["code"] == "appliance_in_use"

    empty = _create_appliance(client, name="Microwave", category="microwave")
    assert client.delete(f"/api/v1/customer/homepassport/appliances/{empty['id']}").status_code == 204
    assert session.get(Appliance, UUID(empty["id"])) is None


def test_customer_reported_history_and_verified_lock(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    missing_details = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}/service-history",
        json={"service_date": "2025-01-10", "service_category": "ac"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert missing_details.status_code == 422

    created = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}/service-history",
        json={
            "service_date": "2025-01-10",
            "service_category": "ac-repair",
            "provider_name": "Sample Service Co.",
            "problem_description": "No cooling.",
            "work_performed": "Capacitor replaced.",
            "labour_charges_paise": 150_000,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201
    assert created.json()["source"] == "customer_reported"
    history_id = created.json()["id"]

    detail = client.get(f"/api/v1/customer/homepassport/appliances/{appliance['id']}")
    assert detail.json()["service_history"][0]["source"] == "customer_reported"

    feedback = client.patch(
        f"/api/v1/customer/homepassport/service-history/{history_id}/feedback",
        json={"customer_feedback": "Technician arrived on time."},
    )
    assert feedback.status_code == 200
    assert feedback.json()["customer_feedback"] == "Technician arrived on time."

    _set_actor(identity_holder, other)
    assert (
        client.patch(
            f"/api/v1/customer/homepassport/service-history/{history_id}/feedback",
            json={"customer_feedback": "Not my record."},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/customer/homepassport/service-history/{history_id}").status_code == 404

    _set_actor(identity_holder, customer)
    assert client.delete(f"/api/v1/customer/homepassport/service-history/{history_id}").status_code == 204


def test_verified_history_created_from_completed_booking(passport_api) -> None:
    client, identity_holder, session = passport_api
    service = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    booking_id = _complete_booking_flow(
        client,
        session,
        identity_holder,
        customer=customer,
        service=service,
        appliance_id=appliance["id"],
    )
    _set_actor(identity_holder, customer)

    def history_rows():
        return list(session.scalars(select(ApplianceServiceHistory)).all())

    rows = history_rows()
    assert len(rows) == 1
    row = rows[0]
    assert row.source == "fixnear_verified"
    assert row.booking_id == UUID(booking_id)
    assert row.completion_status == "completed"
    assert row.approved_quote_total_paise == 250_00 + 2 * 900_00 + 2 * 125_00
    assert row.labour_charges_paise == 2 * 900_00
    assert row.technician_name_snapshot == "Fixture Tech"
    assert row.work_performed == "Filters replaced; unit cooling normally."

    parts = list(session.scalars(select(ReplacedPart)).all())
    assert len(parts) == 1
    part = parts[0]
    assert part.source == "fixnear_verified"
    assert part.part_name == "Replacement filter"
    assert part.quantity == 2
    assert part.total_price_paise == 2 * 125_00

    # A different key is rejected because the booking already completed; history is not duplicated.
    tech_user = session.scalar(
        select(AppUser)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .where(UserRole.role_code == "technician")
    )
    assert tech_user is not None
    _set_actor(identity_holder, tech_user)
    duplicate = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "complete"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate.status_code == 409
    assert len(history_rows()) == 1

    _set_actor(identity_holder, customer)
    detail = client.get(f"/api/v1/customer/homepassport/appliances/{appliance['id']}")
    assert detail.status_code == 200
    history = detail.json()["service_history"]
    assert len(history) == 1
    assert history[0]["source"] == "fixnear_verified"
    assert history[0]["booking_reference"] == booking_id
    parts_json = detail.json()["parts"]
    assert len(parts_json) == 1

    # Verified records cannot be deleted by the customer.
    assert client.delete(
        f"/api/v1/customer/homepassport/service-history/{history[0]['id']}"
    ).status_code == 409


# ---------------------------------------------------------------------------
# Warranties
# ---------------------------------------------------------------------------


def _create_warranty(client: TestClient, appliance_id: str, **overrides) -> dict:
    payload = {
        "warranty_type": "manufacturer",
        "appliance_id": appliance_id,
        "provider": "Fixture Manufacturer India",
        "reference_number": "WM-123",
        "start_date": (date.today() - timedelta(days=30)).isoformat(),
        "end_date": (date.today() + timedelta(days=300)).isoformat(),
        "terms_summary": "One year parts and labour as per provider terms.",
    }
    payload.update(overrides)
    response = client.post(
        "/api/v1/customer/homepassport/warranties",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_warranty_status_computation_and_boundaries() -> None:
    today = date(2026, 11, 24)
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today + timedelta(days=1),
            end_date=today + timedelta(days=365),
            latest_claim_status=None,
            as_of=today,
        )
        == "upcoming"
    )
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today,
            end_date=today,
            latest_claim_status=None,
            as_of=today,
        )
        == "active"
    )
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today - timedelta(days=365),
            end_date=today - timedelta(days=1),
            latest_claim_status=None,
            as_of=today,
        )
        == "expired"
    )
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today - timedelta(days=365),
            end_date=today + timedelta(days=1),
            latest_claim_status="submitted",
            as_of=today,
        )
        == "claim_submitted"
    )
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today - timedelta(days=365),
            end_date=today + timedelta(days=1),
            latest_claim_status="additional_information_requested",
            as_of=today,
        )
        == "under_review"
    )
    assert (
        homepassport_service.compute_warranty_status(
            start_date=today - timedelta(days=365),
            end_date=today + timedelta(days=1),
            latest_claim_status="rejected",
            as_of=today,
        )
        == "rejected"
    )


def test_warranty_crud_and_server_computed_status(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    active = _create_warranty(client, appliance["id"])
    assert active["status"] == "active"
    assert active["verification_status"] == "unverified"
    assert active["claim_eligible"] is True
    assert active["days_remaining"] > 250

    upcoming = _create_warranty(
        client,
        appliance["id"],
        provider="Extended Care Ltd",
        warranty_type="extended",
        start_date=(date.today() + timedelta(days=10)).isoformat(),
        end_date=(date.today() + timedelta(days=400)).isoformat(),
        create_expiry_reminder=False,
    )
    assert upcoming["status"] == "upcoming"
    assert upcoming["claim_eligible"] is False

    expired = _create_warranty(
        client,
        appliance["id"],
        provider="Old Provider",
        start_date=(date.today() - timedelta(days=500)).isoformat(),
        end_date=(date.today() - timedelta(days=1)).isoformat(),
        create_expiry_reminder=False,
    )
    assert expired["status"] == "expired"
    assert expired["days_remaining"] == -1

    boundary = _create_warranty(
        client,
        appliance["id"],
        provider="Boundary Provider",
        start_date=date.today().isoformat(),
        end_date=date.today().isoformat(),
        create_expiry_reminder=False,
    )
    assert boundary["status"] == "active"
    assert boundary["days_remaining"] == 0

    listing = client.get("/api/v1/customer/homepassport/warranties")
    assert listing.status_code == 200
    assert listing.json()["total"] == 4

    updated = client.patch(
        f"/api/v1/customer/homepassport/warranties/{active['id']}",
        json={"terms_summary": "Updated recorded terms only."},
    )
    assert updated.status_code == 200
    assert updated.json()["terms_summary"] == "Updated recorded terms only."

    invalid_dates = client.patch(
        f"/api/v1/customer/homepassport/warranties/{active['id']}",
        json={"end_date": "2001-01-01"},
    )
    assert invalid_dates.status_code == 422

    _set_actor(identity_holder, other)
    assert client.get("/api/v1/customer/homepassport/warranties").json()["total"] == 0
    assert (
        client.get(f"/api/v1/customer/homepassport/warranties/{active['id']}").status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/customer/homepassport/warranties/{active['id']}",
            json={"provider": "Not yours"},
        ).status_code
        == 404
    )

    # Client-supplied verification status is never trusted.
    sneaky = client.post(
        "/api/v1/customer/homepassport/warranties",
        json={
            "warranty_type": "service",
            "appliance_id": appliance["id"],
            "provider": "Sneaky Provider",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat(),
            "verification_status": "verified",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert sneaky.status_code == 422  # extra fields are forbidden


def test_warranty_reference_and_reminder_creation(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    missing_reference = client.post(
        "/api/v1/customer/homepassport/warranties",
        json={
            "warranty_type": "manufacturer",
            "provider": "No Reference Ltd",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat(),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert missing_reference.status_code == 422

    warranty = _create_warranty(client, appliance["id"])
    reminders = client.get("/api/v1/customer/homepassport/reminders")
    assert reminders.status_code == 200
    items = reminders.json()["items"]
    assert any(
        item["reminder_type"] == "warranty_expiry" and item["warranty_id"] == warranty["id"]
        for item in items
    )


def test_claim_workflow_transitions_and_authorization(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    admin = _create_user(session, ("admin",), display_name="Support Admin")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])

    claim = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "The compressor stopped working within the coverage window."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert claim.status_code == 201, claim.text
    claim_id = claim.json()["id"]
    assert claim.json()["status"] == "submitted"

    detail = client.get(f"/api/v1/customer/homepassport/warranties/{warranty['id']}")
    assert detail.json()["status"] == "claim_submitted"
    assert detail.json()["claim_eligible"] is False
    assert detail.json()["open_claim_id"] == claim_id

    # A second open claim for the same warranty is rejected.
    duplicate = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "A second report for the same underlying issue."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "claim_already_open"

    # Customers cannot approve or manage claims through the admin endpoints.
    forbidden = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "approve", "note": "Trust me."},
    )
    assert forbidden.status_code == 403

    other_view = None
    _set_actor(identity_holder, other)
    other_view = client.get(f"/api/v1/customer/homepassport/claims/{claim_id}")
    assert other_view.status_code == 404

    _set_actor(identity_holder, admin)
    # Approving directly from submitted is rejected by the state machine.
    invalid = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "approve", "note": "Approved without review step."},
    )
    assert invalid.status_code == 409

    requested = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={
            "action": "request_information",
            "note": "Please share the error code and purchase invoice.",
        },
    )
    assert requested.status_code == 200
    assert requested.json()["status"] == "additional_information_requested"

    _set_actor(identity_holder, customer)
    # Customer cannot approve while the claim awaits their input.
    still_forbidden = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "approve", "note": "Please just approve it."},
    )
    assert still_forbidden.status_code == 403

    response = client.post(
        f"/api/v1/customer/homepassport/claims/{claim_id}/respond",
        json={"note": "Error code E4; invoice attached in documents vault."},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "under_review"

    _set_actor(identity_holder, admin)
    approved = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "approve", "note": "Coverage verified against recorded terms."},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["decision_reason"] == "Coverage verified against recorded terms."
    history = approved.json()["history"]
    assert [event["to_status"] for event in history] == [
        "submitted",
        "additional_information_requested",
        "under_review",
        "approved",
    ]

    _set_actor(identity_holder, customer)
    warranty_detail = client.get(f"/api/v1/customer/homepassport/warranties/{warranty['id']}")
    assert warranty_detail.json()["status"] == "approved"


def test_admin_cannot_decide_own_claim(passport_api) -> None:
    client, identity_holder, session = passport_api
    dual = _create_user(session, ("customer", "admin"), display_name="Dual Role")
    _set_actor(identity_holder, dual)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])
    claim = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "The motor failed within the warranty period."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert claim.status_code == 201
    own_decision = client.post(
        f"/api/v1/admin/homepassport/claims/{claim.json()['id']}/transitions",
        json={"action": "approve", "note": "Deciding on my own claim."},
    )
    assert own_decision.status_code == 403
    assert own_decision.json()["detail"]["code"] == "forbidden"


def test_claim_rejection_and_close(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Support Admin")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])
    claim = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "Display panel went dark after one month of use."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    claim_id = claim.json()["id"]

    _set_actor(identity_holder, admin)
    rejected = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={
            "action": "reject",
            "note": "Damage is physical and outside the recorded terms.",
        },
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    closed = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "close", "note": "Claim file closed."},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"

    terminal = client.post(
        f"/api/v1/admin/homepassport/claims/{claim_id}/transitions",
        json={"action": "close", "note": "Already closed."},
    )
    assert terminal.status_code == 409


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class _FakeDocumentStorage:
    def __init__(self) -> None:
        self.created: list[dict] = []
        self.deleted: list[str] = []

    def create_upload_intent(
        self,
        *,
        document_id,
        owner_user_id,
        original_filename,
        content_type,
        size_bytes,
    ):
        from app.services.document_storage import DocumentUploadIntent

        self.created.append(
            {
                "document_id": document_id,
                "owner_user_id": owner_user_id,
                "content_type": content_type,
            }
        )
        return DocumentUploadIntent(
            provider="fake-storage",
            object_key=f"appliances/{owner_user_id}/{document_id}",
            upload_url="https://storage.fixture.test/upload",
            headers={"Content-Type": content_type},
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )

    def delete_object(self, *, storage_key: str) -> None:
        self.deleted.append(storage_key)


def test_document_upload_intent_unavailable_without_storage(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    app.dependency_overrides[get_document_storage] = lambda: None
    try:
        response = client.post(
            "/api/v1/customer/homepassport/documents/upload-intents",
            json={
                "document_type": "purchase_invoice",
                "original_filename": "invoice.pdf",
                "content_type": "application/pdf",
                "size_bytes": 50_000,
                "appliance_id": appliance["id"],
            },
        )
    finally:
        app.dependency_overrides.pop(get_document_storage, None)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "document_storage_unavailable"

    listing = client.get("/api/v1/customer/homepassport/documents")
    assert listing.status_code == 200
    assert listing.json() == {"items": [], "total": 0, "upload_available": False}


def test_document_intent_and_access_control_with_storage(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    fake = _FakeDocumentStorage()
    app.dependency_overrides[get_document_storage] = lambda: fake
    try:
        _set_actor(identity_holder, customer)
        appliance = _create_appliance(client)

        intent = client.post(
            "/api/v1/customer/homepassport/documents/upload-intents",
            json={
                "document_type": "warranty_certificate",
                "original_filename": "warranty.pdf",
                "content_type": "application/pdf",
                "size_bytes": 120_000,
                "appliance_id": appliance["id"],
            },
        )
        assert intent.status_code == 201, intent.text
        document_id = intent.json()["document_id"]

        invalid_type = client.post(
            "/api/v1/customer/homepassport/documents/upload-intents",
            json={
                "document_type": "repair_report",
                "original_filename": "payload.exe",
                "content_type": "application/x-msdownload",
                "size_bytes": 120_000,
            },
        )
        assert invalid_type.status_code == 422

        oversized = client.post(
            "/api/v1/customer/homepassport/documents/upload-intents",
            json={
                "document_type": "repair_report",
                "original_filename": "big.pdf",
                "content_type": "application/pdf",
                "size_bytes": 11 * 1024 * 1024,
            },
        )
        assert oversized.status_code == 422

        listing = client.get("/api/v1/customer/homepassport/documents")
        assert listing.status_code == 200
        assert listing.json()["total"] == 1
        assert listing.json()["upload_available"] is True
        assert "storage_key" not in listing.text
        assert "appliances/" not in listing.text

        _set_actor(identity_holder, other)
        assert client.get("/api/v1/customer/homepassport/documents").json()["total"] == 0
        assert client.delete(f"/api/v1/customer/homepassport/documents/{document_id}").status_code == 404

        _set_actor(identity_holder, customer)
        assert client.delete(f"/api/v1/customer/homepassport/documents/{document_id}").status_code == 204
        assert fake.deleted, "Expected the storage adapter to be asked to delete the object."
    finally:
        app.dependency_overrides.pop(get_document_storage, None)


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------


def test_reminder_create_duplicate_prevention_and_toggle(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    created = client.post(
        "/api/v1/customer/homepassport/reminders",
        json={
            "reminder_type": "scheduled_maintenance",
            "title": "Deep clean and filter replacement",
            "due_date": (date.today() + timedelta(days=45)).isoformat(),
            "timezone_name": "Asia/Kolkata",
            "appliance_id": appliance["id"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    reminder_id = created.json()["id"]
    assert created.json()["is_enabled"] is True

    duplicate = client.post(
        "/api/v1/customer/homepassport/reminders",
        json={
            "reminder_type": "scheduled_maintenance",
            "title": "Deep clean and filter replacement",
            "due_date": (date.today() + timedelta(days=45)).isoformat(),
            "timezone_name": "Asia/Kolkata",
            "appliance_id": appliance["id"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "reminder_exists"

    reserved = client.post(
        "/api/v1/customer/homepassport/reminders",
        json={
            "reminder_type": "warranty_expiry",
            "title": "Warranty ends soon",
            "due_date": (date.today() + timedelta(days=30)).isoformat(),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert reserved.status_code == 422

    disabled = client.patch(
        f"/api/v1/customer/homepassport/reminders/{reminder_id}",
        json={"is_enabled": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_enabled"] is False

    enabled_only = client.get("/api/v1/customer/homepassport/reminders?enabled=true")
    assert all(
        item["id"] != reminder_id for item in enabled_only.json()["items"]
    )

    deleted = client.delete(f"/api/v1/customer/homepassport/reminders/{reminder_id}")
    assert deleted.status_code == 204


def test_warranty_expiry_reminder_not_duplicated(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])

    rows = list(
        session.scalars(
            select(MaintenanceReminder).where(
                MaintenanceReminder.warranty_id == UUID(warranty["id"])
            )
        ).all()
    )
    assert len(rows) == 1
    assert rows[0].reminder_type == "warranty_expiry"


# ---------------------------------------------------------------------------
# Parts and overview
# ---------------------------------------------------------------------------


def test_manual_parts_and_overview(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    missing_total = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}/parts",
        json={
            "part_name": "Door gasket",
            "quantity": 1,
            "replacement_date": "2025-02-01",
            "unit_price_paise": 75_00,
            "total_price_paise": 99_00,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert missing_total.status_code == 422

    created = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}/parts",
        json={
            "part_name": "Door gasket",
            "part_category": "seals",
            "brand": "FixtureCool",
            "part_number": "DG-42",
            "quantity": 2,
            "replacement_date": "2025-02-01",
            "unit_price_paise": 75_00,
            "technician_notes": "Customer-supplied estimate.",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    assert created.json()["total_price_paise"] == 2 * 75_00

    _create_warranty(client, appliance["id"])

    overview = client.get("/api/v1/customer/homepassport/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["total_appliances"] == 1
    assert body["active_warranties"] == 1
    assert body["expiring_warranties_30d"] == 0
    assert body["recent_parts"][0]["part_name"] == "Door gasket"


# ---------------------------------------------------------------------------
# Audit trail and admin oversight
# ---------------------------------------------------------------------------


def test_admin_correction_and_verification_audit_trail(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Support Admin")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    history = client.post(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}/service-history",
        json={
            "service_date": "2025-03-10",
            "service_category": "ac-repair",
            "problem_description": "No cooling.",
            "work_performed": "Charged gas as per customer.",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert history.status_code == 201
    history_id = history.json()["id"]

    _set_actor(identity_holder, admin)
    missing_note = client.patch(
        f"/api/v1/admin/homepassport/service-history/{history_id}",
        json={"work_performed": "Corrected wording.", "note": ""},
    )
    assert missing_note.status_code == 422

    corrected = client.patch(
        f"/api/v1/admin/homepassport/service-history/{history_id}",
        json={
            "work_performed": "Gas charge and capacitor replaced as documented by the shop.",
            "note": "Corrected wording to match the attached invoice.",
        },
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["work_performed"].startswith("Gas charge")

    # Customer sees the corrected value as well.
    _set_actor(identity_holder, customer)
    detail = client.get(f"/api/v1/customer/homepassport/appliances/{appliance['id']}")
    assert detail.json()["service_history"][0]["work_performed"].startswith("Gas charge")

    audit_as_customer = client.get("/api/v1/admin/homepassport/audit")
    assert audit_as_customer.status_code == 403

    _set_actor(identity_holder, admin)
    audit = client.get("/api/v1/admin/homepassport/audit?entity_type=service_history")
    assert audit.status_code == 200
    entries = audit.json()["items"]
    assert any(
        entry["action"] == "service_history.corrected"
        and "work_performed" in entry["changed_fields"]
        and entry["note"] == "Corrected wording to match the attached invoice."
        for entry in entries
    )


def test_admin_warranty_verification_oversight(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Support Admin")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])

    _set_actor(identity_holder, admin)
    oversight = client.get("/api/v1/admin/homepassport/warranties?verification_status=unverified")
    assert oversight.status_code == 200
    assert any(item["id"] == warranty["id"] for item in oversight.json()["items"])

    verified = client.patch(
        f"/api/v1/admin/homepassport/warranties/{warranty['id']}/verification",
        json={"verification_status": "verified", "note": "Provider portal confirmed."},
    )
    assert verified.status_code == 200
    assert verified.json()["verification_status"] == "verified"

    audit = client.get("/api/v1/admin/homepassport/audit?entity_type=warranty")
    assert any(
        entry["action"] == "warranty.verification_changed" for entry in audit.json()["items"]
    )


def test_admin_claim_documents_listed_for_review(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Support Admin")
    fake = _FakeDocumentStorage()
    app.dependency_overrides[get_document_storage] = lambda: fake
    try:
        _set_actor(identity_holder, customer)
        appliance = _create_appliance(client)
        warranty = _create_warranty(client, appliance["id"])
        claim = client.post(
            f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
            json={"issue_description": "Compressor failed repeatedly under warranty."},
            headers={"Idempotency-Key": str(uuid4())},
        )
        claim_id = claim.json()["id"]
        client.post(
            "/api/v1/customer/homepassport/documents/upload-intents",
            json={
                "document_type": "photo",
                "original_filename": "error-screen.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 80_000,
                "claim_id": claim_id,
            },
        )

        _set_actor(identity_holder, admin)
        evidence = client.get(f"/api/v1/admin/homepassport/claims/{claim_id}/documents")
        assert evidence.status_code == 200
        assert evidence.json()["total"] == 1
        assert "storage_key" not in evidence.text
    finally:
        app.dependency_overrides.pop(get_document_storage, None)


def test_reminder_rejects_unknown_timezone(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)

    response = client.post(
        "/api/v1/customer/homepassport/reminders",
        json={
            "reminder_type": "custom",
            "title": "Check stabilizer",
            "due_date": (date.today() + timedelta(days=10)).isoformat(),
            "timezone_name": "Not/AZone",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 422


def test_claim_boundary_dates(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(
        client,
        appliance["id"],
        start_date=date.today().isoformat(),
        end_date=date.today().isoformat(),
    )
    assert warranty["status"] == "active"
    assert warranty["claim_eligible"] is True

    response = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "Fault on the final day of the recorded warranty period."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201, response.text


def test_archive_and_unarchive_roundtrip(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)

    archived = client.post(f"/api/v1/customer/homepassport/appliances/{appliance['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    assert archived.json()["archived_at"] is not None

    hidden = client.get("/api/v1/customer/homepassport/appliances")
    assert hidden.json()["total"] == 0

    blocked = client.patch(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}",
        json={"name": "Renamed"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "appliance_archived"

    restored = client.post(f"/api/v1/customer/homepassport/appliances/{appliance['id']}/unarchive")
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False
    assert restored.json()["archived_at"] is None

    visible = client.get("/api/v1/customer/homepassport/appliances")
    assert visible.json()["total"] == 1

    renamed = client.patch(
        f"/api/v1/customer/homepassport/appliances/{appliance['id']}",
        json={"name": "Restored name"},
    )
    assert renamed.status_code == 200

    audit = list(
        session.scalars(
            select(HomePassportAuditEvent).where(
                HomePassportAuditEvent.entity_id == UUID(appliance["id"])
            )
        ).all()
    )
    actions = {event.action for event in audit}
    assert "appliance.archived" in actions
    assert "appliance.unarchived" in actions


def test_concurrent_claim_constraint_is_enforced(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    appliance = _create_appliance(client)
    warranty = _create_warranty(client, appliance["id"])
    claim = client.post(
        f"/api/v1/customer/homepassport/warranties/{warranty['id']}/claims",
        json={"issue_description": "Cooling stopped within the coverage window."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert claim.status_code == 201

    # A bypass of the service-layer pre-check must still be rejected by the
    # partial unique index uq_warranty_claims_one_open.
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        session.add(
            WarrantyClaim(
                warranty_id=UUID(warranty["id"]),
                customer_user_id=customer.id,
                issue_description="A racing second claim for the same warranty.",
                status="submitted",
                submitted_at=datetime.now(UTC),
            )
        )
        session.flush()
    session.rollback()
