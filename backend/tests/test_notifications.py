"""Transactional, owner-scoped in-app notifications."""

from uuid import uuid4

from sqlalchemy import func, select

from app.models import Booking, InAppNotification
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def test_booking_notification_isolation_lifecycle_and_preferences(booking_api):
    client, identities, session = booking_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identities, customer)
    key = uuid4()
    response = _create_booking(client, key=key)
    assert response.status_code == 201, response.text
    replay = _create_booking(client, key=key)
    assert replay.status_code in (200, 201), replay.text
    page = client.get("/api/v1/notifications").json()
    assert page["unread_count"] == 1 and page["total"] == 1
    item = page["items"][0]
    assert item["action_path"] == "/bookings/" + response.json()["id"]
    assert "Sample Road" not in str(item)
    _set_actor(identities, other)
    assert client.get("/api/v1/notifications").json()["total"] == 0
    assert (
        client.patch(
            "/api/v1/notifications/" + item["id"], json={"state": "read"}
        ).status_code
        == 404
    )
    _set_actor(identities, customer)
    assert (
        client.patch(
            "/api/v1/notifications/" + item["id"], json={"state": "read"}
        ).json()["state"]
        == "read"
    )
    assert client.get("/api/v1/notifications").json()["unread_count"] == 0
    assert (
        client.patch(
            "/api/v1/notifications/" + item["id"], json={"state": "archived"}
        ).json()["state"]
        == "archived"
    )
    assert client.get("/api/v1/notifications?state=archived").json()["total"] == 1
    assert (
        client.put(
            "/api/v1/notifications/preferences/security", json={"enabled": False}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/notifications/preferences/booking", json={"enabled": False}
        ).status_code
        == 200
    )
    assert _create_booking(client).status_code == 201
    assert client.get("/api/v1/notifications").json()["total"] == 1
    assert client.get("/api/v1/notifications/preferences").json()["security"] is True


def test_failed_booking_rolls_back_notifications(booking_api):
    client, identities, session = booking_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    _set_actor(identities, customer)
    result = _create_booking(client, service_slug="missing-service")
    assert result.status_code in (404, 422)
    assert session.scalar(select(func.count()).select_from(Booking)) == 0
    assert session.scalar(select(func.count()).select_from(InAppNotification)) == 0


def test_failure_after_notification_creation_rolls_back_transaction(
    booking_api, monkeypatch
):
    from app.services import booking_management

    client, identities, session = booking_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    _set_actor(identities, customer)
    original = booking_management.create_booking_event_notifications

    def fail_after_creation(*args):
        original(*args)
        raise RuntimeError("simulated database failure")

    monkeypatch.setattr(
        booking_management, "create_booking_event_notifications", fail_after_creation
    )
    assert _create_booking(client).status_code == 500
    assert session.scalar(select(func.count()).select_from(Booking)) == 0
    assert session.scalar(select(func.count()).select_from(InAppNotification)) == 0
