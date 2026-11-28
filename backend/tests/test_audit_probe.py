"""Release-audit probe tests: authorization boundaries, validation, and leakage.

These tests were written for the final release-readiness audit. They attack the
API the way a hostile authenticated caller would and assert the fixed, intended
business rules hold. Nothing here changes intended behavior.
"""

from uuid import uuid4

from tests.test_homepassport import (
    _complete_booking_flow,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def _make_users(session):
    customer_a = _create_user(session, ("customer",), display_name="Customer A")
    customer_b = _create_user(session, ("customer",), display_name="Customer B")
    admin = _create_user(session, ("admin",), display_name="Admin")
    return customer_a, customer_b, admin


def test_admin_endpoints_reject_customer_and_technician(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a, customer_b, _admin = _make_users(session)
    tech = _create_user(
        session, ("technician",), display_name="Tech", verification_status="approved"
    )

    admin_paths = [
        ("get", "/api/v1/admin/overview"),
        ("get", "/api/v1/admin/customers"),
        ("get", "/api/v1/admin/audit"),
        ("get", "/api/v1/admin/reviews"),
        ("get", "/api/v1/admin/reviews/reports"),
        ("get", "/api/v1/admin/support/tickets"),
        ("get", "/api/v1/admin/support/assignees"),
        ("get", "/api/v1/admin/technicians"),
        ("get", "/api/v1/admin/homepassport/claims"),
        ("get", "/api/v1/admin/users/nonexistent"),
    ]

    for actor in (customer_a, customer_b, tech):
        _set_actor(identity_holder, actor)
        for method, path in admin_paths:
            response = getattr(client, method)(path)
            assert response.status_code == 403, (actor.display_name if hasattr(actor, 'display_name') else actor.id, path, response.status_code)


def test_customer_cannot_touch_another_customers_ticket(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a, customer_b, _ = _make_users(session)

    _set_actor(identity_holder, customer_a)
    created = client.post(
        "/api/v1/customer/support/tickets",
        json={"category": "booking_issue", "description": "My booking never happened please help."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    ticket_id = created.json()["id"]

    _set_actor(identity_holder, customer_b)
    assert client.get(f"/api/v1/customer/support/tickets/{ticket_id}").status_code == 404
    assert (
        client.post(
            f"/api/v1/customer/support/tickets/{ticket_id}/messages",
            json={"body": "I should not be able to write here."},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/customer/support/tickets").json()["total"] == 0


def test_customer_cannot_modify_another_customers_review(passport_api):
    client, identity_holder, session = passport_api
    service = _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Review Owner")
    customer_b = _create_user(session, ("customer",), display_name="Intruder")

    booking_id = _complete_booking_flow(
        client, session, identity_holder, customer=customer_a, service=service, appliance_id=None
    )
    _set_actor(identity_holder, customer_a)
    review = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json={"rating": 5, "feedback": "Excellent fan replacement work overall."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert review.status_code == 201, review.text
    review_id = review.json()["id"]

    _set_actor(identity_holder, customer_b)
    assert (
        client.patch(
            f"/api/v1/customer/reviews/{review_id}",
            json={"rating": 1, "feedback": "Actually it was terrible and slow work."},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/customer/reviews").json()["total"] == 0


def test_customer_cannot_read_or_modify_another_customers_appliance(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Appliance Owner")
    customer_b = _create_user(session, ("customer",), display_name="Appliance Thief")

    _set_actor(identity_holder, customer_a)
    created = client.post(
        "/api/v1/customer/homepassport/appliances",
        json={
            "name": "Living room AC",
            "category": "air_conditioner",
            "brand": "FixtureCool",
            "model_number": "FC-2024-X",
            "serial_number": "SN-0001",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    appliance_id = created.json()["id"]

    _set_actor(identity_holder, customer_b)
    assert client.get(f"/api/v1/customer/homepassport/appliances/{appliance_id}").status_code == 404
    assert (
        client.patch(
            f"/api/v1/customer/homepassport/appliances/{appliance_id}",
            json={"name": "Stolen AC"},
        ).status_code
        == 404
    )


def test_suspended_account_loses_api_access(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a, _, _ = _make_users(session)

    _set_actor(identity_holder, customer_a)
    assert client.get("/api/v1/customer/support/tickets").status_code == 200

    customer_a.status = "suspended"
    session.commit()
    assert client.get("/api/v1/customer/support/tickets").status_code == 403
    assert client.get("/api/v1/customer/bookings").status_code == 403
    assert client.get("/api/v1/customer/homepassport/appliances").status_code == 403


def test_admin_list_pagination_limits_are_enforced(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    _, _, admin = _make_users(session)

    _set_actor(identity_holder, admin)
    assert client.get("/api/v1/admin/customers?limit=101").status_code == 422
    assert client.get("/api/v1/admin/customers?limit=0").status_code == 422
    assert client.get("/api/v1/admin/customers?offset=-1").status_code == 422
    assert client.get("/api/v1/admin/audit?limit=101").status_code == 422
    assert client.get("/api/v1/admin/overview?days=6").status_code == 422
    assert client.get("/api/v1/admin/overview?days=91").status_code == 422
    assert client.get("/api/v1/admin/overview?days=30").status_code == 200


def test_review_creation_rejects_invalid_rating_and_feedback(passport_api):
    client, identity_holder, session = passport_api
    service = _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Rating Checker")

    booking_id = _complete_booking_flow(
        client, session, identity_holder, customer=customer_a, service=service, appliance_id=None
    )
    _set_actor(identity_holder, customer_a)
    for payload in (
        {"rating": 0, "feedback": "This rating is outside the allowed range."},
        {"rating": 6, "feedback": "This rating is outside the allowed range."},
        {"rating": 5, "feedback": "Too short"},
    ):
        response = client.post(
            f"/api/v1/customer/reviews/bookings/{booking_id}",
            json=payload,
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 422, payload


def test_duplicate_review_for_booking_is_rejected(passport_api):
    client, identity_holder, session = passport_api
    service = _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Duplicate Checker")

    booking_id = _complete_booking_flow(
        client, session, identity_holder, customer=customer_a, service=service, appliance_id=None
    )
    _set_actor(identity_holder, customer_a)
    body = {"rating": 4, "feedback": "Solid work, arrived on time and fixed it."}
    first = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=body,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json={"rating": 2, "feedback": "Trying to review the same job a second time."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert second.status_code in (409, 422), second.status_code


def test_customer_cannot_see_internal_notes_and_technician_cannot_moderate(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Note Observer")
    admin = _create_user(session, ("admin",), display_name="Note Writer")

    _set_actor(identity_holder, customer_a)
    created = client.post(
        "/api/v1/customer/support/tickets",
        json={"category": "payment_query", "description": "I was charged the wrong inspection amount."},
        headers={"Idempotency-Key": str(uuid4())},
    )
    ticket_id = created.json()["id"]

    _set_actor(identity_holder, admin)
    note = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/internal-notes",
        json={"body": "Customer is disputing the inspection line item; verify with technician first."},
    )
    assert note.status_code in (200, 201), note.text

    _set_actor(identity_holder, customer_a)
    view = client.get(f"/api/v1/customer/support/tickets/{ticket_id}")
    assert view.status_code == 200
    body = view.text
    assert "internal_notes" not in body
    assert "verify with technician first" not in body


def test_admin_suspension_requires_reason_and_audits(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer_a = _create_user(session, ("customer",), display_name="Suspend Target")
    _, _, admin = _make_users(session)

    _set_actor(identity_holder, admin)
    short = client.post(
        f"/api/v1/admin/customers/{customer_a.id}/suspend",
        json={"reason": "short"},
    )
    assert short.status_code == 422

    ok = client.post(
        f"/api/v1/admin/customers/{customer_a.id}/suspend",
        json={"reason": "Chargeback abuse confirmed across three separate incidents."},
    )
    assert ok.status_code == 200, ok.text

    audit = client.get("/api/v1/admin/audit?action=status.changed")
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1


def test_admin_cannot_suspend_themselves(passport_api):
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    _, _, admin = _make_users(session)

    second_admin = _create_user(session, ("admin",), display_name="Second Admin")
    _set_actor(identity_holder, admin)
    # the customer-management endpoint does not target admin accounts (404 by design)
    response = client.post(
        f"/api/v1/admin/customers/{admin.id}/suspend",
        json={"reason": "This should never be allowed by the service layer."},
    )
    assert response.status_code in (400, 403, 404, 422)
    # with a second active admin present the self-suspend guard fires with cannot_suspend_self
    generic = client.patch(
        f"/api/v1/admin/users/{admin.id}/status",
        json={"status": "suspended", "reason": "Security review requires suspension"},
    )
    assert generic.status_code == 409
    assert generic.json()["detail"]["code"] in ("cannot_suspend_self", "last_active_admin")
    # and the second admin is still able to suspend the first
    _set_actor(identity_holder, second_admin)
    other = client.patch(
        f"/api/v1/admin/users/{admin.id}/status",
        json={"status": "suspended", "reason": "Security review requires suspension"},
    )
    assert other.status_code == 200, other.text
