"""Database-backed draft tests; no payment execution or concurrency claim."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from app.models import Booking, BookingQuote
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def test_persisted_draft_idempotency_and_ownership(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Customer")
    other = _create_user(session, ("customer",), display_name="Other")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _seed_catalog(session)
    _set_actor(identities, customer)
    response = _create_booking(client)
    assert response.status_code == 201, response.text
    booking = session.get(Booking, UUID(response.json()["id"]))
    # Exercise the API guard using a deterministic approved PriceLock fixture.
    booking.status = "approved"
    quote = BookingQuote(
        booking_id=booking.id,
        version=1,
        status="approved",
        is_current=True,
        currency="INR",
        total_paise=12345,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        created_by_user_id=admin.id,
        decision_by_user_id=customer.id,
        decided_at=datetime.now(UTC),
    )
    session.add(quote)
    session.commit()
    key = str(uuid4())
    payload = {"booking_id": str(booking.id), "quote_id": str(quote.id)}
    url = "/api/v1/customer/simulated-payments"
    result = client.post(url, headers={"Idempotency-Key": key}, json=payload)
    assert result.status_code == 200, result.text
    draft = result.json()
    assert draft["status"] == "draft_simulation"
    assert draft["amount_paise"] == 12345 and draft["quote_version"] == 1
    assert (
        client.post(url, headers={"Idempotency-Key": key}, json=payload).json()["id"]
        == draft["id"]
    )
    assert (
        client.post(
            url, headers={"Idempotency-Key": str(uuid4())}, json=payload
        ).status_code
        == 409
    )
    assert client.get(url).json()[0]["id"] == draft["id"]
    _set_actor(identities, other)
    assert client.get(f"{url}/{draft['id']}").status_code == 404
    assert client.get(url).json() == []
    assert (
        client.post(
            url, headers={"Idempotency-Key": str(uuid4())}, json=payload
        ).status_code
        == 404
    )
    _set_actor(identities, admin)
    assert client.get(url).status_code == 403


def test_draft_rejects_expired_cancelled_and_noncurrent_quotes(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Customer")
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
        total_paise=100,
        expires_at=datetime.now(UTC) - timedelta(seconds=1),
        created_by_user_id=customer.id,
        decision_by_user_id=customer.id,
    )
    session.add(quote)
    session.commit()
    payload = {"booking_id": str(booking.id), "quote_id": str(quote.id)}

    def post():
        return client.post(
            "/api/v1/customer/simulated-payments",
            headers={"Idempotency-Key": str(uuid4())},
            json=payload,
        )

    assert post().status_code == 409
    quote.expires_at = datetime.now(UTC) + timedelta(hours=1)
    booking.status = "cancelled"
    session.commit()
    assert post().status_code == 409
    booking.status = "approved"
    quote.is_current = False
    session.commit()
    assert post().status_code == 409
