"""Delivery queue and admin authorization tests (SQLite only)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models import (
    NotificationDelivery,
    NotificationDeliveryAttempt,
    OperationsAuditEvent,
)
from app.services.notification_delivery import (
    DeliveryResult,
    SimulatedAdapter,
    backoff,
    claim,
    enqueue,
    finish,
    process_one,
    recover_expired,
)
from tests.test_booking_management import (
    _create_booking,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def setup_job(booking_api):
    client, identities, session = booking_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Customer")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identities, customer)
    assert _create_booking(client).status_code == 201
    job = session.scalar(select(NotificationDelivery))
    assert job is not None
    return client, identities, session, customer, admin, job


def test_claim_finish_and_idempotency(booking_api):
    _, _, session, _, _, job = setup_job(booking_api)
    assert (
        enqueue(session, job.notification_id, job.channel, job.idempotency_key).id
        == job.id
    )
    token = claim(session, job.id)
    assert token is not None
    assert claim(session, job.id) is None
    assert finish(session, job.id, uuid4(), DeliveryResult(True)) is False
    assert finish(session, job.id, token, DeliveryResult(True)) is True
    assert claim(session, job.id) is None
    assert session.get(NotificationDelivery, job.id).state == "delivered"
    assert len(session.scalars(select(NotificationDeliveryAttempt)).all()) == 1


def test_fail_backoff_recovery_and_dead_letter(booking_api):
    _, _, session, _, _, job = setup_job(booking_api)
    now = datetime.now(UTC)
    token = claim(session, job.id, now)
    assert finish(session, job.id, token, DeliveryResult(False), now)
    assert session.get(NotificationDelivery, job.id).state == "retry_pending"
    assert claim(session, job.id, now + timedelta(seconds=29)) is None
    token = claim(session, job.id, now + backoff(1))
    assert token
    assert recover_expired(session, now + backoff(1) + timedelta(seconds=121)) == 1
    assert finish(session, job.id, token, DeliveryResult(True)) is False
    token = claim(
        session, job.id, now + backoff(1) + timedelta(seconds=121) + backoff(2)
    )
    assert token
    assert finish(session, job.id, token, DeliveryResult(False), now)
    assert session.get(NotificationDelivery, job.id).state == "permanently_failed"
    assert claim(session, job.id, now + timedelta(days=1)) is None
    assert [
        a.outcome
        for a in session.scalars(
            select(NotificationDeliveryAttempt).order_by(
                NotificationDeliveryAttempt.attempt_number
            )
        )
    ] == ["simulated_failure", "interrupted", "simulated_failure"]
    assert backoff(999) == timedelta(hours=1)


def test_admin_only_and_audited_retry(booking_api):
    client, identities, session, customer, admin, job = setup_job(booking_api)
    job.state = "permanently_failed"
    job.attempt_count = 3
    session.commit()
    path = "/api/v1/admin/notification-deliveries"
    assert client.get(path).status_code == 403
    assert client.post(f"{path}/{job.id}/retry").status_code == 403
    _set_actor(identities, admin)
    assert client.get(path + "?state=permanently_failed").json()["total"] == 1
    assert client.get(f"{path}/{job.id}").status_code == 200
    assert client.post(f"{path}/{job.id}/retry").status_code == 200
    assert client.post(f"{path}/{job.id}/retry").status_code == 409
    assert (
        session.scalar(
            select(OperationsAuditEvent).where(OperationsAuditEvent.entity_id == job.id)
        ).action
        == "notification_delivery.retry"
    )
    assert process_one(session, job.id, SimulatedAdapter())
    assert session.get(NotificationDelivery, job.id).state == "delivered"
    _set_actor(identities, customer)
    assert client.get(f"{path}/{job.id}").status_code == 403


def test_adapters_are_deterministic_and_no_network(monkeypatch):
    import socket

    monkeypatch.setattr(
        socket.socket,
        "connect",
        lambda *args: (_ for _ in ()).throw(AssertionError("network")),
    )
    assert SimulatedAdapter().deliver(str(uuid4())).success
    assert not SimulatedAdapter(succeed=False).deliver(str(UUID(int=1))).success
