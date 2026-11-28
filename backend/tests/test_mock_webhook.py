"""Mock-only webhook tests; SQLite is not a PostgreSQL concurrency test."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.api.v1.mock_webhook import get_test_webhook_secret
from app.main import app
from app.models import Booking, BookingQuote, MockWebhookEvent
from app.services.mock_payment_provider import MockPaymentProvider, sign_test_event
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)

SECRET = b"test-only-not-a-real-secret-123456789"


def setup_attempt(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Customer")
    _seed_catalog(session)
    _set_actor(identities, customer)
    booking = session.get(Booking, UUID(_create_booking(client).json()["id"]))
    booking.status = "approved"
    quote = BookingQuote(
        booking_id=booking.id,
        version=1,
        status="approved",
        is_current=True,
        currency="INR",
        total_paise=12345,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        created_by_user_id=customer.id,
        decision_by_user_id=customer.id,
    )
    session.add(quote)
    session.commit()
    draft = client.post(
        "/api/v1/customer/simulated-payments",
        headers={"Idempotency-Key": str(uuid4())},
        json={"booking_id": str(booking.id), "quote_id": str(quote.id)},
    ).json()
    path = f"/api/v1/customer/simulated-payments/{draft['id']}/attempts"
    response = client.post(path, headers={"Idempotency-Key": str(uuid4())})
    assert response.status_code == 200, response.text
    app.dependency_overrides[get_test_webhook_secret] = lambda: SECRET
    return (
        client,
        identities,
        session,
        booking,
        quote,
        path,
        UUID(response.json()["id"]),
    )


def send(client, body, timestamp=None, signature=None):
    timestamp = timestamp or int(datetime.now(UTC).timestamp())
    signature = signature or sign_test_event(body, timestamp, secret=SECRET)
    return client.post(
        "/api/v1/webhooks/mock-payment",
        content=body,
        headers={
            "X-Mock-Timestamp": str(timestamp),
            "X-Mock-Signature": signature,
            "Content-Type": "application/json",
        },
    )


@pytest.mark.parametrize(
    ("outcome", "state"),
    [
        ("success", "verified_success_simulation"),
        ("failure", "verified_failure_simulation"),
        ("cancellation", "verified_cancelled_simulation"),
        ("expiration", "verified_expired_simulation"),
        ("delayed", "pending_verification"),
    ],
)
def test_verified_outcomes_are_durable(booking_api, outcome, state):
    client, _, session, _, _, path, attempt_id = setup_attempt(booking_api)
    body = MockPaymentProvider().event(attempt_id, outcome)
    assert send(client, body).json()["status"] == "accepted"
    session.expire_all()
    assert client.get(path).json()[0]["state"] == state
    event = session.get(MockWebhookEvent, UUID(json.loads(body)["event_id"]))
    assert event.signature_verified and event.processing_state == "processed"
    assert send(client, body).json()["status"] == "duplicate"
    assert len(session.scalars(select(MockWebhookEvent)).all()) == 1


def test_invalid_expired_malformed_and_conflicting_delivery(booking_api):
    client, _, session, _, _, _, attempt_id = setup_attempt(booking_api)
    body = MockPaymentProvider().event(attempt_id, "success")
    assert send(client, body, signature="0" * 64).status_code == 401
    assert (
        send(
            client, body, timestamp=int(datetime.now(UTC).timestamp()) - 301
        ).status_code
        == 401
    )
    assert send(client, b"{").status_code == 400
    assert session.scalars(select(MockWebhookEvent)).all() == []
    assert send(client, body).status_code == 200
    data = json.loads(body)
    data["outcome"] = "failure"
    assert send(client, json.dumps(data).encode()).status_code == 409


@pytest.mark.parametrize(
    "condition", ["cancelled", "superseded", "amount", "wrong_reference"]
)
def test_ineligible_events_are_recorded_but_do_not_transition(booking_api, condition):
    client, _, session, booking, quote, path, attempt_id = setup_attempt(booking_api)
    if condition == "cancelled":
        booking.status = "cancelled"
    if condition == "superseded":
        quote.is_current = False
    if condition == "amount":
        quote.total_paise += 1
    session.commit()
    event = json.loads(MockPaymentProvider().event(attempt_id, "success"))
    if condition == "wrong_reference":
        event["provider_reference"] = "SIMULATED-wrong"
    assert send(client, json.dumps(event).encode()).status_code == 200
    assert client.get(path).json()[0]["state"] == "pending_verification"
    assert (
        session.get(MockWebhookEvent, UUID(event["event_id"])).processing_state
        == "rejected"
    )


def test_unknown_and_conflicting_terminal_events(booking_api):
    client, _, session, _, _, path, attempt_id = setup_attempt(booking_api)
    unknown = MockPaymentProvider().event(uuid4(), "success")
    assert send(client, unknown).status_code == 200
    assert (
        session.get(
            MockWebhookEvent, UUID(json.loads(unknown)["event_id"])
        ).failure_reason_code
        == "unknown_attempt"
    )
    assert (
        send(client, MockPaymentProvider().event(attempt_id, "success")).status_code
        == 200
    )
    conflict = MockPaymentProvider().event(attempt_id, "failure")
    assert send(client, conflict).status_code == 200
    assert client.get(path).json()[0]["state"] == "verified_success_simulation"
    assert (
        session.get(
            MockWebhookEvent, UUID(json.loads(conflict)["event_id"])
        ).failure_reason_code
        == "terminal_attempt"
    )


def test_event_persists_in_new_session_and_owner_isolation(booking_api):
    from sqlalchemy.orm import Session

    client, identities, session, _, _, path, attempt_id = setup_attempt(booking_api)
    body = MockPaymentProvider().event(attempt_id, "success")
    assert send(client, body).status_code == 200
    with Session(session.get_bind()) as other_session:
        event = other_session.get(MockWebhookEvent, UUID(json.loads(body)["event_id"]))
        assert event is not None and event.processing_state == "processed"
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identities, other)
    assert client.get(path).status_code == 404


def test_processing_rolls_back_on_commit_failure(booking_api, monkeypatch):
    from app.services.mock_webhooks import MockEvent, process_mock_event

    _, _, session, _, _, _path, attempt_id = setup_attempt(booking_api)
    body = MockPaymentProvider().event(attempt_id, "success")
    event = MockEvent.model_validate_json(body)
    original_commit = session.commit

    def fail_commit():
        raise RuntimeError("simulated database failure")

    monkeypatch.setattr(session, "commit", fail_commit)
    with pytest.raises(RuntimeError):
        process_mock_event(session, event, body, int(datetime.now(UTC).timestamp()))
    session.rollback()
    monkeypatch.setattr(session, "commit", original_commit)
    assert session.get(MockWebhookEvent, event.event_id) is None
    from app.models import SimulatedPaymentAttempt

    assert (
        session.get(SimulatedPaymentAttempt, attempt_id).state == "pending_verification"
    )
