"""Booking ownership, assignment, state transitions, PriceLock, and idempotency tests."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import (
    AppUser,
    Booking,
    BookingEvent,
    BookingLocationAccessEvent,
    BookingQuote,
    BookingVisit,
    CustomerAddress,
    CustomerProfile,
    Role,
    Service,
    ServiceCategory,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    UserRole,
)
from app.services.booking_management import _fingerprint, execute_idempotent

ISSUER = "https://supabase.invalid/auth/v1"


@pytest.fixture
def booking_api() -> Iterator[tuple[TestClient, dict[str, VerifiedIdentity], Session]]:
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
    email: str | None = None,
    status: str = "active",
    verification_status: str = "not_submitted",
) -> AppUser:
    user = AppUser(
        auth_issuer=ISSUER,
        auth_subject=uuid4(),
        email=email,
        status=status,
    )
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
                professional_description="Self-reported home service technician profile.",
                years_experience=4,
                onboarding_status="complete",
                verification_status=verification_status,
            )
        )
    session.commit()
    return user


def _seed_catalog(session: Session) -> tuple[Service, Service]:
    category = ServiceCategory(
        slug="home-repair",
        title="Home repair",
        description="Fixture category.",
        is_active=True,
    )
    hidden_category = ServiceCategory(
        slug="hidden-category",
        title="Hidden category",
        description="Inactive fixture.",
        is_active=False,
    )
    session.add_all([category, hidden_category])
    session.flush()
    ac = Service(
        category=category,
        slug="ac-repair",
        title="Air conditioner repair",
        home_title="Air conditioner",
        home_description="Cooling problems",
        description="Guide content only.",
        listing_description="Air conditioner diagnostic guide.",
        keywords=["cooling"],
        is_active=True,
    )
    inactive = Service(
        category=category,
        slug="inactive-service",
        title="Inactive service",
        home_title="Inactive",
        home_description="Inactive service",
        description="Hidden.",
        listing_description="Hidden service.",
        is_active=False,
    )
    hidden = Service(
        category=hidden_category,
        slug="hidden-category-service",
        title="Hidden category service",
        home_title="Hidden",
        home_description="Hidden service",
        description="Hidden.",
        listing_description="Hidden category service.",
        is_active=True,
    )
    session.add_all([ac, inactive, hidden])
    session.commit()
    return ac, inactive


def _add_technician_eligibility(
    session: Session,
    technician: AppUser,
    service: Service,
    *,
    locality: str = "Kothrud",
    postal_code: str = "411038",
    city: str = "Pune",
    state: str = "Maharashtra",
    center_latitude: float | None = None,
    center_longitude: float | None = None,
) -> None:
    session.add(
        TechnicianSkill(
            technician_user_id=technician.id,
            service_id=service.id,
            years_experience=4,
        )
    )
    session.add(
        TechnicianCoverageArea(
            technician_user_id=technician.id,
            area_name=locality,
            area_key=f"{locality.casefold()}|{city.casefold()}|{state.casefold()}|{postal_code}",
            city=city,
            state=state,
            postal_code=postal_code,
            center_latitude=center_latitude,
            center_longitude=center_longitude,
        )
    )
    session.commit()


def _booking_request(
    *,
    service_slug: str = "ac-repair",
    address_id: str | None = None,
    save_new_address: bool = False,
) -> dict[str, object]:
    request: dict[str, object] = {
        "service_slug": service_slug,
        "problem_description": "The air conditioner is not cooling the living room.",
        "preferred_date": (date.today() + timedelta(days=7)).isoformat(),
        "preferred_start": "09:00:00",
        "preferred_end": "12:00:00",
        "timezone_name": "Asia/Kolkata",
    }
    if address_id:
        request["address_id"] = address_id
    else:
        request["new_address"] = {
            "label": "Home",
            "recipient_name": "Customer Example",
            "address_line1": "12 Sample Road",
            "address_line2": "Second floor",
            "locality": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
            "contact_phone": "+919876543210",
        }
        request["save_new_address"] = save_new_address
    return request


def _create_booking(client: TestClient, *, key: UUID | None = None, **kwargs):
    return client.post(
        "/api/v1/customer/bookings",
        json=_booking_request(**kwargs),
        headers={"Idempotency-Key": str(key or uuid4())},
    )


def _set_actor(identity_holder: dict[str, VerifiedIdentity], user: AppUser) -> None:
    identity_holder["value"] = _identity(user.auth_subject)


def _admin_assign(
    client: TestClient, booking_id: str, tech: AppUser, *, key: UUID | None = None
):
    return client.post(
        f"/api/v1/admin/bookings/{booking_id}/assign",
        json={"technician_user_id": str(tech.id)},
        headers={"Idempotency-Key": str(key or uuid4())},
    )


def _quote_request(
    *, description: str = "Approved repair estimate", labor_paise: int = 90_000
):
    return {
        "items": [
            {
                "line_type": "inspection",
                "description": "Inspection charge",
                "quantity": 1,
                "unit_amount_paise": 25_000,
            },
            {
                "line_type": "labour",
                "description": "Repair labor",
                "quantity": 2,
                "unit_amount_paise": labor_paise,
            },
            {
                "line_type": "part",
                "description": "Replacement filter",
                "quantity": 2,
                "unit_amount_paise": 12_500,
            },
            {
                "line_type": "additional_fee",
                "description": "Travel fee",
                "quantity": 1,
                "unit_amount_paise": 5_000,
            },
            {
                "line_type": "tax",
                "description": "Tax as quoted",
                "quantity": 1,
                "unit_amount_paise": 10_000,
            },
        ],
        "expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
        "technician_notes": description,
    }


def _advance_to_inspection(client: TestClient, booking_id: str, tech: AppUser) -> None:
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
    assert inspection.json()["status"] == "inspection_pending"


def test_booking_creation_uses_owned_addresses_snapshots_data_and_is_idempotent(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(
        session, ("customer",), display_name="Owner", email="owner@example.test"
    )
    other_customer = _create_user(session, ("customer",), display_name="Other Owner")
    _set_actor(identity_holder, customer)

    address_response = client.post(
        "/api/v1/customer/addresses",
        json={
            "label": "Home",
            "recipient_name": "Customer Example",
            "address_line1": "12 Sample Road",
            "locality": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
            "contact_phone": "+919876543210",
            "is_default": True,
        },
    )
    assert address_response.status_code == 201, address_response.text
    address_id = address_response.json()["id"]
    request = _booking_request(address_id=address_id)
    key = uuid4()
    first = client.post(
        "/api/v1/customer/bookings",
        json=request,
        headers={"Idempotency-Key": str(key)},
    )
    assert first.status_code == 201, first.text
    booking_id = first.json()["id"]
    assert first.json()["status"] == "requested"
    assert first.json()["service_title"] == service.title
    assert first.json()["address"]["locality"] == "Kothrud"
    assert first.json()["problem_description"] == request["problem_description"]
    assert "availability" not in first.text.lower()

    replay = client.post(
        "/api/v1/customer/bookings",
        json=request,
        headers={"Idempotency-Key": str(key)},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == booking_id
    assert session.scalar(select(func.count(Booking.id))) == 1

    changed_payload = {
        **request,
        "problem_description": "A different issue description for the same key.",
    }
    key_reused = client.post(
        "/api/v1/customer/bookings",
        json=changed_payload,
        headers={"Idempotency-Key": str(key)},
    )
    assert key_reused.status_code == 409
    assert key_reused.json()["detail"]["code"] == "idempotency_key_reused"

    _set_actor(identity_holder, other_customer)
    assert client.get(f"/api/v1/customer/bookings/{booking_id}").status_code == 404
    assert (
        client.patch(
            f"/api/v1/customer/addresses/{address_id}",
            json={"label": "Stolen address"},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/customer/addresses").json() == []

    _set_actor(identity_holder, customer)
    new_booking = _create_booking(client, save_new_address=True)
    assert new_booking.status_code == 201, new_booking.text
    assert len(client.get("/api/v1/customer/addresses").json()) == 2
    assert new_booking.json()["address"]["address_line1"] == "12 Sample Road"
    assert new_booking.json()["id"] != booking_id
    assert session.get(CustomerAddress, UUID(address_id)) is not None
    assert session.get(Booking, UUID(booking_id)).saved_address_id == UUID(address_id)

    inactive = _create_booking(client, service_slug="inactive-service")
    assert inactive.status_code == 422
    hidden = _create_booking(client, service_slug="hidden-category-service")
    assert hidden.status_code == 422


def test_booking_row_version_rejects_a_stale_concurrent_mutation(booking_api) -> None:
    """Model two overlapping writers and verify the second cannot overwrite state."""

    client, identity_holder, session = booking_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Versioned customer")
    _set_actor(identity_holder, customer)
    booking_id = UUID(_create_booking(client).json()["id"])

    first_session = Session(
        bind=session.get_bind(), autoflush=False, expire_on_commit=False
    )
    second_session = Session(
        bind=session.get_bind(), autoflush=False, expire_on_commit=False
    )
    try:
        first_copy = first_session.get(Booking, booking_id)
        second_copy = second_session.get(Booking, booking_id)
        assert first_copy is not None and second_copy is not None
        assert first_copy.version == second_copy.version

        first_copy.escalation_status = "escalated"
        first_session.commit()
        second_copy.escalation_status = "resolved"
        with pytest.raises(StaleDataError):
            second_session.commit()
        second_session.rollback()

        session.expire_all()
        latest = session.get(Booking, booking_id)
        assert latest is not None
        assert latest.escalation_status == "escalated"
        assert latest.version == first_copy.version
    finally:
        first_session.close()
        second_session.close()


def test_idempotent_retry_replays_when_a_competing_request_already_committed() -> None:
    """A request that sees the new state after waiting still replays the winner."""

    actor_id = uuid4()
    resource_id = uuid4()
    key = uuid4()
    payload = {"booking_id": str(uuid4()), "action": "start_inspection"}
    record = SimpleNamespace(
        request_hash=_fingerprint(payload),
        resource_type="booking",
        resource_id=resource_id,
    )
    session = Mock()
    session.scalar.side_effect = [None, record]
    mutation = Mock(
        side_effect=HTTPException(
            status_code=409, detail="The booking already advanced."
        )
    )

    result = execute_idempotent(
        session,
        actor=SimpleNamespace(id=actor_id),
        operation="technician.booking.transition",
        key=key,
        payload=payload,
        resource_type="booking",
        mutation=mutation,
    )

    assert result == resource_id
    assert session.scalar.call_count == 2
    session.rollback.assert_called_once()
    mutation.assert_called_once()


def test_admin_assignment_checks_active_approved_skill_and_exact_coverage_and_records_history(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    eligible = _create_user(
        session,
        ("technician",),
        display_name="Eligible Tech",
        verification_status="approved",
    )
    wrong_area = _create_user(
        session,
        ("technician",),
        display_name="Wrong Area",
        verification_status="approved",
    )
    pending = _create_user(
        session,
        ("technician",),
        display_name="Pending Review",
        verification_status="pending_review",
    )
    suspended = _create_user(
        session,
        ("technician",),
        display_name="Suspended",
        status="suspended",
        verification_status="approved",
    )
    _add_technician_eligibility(session, eligible, service)
    _add_technician_eligibility(session, wrong_area, service, locality="Baner")
    _add_technician_eligibility(session, pending, service)
    _add_technician_eligibility(session, suspended, service)

    _set_actor(identity_holder, customer)
    booking = _create_booking(client)
    assert booking.status_code == 201, booking.text
    booking_id = booking.json()["id"]

    assert client.get("/api/v1/admin/bookings").status_code == 403
    _set_actor(identity_holder, admin)
    candidates = client.get(f"/api/v1/admin/bookings/{booking_id}/eligible-technicians")
    assert candidates.status_code == 200
    assert [item["user_id"] for item in candidates.json()] == [str(eligible.id)]

    rejected_assignment = _admin_assign(client, booking_id, wrong_area)
    assert rejected_assignment.status_code == 409
    assert rejected_assignment.json()["detail"]["code"] == "technician_ineligible"
    key = uuid4()
    assigned = _admin_assign(client, booking_id, eligible, key=key)
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "assigned"
    assert assigned.json()["assigned_technician_user_id"] == str(eligible.id)
    replay = _admin_assign(client, booking_id, eligible, key=key)
    assert replay.status_code == 200
    assert (
        session.scalar(
            select(func.count(BookingEvent.id)).where(
                BookingEvent.event_type == "booking.assignment.assigned"
            )
        )
        == 1
    )

    _set_actor(identity_holder, pending)
    unauthorized = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "accept"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert unauthorized.status_code == 409
    assert client.get("/api/v1/technician/bookings").json()["items"] == []

    _set_actor(identity_holder, eligible)
    accepted = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "accept"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "accepted"
    _set_actor(identity_holder, admin)
    detail = client.get(f"/api/v1/admin/bookings/{booking_id}")
    event_types = [event["event_type"] for event in detail.json()["events"]]
    assert "booking.assignment.assigned" in event_types
    assert "booking.assignment.accepted" in event_types
    assert "booking.status_changed" in event_types


def test_technician_decline_returns_request_to_queue_and_preserves_assignment_history(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    tech = _create_user(
        session, ("technician",), display_name="Tech", verification_status="approved"
    )
    _add_technician_eligibility(session, tech, service)
    _set_actor(identity_holder, customer)
    booking = _create_booking(client)
    booking_id = booking.json()["id"]
    _set_actor(identity_holder, admin)
    assert _admin_assign(client, booking_id, tech).status_code == 200
    _set_actor(identity_holder, tech)
    declined = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "decline", "note": "I cannot take this request."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert declined.status_code == 200, declined.text
    assert declined.json()["status"] == "requested"
    assert declined.json()["decision"] == "decline"
    history = client.get(f"/api/v1/technician/bookings/{booking_id}")
    assert history.status_code == 404
    _set_actor(identity_holder, admin)
    events = client.get(f"/api/v1/admin/bookings/{booking_id}").json()["events"]
    assert any(event["event_type"] == "booking.assignment.declined" for event in events)
    assert session.get(Booking, UUID(booking_id)).assigned_technician_user_id is None


def test_pricelock_line_totals_revisions_require_fresh_approval_before_work(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    tech = _create_user(
        session,
        ("technician",),
        display_name="Approved Tech",
        verification_status="approved",
    )
    _add_technician_eligibility(session, tech, service)
    _set_actor(identity_holder, customer)
    booking = _create_booking(client)
    assert booking.status_code == 201, booking.text
    booking_id = booking.json()["id"]
    assert (
        client.post(
            f"/api/v1/technician/bookings/{booking_id}/transitions",
            json={"action": "start_work"},
            headers={"Idempotency-Key": str(uuid4())},
        ).status_code
        == 403
    )

    _set_actor(identity_holder, admin)
    assert _admin_assign(client, booking_id, tech).status_code == 200
    _set_actor(identity_holder, tech)
    _advance_to_inspection(client, booking_id, tech)
    before_quote = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_work"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert before_quote.status_code == 409

    first_quote_key = uuid4()
    first_quote_request = _quote_request(
        description="First inspection and repair estimate"
    )
    first_quote = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=first_quote_request,
        headers={"Idempotency-Key": str(first_quote_key)},
    )
    assert first_quote.status_code == 200, first_quote.text
    quote1 = first_quote.json()["quotes"][0]
    assert quote1["version"] == 1
    assert quote1["status"] == "pending"
    assert quote1["total_paise"] == 25_000 + 2 * 90_000 + 2 * 12_500 + 5_000 + 10_000
    assert [item["line_type"] for item in quote1["line_items"]] == [
        "inspection",
        "labour",
        "part",
        "additional_fee",
        "tax",
    ]
    quote_replay = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=first_quote_request,
        headers={"Idempotency-Key": str(first_quote_key)},
    )
    assert quote_replay.status_code == 200
    assert len(quote_replay.json()["quotes"]) == 1

    _set_actor(identity_holder, customer)
    quote1_id = quote1["id"]
    rejected = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{quote1_id}/decision",
        json={"decision": "rejected", "note": "Please explain the parts allowance."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "quote_rejected"
    _set_actor(identity_holder, tech)

    quote2 = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=_quote_request(
            description="Revised estimate, pending fresh approval", labor_paise=100_000
        ),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert quote2.status_code == 200, quote2.text
    assert quote2.json()["status"] == "quote_pending"
    assert [quote["version"] for quote in quote2.json()["quotes"]] == [1, 2]
    old_version = quote2.json()["quotes"][0]
    assert old_version["status"] == "superseded"
    assert old_version["decision_by_user_id"] == str(customer.id)
    assert old_version["decision_note"] == "Please explain the parts allowance."
    assert old_version["line_items"][1]["unit_amount_paise"] == 90_000

    _set_actor(identity_holder, customer)
    old_quote_decision = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{quote1_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert old_quote_decision.status_code == 409
    quote2_id = quote2.json()["quotes"][1]["id"]
    approved2 = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{quote2_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert approved2.status_code == 200
    assert approved2.json()["status"] == "approved"

    _set_actor(identity_holder, tech)
    revised_after_approval = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=_quote_request(
            description="Updated estimate; prior approval is not reused."
        ),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert revised_after_approval.status_code == 200, revised_after_approval.text
    assert revised_after_approval.json()["status"] == "quote_pending"
    assert revised_after_approval.json()["quotes"][1]["status"] == "superseded"
    blocked_work = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_work"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert blocked_work.status_code == 409
    assert blocked_work.json()["detail"]["code"] == "invalid_booking_transition"

    _set_actor(identity_holder, customer)
    latest_quote = revised_after_approval.json()["quotes"][-1]
    approved3 = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{latest_quote['id']}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert approved3.status_code == 200
    _set_actor(identity_holder, tech)
    start = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_work"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert start.status_code == 200, start.text
    assert start.json()["status"] == "in_progress"
    duplicate_transition = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "start_work"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate_transition.status_code == 409
    completed = client.post(
        f"/api/v1/technician/bookings/{booking_id}/transitions",
        json={"action": "complete"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert len(completed.json()["quotes"]) == 3
    assert session.scalar(select(func.count(BookingQuote.id))) == 3
    assert session.get(Booking, UUID(booking_id)).version >= 8


def test_cancellation_rules_escalation_and_internal_admin_history(booking_api) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Owner")
    other_customer = _create_user(session, ("customer",), display_name="Other")
    admin = _create_user(session, ("admin",), display_name="Admin")
    tech = _create_user(
        session, ("technician",), display_name="Tech", verification_status="approved"
    )
    _add_technician_eligibility(session, tech, service)

    _set_actor(identity_holder, customer)
    cancellable = _create_booking(client)
    booking_id = cancellable.json()["id"]
    _set_actor(identity_holder, other_customer)
    forbidden_cancel = client.post(
        f"/api/v1/customer/bookings/{booking_id}/cancel",
        json={"reason": "Trying to cancel somebody else."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert forbidden_cancel.status_code == 404

    _set_actor(identity_holder, customer)
    cancelled = client.post(
        f"/api/v1/customer/bookings/{booking_id}/cancel",
        json={"reason": "Plans changed for this request."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    duplicate_cancel = client.post(
        f"/api/v1/customer/bookings/{booking_id}/cancel",
        json={"reason": "Plans changed for this request."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate_cancel.status_code == 409

    active = _create_booking(client)
    active_id = active.json()["id"]
    _set_actor(identity_holder, admin)
    assert _admin_assign(client, active_id, tech).status_code == 200
    _set_actor(identity_holder, tech)
    _advance_to_inspection(client, active_id, tech)
    quote = client.post(
        f"/api/v1/technician/bookings/{active_id}/quotes",
        json=_quote_request(),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert quote.status_code == 200
    _set_actor(identity_holder, customer)
    approved = client.post(
        f"/api/v1/customer/bookings/{active_id}/quotes/{quote.json()['quotes'][0]['id']}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert approved.status_code == 200
    _set_actor(identity_holder, tech)
    assert (
        client.post(
            f"/api/v1/technician/bookings/{active_id}/transitions",
            json={"action": "start_work"},
            headers={"Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    _set_actor(identity_holder, customer)
    late_customer_cancel = client.post(
        f"/api/v1/customer/bookings/{active_id}/cancel",
        json={"reason": "Please cancel work already in progress."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert late_customer_cancel.status_code == 409
    assert late_customer_cancel.json()["detail"]["code"] == "cancellation_not_allowed"

    _set_actor(identity_holder, admin)
    escalated = client.patch(
        f"/api/v1/admin/bookings/{active_id}/escalation",
        json={
            "status": "escalated",
            "reason": "Customer requested supervisor follow-up.",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert escalated.status_code == 200, escalated.text
    assert escalated.json()["escalation_status"] == "escalated"
    assert (
        escalated.json()["escalation_reason"]
        == "Customer requested supervisor follow-up."
    )
    resolved = client.patch(
        f"/api/v1/admin/bookings/{active_id}/escalation",
        json={"status": "resolved", "reason": "Supervisor follow-up is complete."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert resolved.status_code == 200
    assert resolved.json()["escalation_status"] == "resolved"
    _set_actor(identity_holder, tech)
    assert client.get(f"/api/v1/technician/bookings/{active_id}").status_code == 200
    _set_actor(identity_holder, customer)
    customer_detail = client.get(f"/api/v1/customer/bookings/{active_id}")
    assert customer_detail.status_code == 200
    assert customer_detail.json()["escalation_reason"] is None
    assert all(not event["is_internal"] for event in customer_detail.json()["events"])

    _set_actor(identity_holder, admin)
    admin_detail = client.get(f"/api/v1/admin/bookings/{active_id}")
    assert (
        admin_detail.json()["events"][-1]["event_type"] == "booking.escalation.resolved"
    )
    admin_cancel = client.post(
        f"/api/v1/admin/bookings/{active_id}/cancel",
        json={"reason": "Admin cancellation after review."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert admin_cancel.status_code == 200
    assert admin_cancel.json()["status"] == "cancelled"


def test_quote_schema_rejects_naive_expiry_and_rejection_without_explanation(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    tech = _create_user(
        session, ("technician",), display_name="Tech", verification_status="approved"
    )
    _add_technician_eligibility(session, tech, service)
    _set_actor(identity_holder, customer)
    booking = _create_booking(client)
    booking_id = booking.json()["id"]
    _set_actor(identity_holder, admin)
    assert _admin_assign(client, booking_id, tech).status_code == 200
    _set_actor(identity_holder, tech)
    _advance_to_inspection(client, booking_id, tech)

    naive_expiry = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json={**_quote_request(), "expires_at": "2030-01-01T10:00:00"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert naive_expiry.status_code == 422
    issued = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=_quote_request(),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert issued.status_code == 200
    quote_id = issued.json()["quotes"][0]["id"]
    _set_actor(identity_holder, customer)
    no_reason = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{quote_id}/decision",
        json={"decision": "rejected"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert no_reason.status_code == 422


def test_expired_quote_cannot_be_approved_and_revised_version_needs_fresh_decision(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Quote owner")
    other_customer = _create_user(session, ("customer",), display_name="Other customer")
    admin = _create_user(session, ("admin",), display_name="Quote admin")
    technician = _create_user(
        session,
        ("technician",),
        display_name="Quote technician",
        verification_status="approved",
    )
    _add_technician_eligibility(session, technician, service)

    _set_actor(identity_holder, customer)
    booking_id = _create_booking(client).json()["id"]
    _set_actor(identity_holder, admin)
    assert _admin_assign(client, booking_id, technician).status_code == 200
    _set_actor(identity_holder, technician)
    _advance_to_inspection(client, booking_id, technician)
    issued = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=_quote_request(description="Quote that will expire"),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert issued.status_code == 200, issued.text
    first_quote_id = issued.json()["quotes"][0]["id"]
    first_quote = session.get(BookingQuote, UUID(first_quote_id))
    assert first_quote is not None
    first_quote.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()

    _set_actor(identity_holder, other_customer)
    hidden_quote = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{first_quote_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert hidden_quote.status_code == 404

    _set_actor(identity_holder, customer)
    expired_detail = client.get(f"/api/v1/customer/bookings/{booking_id}")
    assert expired_detail.status_code == 200
    assert expired_detail.json()["status"] == "quote_pending"
    assert expired_detail.json()["quotes"][0]["status"] == "expired"
    assert expired_detail.json()["quotes"][0]["is_expired"] is True
    expired_decision = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{first_quote_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert expired_decision.status_code == 409
    assert expired_decision.json()["detail"]["code"] == "quote_expired"

    _set_actor(identity_holder, technician)
    revised = client.post(
        f"/api/v1/technician/bookings/{booking_id}/quotes",
        json=_quote_request(description="Fresh quote after expiry"),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert revised.status_code == 200, revised.text
    assert [quote["version"] for quote in revised.json()["quotes"]] == [1, 2]
    assert revised.json()["quotes"][0]["status"] == "expired"
    assert revised.json()["quotes"][1]["status"] == "pending"
    assert revised.json()["quotes"][1]["is_current"] is True

    _set_actor(identity_holder, customer)
    second_quote_id = revised.json()["quotes"][1]["id"]
    approved = client.post(
        f"/api/v1/customer/bookings/{booking_id}/quotes/{second_quote_id}/decision",
        json={"decision": "approved"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


def test_admin_booking_filters_and_customer_address_delete_keeps_booking_snapshot(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    _service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, customer)
    created = _create_booking(client, save_new_address=True)
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]
    addresses = client.get("/api/v1/customer/addresses").json()
    address_id = addresses[0]["id"]
    removed = client.delete(f"/api/v1/customer/addresses/{address_id}")
    assert removed.status_code == 204
    assert session.get(Booking, UUID(booking_id)).saved_address_id is None
    detail = client.get(f"/api/v1/customer/bookings/{booking_id}")
    assert detail.json()["address"]["address_line1"] == "12 Sample Road"

    _set_actor(identity_holder, admin)
    filtered = client.get(
        "/api/v1/admin/bookings",
        params={
            "status": "requested",
            "service_slug": "ac-repair",
            "date_from": (date.today() + timedelta(days=6)).isoformat(),
            "date_to": (date.today() + timedelta(days=8)).isoformat(),
        },
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert [item["id"] for item in filtered.json()["items"]] == [booking_id]
    invalid_range = client.get(
        "/api/v1/admin/bookings",
        params={"date_from": "2030-01-02", "date_to": "2030-01-01"},
    )
    assert invalid_range.status_code == 422
    assert session.scalar(select(func.count(Booking.id))) == 1


def test_nearby_discovery_filters_eligibility_and_sorts_area_centers(
    booking_api,
) -> None:
    client, _identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    near = _create_user(
        session,
        ("technician",),
        display_name="Near service area",
        verification_status="approved",
    )
    far = _create_user(
        session,
        ("technician",),
        display_name="Far service area",
        verification_status="approved",
    )
    unverified = _create_user(
        session,
        ("technician",),
        display_name="Unverified",
        verification_status="pending_review",
    )
    inactive = _create_user(
        session,
        ("technician",),
        display_name="Inactive",
        status="suspended",
        verification_status="approved",
    )
    wrong_area = _create_user(
        session,
        ("technician",),
        display_name="Wrong area",
        verification_status="approved",
    )
    no_center = _create_user(
        session,
        ("technician",),
        display_name="No service-area center",
        verification_status="approved",
    )
    _create_user(
        session,
        ("technician",),
        display_name="No active skill",
        verification_status="approved",
    )

    # Synthetic coordinates are confined to test records; migrations seed no technician location.
    _add_technician_eligibility(
        session,
        near,
        service,
        locality="Kothrud",
        postal_code="411038",
        center_latitude=0.01,
        center_longitude=0.0,
    )
    _add_technician_eligibility(
        session,
        far,
        service,
        locality="Baner",
        postal_code="411045",
        center_latitude=0.1,
        center_longitude=0.0,
    )
    _add_technician_eligibility(
        session, unverified, service, center_latitude=0.005, center_longitude=0.0
    )
    _add_technician_eligibility(
        session, inactive, service, center_latitude=0.002, center_longitude=0.0
    )
    _add_technician_eligibility(
        session,
        wrong_area,
        service,
        locality="Other locality",
        postal_code="411099",
        center_latitude=0.5,
        center_longitude=0.0,
    )
    _add_technician_eligibility(
        session, no_center, service, locality="Kothrud", postal_code="411038"
    )
    session.commit()

    discovery_path = "/api/v1/services/ac-repair/nearby-technicians/search"
    nearby = client.post(
        discovery_path,
        json={"mode": "coordinates", "latitude": 0, "longitude": 0, "radius_km": 15},
    )
    assert nearby.status_code == 200, nearby.text
    body = nearby.json()
    assert body["location_mode"] == "coordinates"
    assert body["sort"] == "distance"
    assert "latitude" not in body and "longitude" not in body
    assert [item["display_name"] for item in body["results"]] == [
        "Near service area",
        "Far service area",
    ]
    assert body["results"][0]["distance_km"] < body["results"][1]["distance_km"]
    assert body["results"][0]["latitude"] == 0.01
    assert body["results"][0]["distance_basis"] == "approximate_service_area_center"
    assert all(
        "address_line1" not in item and "email" not in item for item in body["results"]
    )
    assert all("contact_phone" not in item for item in body["results"])

    limited = client.post(
        discovery_path,
        json={"mode": "coordinates", "latitude": 0, "longitude": 0, "radius_km": 5},
    )
    assert limited.status_code == 200
    assert [item["display_name"] for item in limited.json()["results"]] == [
        "Near service area"
    ]

    manual = client.post(
        discovery_path,
        json={
            "mode": "manual_area",
            "area": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
        },
    )
    assert manual.status_code == 200, manual.text
    assert manual.json()["location_mode"] == "manual_area"
    assert manual.json()["sort"] == "service_area"
    assert [item["display_name"] for item in manual.json()["results"]] == [
        "Near service area",
        "No service-area center",
    ]
    assert all(item["distance_km"] is None for item in manual.json()["results"])
    assert manual.json()["results"][1]["latitude"] is None
    assert manual.json()["results"][1]["longitude"] is None
    assert client.post(discovery_path, json={"mode": "manual_area"}).status_code == 422
    assert (
        client.post(
            discovery_path,
            json={"mode": "coordinates", "latitude": 1},
        ).status_code
        == 422
    )
    assert (
        client.post(
            discovery_path,
            json={
                "mode": "coordinates",
                "latitude": 1,
                "longitude": 2,
                "area": "must not mix search modes",
            },
        ).status_code
        == 422
    )
    assert client.get(discovery_path).status_code == 405
    assert (
        client.post(
            "/api/v1/services/inactive-service/nearby-technicians/search",
            json={"mode": "manual_area", "area": "Kothrud"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/services/hidden-category-service/nearby-technicians/search",
            json={"mode": "manual_area", "area": "Kothrud"},
        ).status_code
        == 404
    )


def test_public_technician_profile_requires_eligibility_and_omits_private_fields(
    booking_api,
) -> None:
    client, _identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    technician = _create_user(
        session,
        ("technician",),
        display_name="Approved profile",
        verification_status="approved",
    )
    _add_technician_eligibility(
        session, technician, service, center_latitude=0.12345, center_longitude=1.23456
    )
    response = client.get(f"/api/v1/technicians/{technician.id}/services/ac-repair")
    assert response.status_code == 200, response.text
    profile = response.json()
    assert profile["verification_approved"] is True
    assert profile["user_id"] == str(technician.id)
    assert profile["coverage_areas"][0]["latitude"] == 0.12
    assert profile["coverage_areas"][0]["longitude"] == 1.23
    assert "email" not in profile and "phone" not in profile
    assert "address_line1" not in profile and "residential_address" not in profile

    pending = _create_user(
        session,
        ("technician",),
        display_name="Pending profile",
        verification_status="pending_review",
    )
    _add_technician_eligibility(session, pending, service)
    assert (
        client.get(f"/api/v1/technicians/{pending.id}/services/ac-repair").status_code
        == 404
    )


def test_booking_location_is_audited_and_hidden_until_assigned_technician_accepts(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Location owner")
    admin = _create_user(session, ("admin",), display_name="Booking admin")
    assigned = _create_user(
        session,
        ("technician",),
        display_name="Accepted technician",
        verification_status="approved",
    )
    unrelated = _create_user(
        session,
        ("technician",),
        display_name="Unrelated technician",
        verification_status="approved",
    )
    _add_technician_eligibility(session, assigned, service)
    _add_technician_eligibility(session, unrelated, service)
    _set_actor(identity_holder, customer)

    incomplete_payload = _booking_request()
    incomplete_address = incomplete_payload["new_address"]
    assert isinstance(incomplete_address, dict)
    incomplete_address["latitude"] = 0.25
    incomplete_coordinates = client.post(
        "/api/v1/customer/bookings",
        json=incomplete_payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert incomplete_coordinates.status_code == 422

    out_of_range_payload = _booking_request()
    out_of_range_address = out_of_range_payload["new_address"]
    assert isinstance(out_of_range_address, dict)
    out_of_range_address.update({"latitude": 91, "longitude": 0})
    out_of_range_coordinates = client.post(
        "/api/v1/customer/bookings",
        json=out_of_range_payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert out_of_range_coordinates.status_code == 422

    payload = _booking_request(save_new_address=True)
    new_address = payload["new_address"]
    assert isinstance(new_address, dict)
    # Synthetic location fixture only. No real customer address or production coordinate is used.
    new_address.update(
        {"latitude": 0.25, "longitude": 0.5, "location_accuracy_meters": 30.0}
    )
    created = client.post(
        "/api/v1/customer/bookings",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]
    assert created.json()["address"]["latitude"] == 0.25
    assert created.json()["address"]["longitude"] == 0.5

    _set_actor(identity_holder, admin)
    admin_detail = _admin_assign(client, booking_id, assigned)
    assert admin_detail.status_code == 200
    assert admin_detail.json()["address"]["latitude"] == 0.25
    admin_location_read = session.scalar(
        select(BookingLocationAccessEvent).where(
            BookingLocationAccessEvent.actor_user_id == admin.id,
            BookingLocationAccessEvent.booking_id == UUID(booking_id),
        )
    )
    assert admin_location_read is not None
    assert admin_location_read.actor_role == "admin"
    assert "coordinates" in admin_location_read.fields_accessed

    _set_actor(identity_holder, assigned)
    before = (
        session.scalar(
            select(func.count(BookingLocationAccessEvent.id)).where(
                BookingLocationAccessEvent.actor_user_id == assigned.id
            )
        )
        or 0
    )
    pre_accept = client.get(f"/api/v1/technician/bookings/{booking_id}")
    assert pre_accept.status_code == 200
    assert pre_accept.json()["address"] is None
    assert pre_accept.json()["address_locality"] is None
    assert pre_accept.json()["city"] is None
    assert pre_accept.json()["visit"] is None
    assert pre_accept.json()["location_access_limited"] is True
    assignment_list = client.get("/api/v1/technician/bookings")
    assert assignment_list.status_code == 200
    assignment_summary = next(
        item for item in assignment_list.json()["items"] if item["id"] == booking_id
    )
    assert assignment_summary["address_locality"] is None
    assert assignment_summary["city"] is None
    assert (
        session.scalar(
            select(func.count(BookingLocationAccessEvent.id)).where(
                BookingLocationAccessEvent.actor_user_id == assigned.id
            )
        )
        or 0
    ) == before

    _set_actor(identity_holder, unrelated)
    unrelated_list = client.get("/api/v1/technician/bookings")
    assert unrelated_list.status_code == 200
    assert unrelated_list.json()["items"] == []
    assert client.get(f"/api/v1/technician/bookings/{booking_id}").status_code == 404
    assert (
        session.scalar(
            select(func.count(BookingLocationAccessEvent.id)).where(
                BookingLocationAccessEvent.actor_user_id == unrelated.id
            )
        )
        or 0
    ) == 0

    _set_actor(identity_holder, assigned)
    accepted = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "accept"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert accepted.status_code == 200
    accepted_detail = client.get(f"/api/v1/technician/bookings/{booking_id}")
    assert accepted_detail.status_code == 200
    assert accepted_detail.json()["address"]["latitude"] == 0.25
    assert accepted_detail.json()["address"]["longitude"] == 0.5
    assert accepted_detail.json()["address_locality"] == "Kothrud"
    assert accepted_detail.json()["city"] == "Pune"
    accepted_list = client.get("/api/v1/technician/bookings")
    assert accepted_list.status_code == 200
    accepted_summary = next(
        item for item in accepted_list.json()["items"] if item["id"] == booking_id
    )
    assert accepted_summary["address_locality"] is None
    assert accepted_summary["city"] is None
    assert (
        session.scalar(
            select(func.count(BookingLocationAccessEvent.id)).where(
                BookingLocationAccessEvent.actor_user_id == assigned.id,
                BookingLocationAccessEvent.booking_id == UUID(booking_id),
            )
        )
        or 0
    ) == 1

    _set_actor(identity_holder, customer)
    addresses = client.get("/api/v1/customer/addresses")
    assert addresses.status_code == 200
    address_id = UUID(addresses.json()[0]["id"])
    address_access = session.scalar(
        select(BookingLocationAccessEvent).where(
            BookingLocationAccessEvent.actor_user_id == customer.id,
            BookingLocationAccessEvent.address_id == address_id,
        )
    )
    assert address_access is not None
    assert address_access.actor_role == "customer"
    assert "coordinates" in address_access.fields_accessed


def test_visit_eta_updates_are_visit_scoped_manual_and_tracking_is_unavailable(
    booking_api,
) -> None:
    client, identity_holder, session = booking_api
    service, _inactive = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Visit customer")
    admin = _create_user(session, ("admin",), display_name="Visit admin")
    technician = _create_user(
        session,
        ("technician",),
        display_name="Visit technician",
        verification_status="approved",
    )
    _add_technician_eligibility(session, technician, service)
    _set_actor(identity_holder, customer)
    booking_id = _create_booking(client).json()["id"]
    _set_actor(identity_holder, admin)
    assert _admin_assign(client, booking_id, technician).status_code == 200
    admin_before_accept = client.put(
        f"/api/v1/admin/bookings/{booking_id}/visit",
        json={
            "status": "scheduled",
            "eta_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert admin_before_accept.status_code == 409

    _set_actor(identity_holder, technician)
    eta = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    early = client.put(
        f"/api/v1/technician/bookings/{booking_id}/visit",
        json={"status": "scheduled", "eta_at": eta},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert early.status_code == 409
    accepted = client.post(
        f"/api/v1/technician/bookings/{booking_id}/assignment-decision",
        json={"decision": "accept"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert accepted.status_code == 200

    scheduled = client.put(
        f"/api/v1/technician/bookings/{booking_id}/visit",
        json={"status": "scheduled", "eta_at": eta},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["status"] == "scheduled"
    assert scheduled.json()["live_tracking_status"] == "unavailable"
    visit_id = scheduled.json()["id"]

    _set_actor(identity_holder, admin)
    admin_eta = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
    admin_key = uuid4()
    admin_scheduled = client.put(
        f"/api/v1/admin/bookings/{booking_id}/visit",
        json={"status": "scheduled", "eta_at": admin_eta},
        headers={"Idempotency-Key": str(admin_key)},
    )
    assert admin_scheduled.status_code == 200, admin_scheduled.text
    assert admin_scheduled.json()["id"] == visit_id
    assert admin_scheduled.json()["updated_by_user_id"] == str(admin.id)
    replay = client.put(
        f"/api/v1/admin/bookings/{booking_id}/visit",
        json={"status": "scheduled", "eta_at": admin_eta},
        headers={"Idempotency-Key": str(admin_key)},
    )
    assert replay.status_code == 200
    assert (
        session.scalar(
            select(func.count(BookingEvent.id)).where(
                BookingEvent.booking_id == UUID(booking_id),
                BookingEvent.event_type == "booking.visit.updated",
            )
        )
        == 2
    )

    _set_actor(identity_holder, technician)
    skipped = client.put(
        f"/api/v1/technician/bookings/{booking_id}/visit",
        json={"status": "completed"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert skipped.status_code == 409
    en_route = client.put(
        f"/api/v1/technician/bookings/{booking_id}/visit",
        json={
            "status": "en_route",
            "eta_at": (datetime.now(UTC) + timedelta(minutes=45)).isoformat(),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert en_route.status_code == 200
    assert en_route.json()["id"] == visit_id
    assert en_route.json()["live_tracking_status"] == "unavailable"
    assert session.scalar(select(func.count(BookingVisit.id))) == 1

    _set_actor(identity_holder, admin)
    arrived = client.put(
        f"/api/v1/admin/bookings/{booking_id}/visit",
        json={"status": "arrived", "eta_at": None},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert arrived.status_code == 200, arrived.text
    assert arrived.json()["status"] == "arrived"
    assert arrived.json()["updated_by_user_id"] == str(admin.id)
    admin_visit_event = session.scalar(
        select(BookingEvent)
        .where(
            BookingEvent.booking_id == UUID(booking_id),
            BookingEvent.event_type == "booking.visit.updated",
            BookingEvent.actor_user_id == admin.id,
        )
        .order_by(BookingEvent.sequence.desc())
        .limit(1)
    )
    assert admin_visit_event is not None
    assert admin_visit_event.from_status == "en_route"
    assert admin_visit_event.to_status == "arrived"

    _set_actor(identity_holder, customer)
    denied_admin_write = client.put(
        f"/api/v1/admin/bookings/{booking_id}/visit",
        json={"status": "completed", "eta_at": None},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert denied_admin_write.status_code == 403
    detail = client.get(f"/api/v1/customer/bookings/{booking_id}")
    assert detail.status_code == 200
    assert detail.json()["visit"]["status"] == "arrived"
    assert detail.json()["visit"]["live_tracking_status"] == "unavailable"
    assert "latitude" not in detail.json()["visit"]
