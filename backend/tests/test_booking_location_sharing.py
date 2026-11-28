"""Explicit booking-scoped sharing tests; no live GPS or network services."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select

from app.models import Booking, BookingLocationSharing, OperationsAuditEvent
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def test_booking_scoped_sharing_consent_ownership_staleness_and_audit(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    stranger = _create_user(session, ("customer",), display_name="Other")
    tech = _create_user(
        session,
        ("technician",),
        display_name="Technician",
        verification_status="approved",
    )
    other_tech = _create_user(
        session,
        ("technician",),
        display_name="Other tech",
        verification_status="approved",
    )
    admin = _create_user(session, ("admin",), display_name="Admin")
    _seed_catalog(session)
    _set_actor(identities, customer)
    booking = session.get(Booking, UUID(_create_booking(client).json()["id"]))
    booking.assigned_technician_user_id = tech.id
    booking.status = "accepted"
    session.commit()
    tech_path = f"/api/v1/technician/bookings/{booking.id}/location-sharing"
    customer_path = f"/api/v1/customer/bookings/{booking.id}/technician-location"
    admin_path = f"/api/v1/admin/bookings/{booking.id}/technician-location"
    location = {"latitude": 18.51, "longitude": 73.85, "accuracy_meters": 25}
    assert client.get(customer_path).json()["freshness"] == "unavailable"
    _set_actor(identities, other_tech)
    assert client.put(tech_path, json={"state": "enabled"}).status_code == 404
    assert client.post(tech_path + "/location", json=location).status_code == 404
    _set_actor(identities, tech)
    assert client.post(tech_path + "/location", json=location).status_code == 409
    assert client.put(tech_path, json={"state": "enabled"}).json()["state"] == "enabled"
    assert (
        client.post(
            tech_path + "/location", json={**location, "latitude": 91}
        ).status_code
        == 422
    )
    assert (
        client.post(tech_path + "/location", json=location).json()["freshness"]
        == "fresh"
    )
    _set_actor(identities, stranger)
    assert client.get(customer_path).status_code == 404
    assert client.get(admin_path).status_code == 403
    _set_actor(identities, customer)
    assert client.get(customer_path).json()["latitude"] == location["latitude"]
    row = session.scalar(
        select(BookingLocationSharing).where(
            BookingLocationSharing.booking_id == booking.id
        )
    )
    row.location_updated_at = datetime.now(UTC) - timedelta(minutes=6)
    session.commit()
    stale = client.get(customer_path).json()
    assert stale["freshness"] == "stale" and stale["latitude"] is None
    _set_actor(identities, admin)
    assert client.get(admin_path).status_code == 200
    assert (
        session.scalar(
            select(OperationsAuditEvent).where(
                OperationsAuditEvent.action == "location_sharing.admin_read"
            )
        )
        is not None
    )
    _set_actor(identities, tech)
    assert client.put(tech_path, json={"state": "paused"}).json()["state"] == "paused"
    assert client.post(tech_path + "/location", json=location).status_code == 409
    assert (
        client.put(tech_path, json={"state": "enabled"}).json()["freshness"]
        == "unavailable"
    )
    assert client.post(tech_path + "/location", json=location).status_code == 200
    assert client.put(tech_path, json={"state": "stopped"}).json()["state"] == "stopped"
    _set_actor(identities, customer)
    assert client.get(customer_path).json()["latitude"] is None
    assert (
        session.scalar(
            select(OperationsAuditEvent).where(
                OperationsAuditEvent.action == "location_sharing.stopped"
            )
        )
        is not None
    )


def test_booking_state_change_invalidates_old_consent(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    tech = _create_user(
        session,
        ("technician",),
        display_name="Technician",
        verification_status="approved",
    )
    _seed_catalog(session)
    _set_actor(identities, customer)
    booking = session.get(Booking, UUID(_create_booking(client).json()["id"]))
    booking.assigned_technician_user_id = tech.id
    booking.status = "accepted"
    session.commit()
    path = f"/api/v1/technician/bookings/{booking.id}/location-sharing"
    _set_actor(identities, tech)
    assert client.put(path, json={"state": "enabled"}).status_code == 200
    assert (
        client.post(
            path + "/location",
            json={"latitude": 1, "longitude": 1, "accuracy_meters": 10},
        ).status_code
        == 200
    )
    booking.status = "in_progress"
    session.commit()
    assert client.get(path).json()["state"] == "stopped"
    assert (
        client.post(
            path + "/location",
            json={"latitude": 1, "longitude": 1, "accuracy_meters": 10},
        ).status_code
        == 409
    )


def test_unapproved_technician_cannot_enable_sharing(booking_api):
    client, identities, session = booking_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    tech = _create_user(
        session,
        ("technician",),
        display_name="Pending",
        verification_status="pending_review",
    )
    _seed_catalog(session)
    _set_actor(identities, customer)
    booking = session.get(Booking, UUID(_create_booking(client).json()["id"]))
    booking.assigned_technician_user_id = tech.id
    booking.status = "accepted"
    session.commit()
    _set_actor(identities, tech)
    path = f"/api/v1/technician/bookings/{booking.id}/location-sharing"
    assert client.put(path, json={"state": "enabled"}).status_code == 403


def test_legacy_eta_without_source_is_hidden():
    from uuid import uuid4

    import pytest
    from pydantic import ValidationError

    from app.schemas.booking_management import (
        BookingVisitResponse,
        BookingVisitUpdateRequest,
    )

    old = BookingVisitResponse.model_validate(
        {
            "id": uuid4(),
            "booking_id": uuid4(),
            "status": "scheduled",
            "eta_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "updated_by_user_id": None,
        }
    )
    assert old.eta_at is None
    with pytest.raises(ValidationError):
        BookingVisitUpdateRequest.model_validate(
            {
                "status": "scheduled",
                "eta_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                "eta_source": "live_navigation",
            }
        )
