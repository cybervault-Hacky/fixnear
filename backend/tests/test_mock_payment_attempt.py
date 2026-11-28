"""Simulation only: no callback processing or financial capture is implemented."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.models import Booking, BookingQuote
from app.services.mock_payment_provider import MockPaymentProvider, sign_test_event
from app.services.simulated_finance import verify_mock_signature
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)


@pytest.mark.parametrize(
    "outcome", ["success", "failure", "cancellation", "expiration", "delayed"]
)
def test_deterministic_events_are_simulated(outcome):
    provider = MockPaymentProvider()
    attempt = uuid4()
    event = provider.event(attempt, outcome)
    assert event == provider.event(attempt, outcome)
    assert json.loads(event)["simulated"] is True
    assert json.loads(event)["provider_reference"].startswith("SIMULATED-")
    signature = sign_test_event(event, 1000, secret=b"t" * 32)
    assert verify_mock_signature(event, 1000, signature, secret=b"t" * 32, now=1000)
    assert not verify_mock_signature(event, 1000, signature, secret=b"t" * 32, now=1301)


def test_invalid_provider_outcome():
    with pytest.raises(ValueError):
        MockPaymentProvider().event(uuid4(), "not-an-outcome")


def test_pending_attempt_persists_and_enforces_quote_snapshot_and_ownership(
    booking_api,
):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Customer")
    other = _create_user(session, ("customer",), display_name="Other")
    _seed_catalog(session)
    _set_actor(identities, customer)
    response = _create_booking(client)
    booking = session.get(Booking, UUID(response.json()["id"]))
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
    key = str(uuid4())
    quote.total_paise += 1
    session.commit()
    assert client.post(path, headers={"Idempotency-Key": key}).status_code == 409
    quote.total_paise -= 1
    booking.status = "cancelled"
    session.commit()
    assert client.post(path, headers={"Idempotency-Key": key}).status_code == 409
    booking.status = "approved"
    quote.is_current = False
    session.commit()
    assert client.post(path, headers={"Idempotency-Key": key}).status_code == 409
    quote.is_current = True
    session.commit()
    response = client.post(path, headers={"Idempotency-Key": key})
    assert response.status_code == 200, response.text
    attempt = response.json()
    assert attempt["state"] == "pending_verification" and attempt["verified_at"] is None
    assert attempt["provider_reference"].startswith("SIMULATED-")
    assert (
        client.post(path, headers={"Idempotency-Key": key}).json()["id"]
        == attempt["id"]
    )
    assert (
        client.post(path, headers={"Idempotency-Key": str(uuid4())}).status_code == 409
    )
    assert client.get(path).json()[0]["id"] == attempt["id"]
    _set_actor(identities, other)
    assert client.get(path).status_code == 404
    assert client.post(path, headers={"Idempotency-Key": key}).status_code == 404
