"""Phase 10 tests: reviews, support tickets, customers, audit, and overview."""

import json
from datetime import date, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models import OperationsAuditEvent, UserAuditEvent
from tests.test_homepassport import (
    _complete_booking_flow,
    _create_user,
    _seed_catalog,
    _set_actor,
)


def _create_review_payload(**overrides) -> dict:
    payload = {
        "rating": 5,
        "service_quality": 5,
        "professionalism": 5,
        "timeliness": 4,
        "communication": 5,
        "feedback": "Excellent repair. The technician arrived on time and explained the work.",
    }
    payload.update(overrides)
    return payload


def _setup_completed_booking(passport_api, customer_name: str = "Owner"):
    client, identity_holder, session = passport_api
    service = _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name=customer_name)
    booking_id = _complete_booking_flow(
        client,
        session,
        identity_holder,
        customer=customer,
        service=service,
        appliance_id=None,
    )
    admin = _create_user(session, ("admin",), display_name="Admin Second")
    _set_actor(identity_holder, customer)
    return {
        "client": client,
        "identity_holder": identity_holder,
        "session": session,
        "customer": customer,
        "admin": admin,
        "booking_id": booking_id,
        "service": service,
    }


# ---------------------------------------------------------------------------
# Review eligibility and creation
# ---------------------------------------------------------------------------


def test_review_requires_completed_booking(passport_api) -> None:
    client, identity_holder, session = passport_api
    _seed_catalog(session)
    customer = _create_user(session, ("customer",), display_name="Owner")
    _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, customer)

    booking_payload = {
        "service_slug": "ac-repair",
        "problem_description": "The air conditioner is not cooling the living room.",
        "preferred_date": (date.today() + timedelta(days=7)).isoformat(),
        "preferred_start": "09:00:00",
        "preferred_end": "12:00:00",
        "timezone_name": "Asia/Kolkata",
        "new_address": {
            "label": "Home",
            "recipient_name": "Customer Example",
            "address_line1": "12 Sample Road",
            "locality": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
        },
    }
    created = client.post(
        "/api/v1/customer/bookings",
        json=booking_payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    booking_id = created.json()["id"]
    review = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert review.status_code == 422
    assert review.json()["detail"]["code"] == "booking_not_completed"


def test_review_happy_path_and_aggregates(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client, _identity_holder, _session = setup["client"], setup["identity_holder"], setup["session"]
    booking_id = setup["booking_id"]

    eligible = client.get("/api/v1/customer/reviews/eligible-bookings")
    assert eligible.status_code == 200
    assert [item["booking_id"] for item in eligible.json()["items"]] == [booking_id]

    created = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(rating=4),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["rating"] == 4
    assert body["status"] == "published"
    assert body["edited"] is False
    assert body["customer_label"].startswith("Owner")

    eligible = client.get("/api/v1/customer/reviews/eligible-bookings")
    assert eligible.json()["items"] == []

    mine = client.get("/api/v1/customer/reviews")
    assert mine.json()["total"] == 1


def test_review_aggregates_for_technician(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client, identity_holder, session = setup["client"], setup["identity_holder"], setup["session"]
    booking_id = setup["booking_id"]
    from app.models import Booking

    booking = session.get(Booking, UUID(booking_id))
    technician_id = booking.assigned_technician_user_id

    created = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(rating=4),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201

    from app.models import AppUser

    technician = session.get(AppUser, technician_id)
    _set_actor(identity_holder, technician)
    summary = client.get("/api/v1/technician/reviews/summary")
    assert summary.status_code == 200
    assert summary.json() == {"published_review_count": 1, "average_rating": 4.0}

    received = client.get("/api/v1/technician/reviews")
    assert received.status_code == 200
    assert received.json()["total"] == 1
    assert received.json()["items"][0]["customer_label"].startswith("Owner")


def test_duplicate_review_rejected_and_idempotent_replay(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    booking_id = setup["booking_id"]

    key = uuid4()
    first = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(key)},
    )
    assert first.status_code == 201
    replay = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(key)},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]

    second = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(rating=1),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "review_already_exists"


def test_review_validation_bounds(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    booking_id = setup["booking_id"]

    for rating in (0, 6):
        response = client.post(
            f"/api/v1/customer/reviews/bookings/{booking_id}",
            json=_create_review_payload(rating=rating),
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 422

    response = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(feedback="Too short"),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 422


def test_review_edit_rules(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    session = setup["session"]
    booking_id = setup["booking_id"]

    created = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(uuid4())},
    ).json()
    review_id = created["id"]

    edited = client.patch(
        f"/api/v1/customer/reviews/{review_id}",
        json={"feedback": "Updated experience after a follow-up visit to the home."},
    )
    assert edited.status_code == 200
    assert edited.json()["edited"] is True

    other = _create_user(session, ("customer",), display_name="Other Person")
    _set_actor(identity_holder, other)
    forbidden = client.patch(
        f"/api/v1/customer/reviews/{review_id}",
        json={"rating": 1},
    )
    assert forbidden.status_code == 404


def test_admin_hide_and_restore_review_preserves_content(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    session = setup["session"]
    booking_id = setup["booking_id"]
    admin = setup["admin"]

    created = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(uuid4())},
    ).json()
    review_id = created["id"]

    _set_actor(identity_holder, admin)
    short_reason = client.post(
        f"/api/v1/admin/reviews/{review_id}/hide",
        json={"reason": "spam"},
    )
    assert short_reason.status_code == 422

    hidden = client.post(
        f"/api/v1/admin/reviews/{review_id}/hide",
        json={"reason": "Contains personal contact details of the homeowner."},
    )
    assert hidden.status_code == 200
    assert hidden.json()["status"] == "hidden"
    assert hidden.json()["hidden_reason"].startswith("Contains")

    # Hidden reviews are excluded from technician-facing reads.
    from app.models import AppUser, Booking

    technician_id = session.get(Booking, UUID(booking_id)).assigned_technician_user_id
    _set_actor(identity_holder, session.get(AppUser, technician_id))
    summary = client.get("/api/v1/technician/reviews/summary").json()
    assert summary["published_review_count"] == 0
    assert summary["average_rating"] is None

    _set_actor(identity_holder, admin)
    restored = client.post(
        f"/api/v1/admin/reviews/{review_id}/restore",
        json={"reason": "Customer edited personal details out of the review."},
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "published"

    events = list(
        session.scalars(
            select(OperationsAuditEvent).where(OperationsAuditEvent.entity_id == UUID(review_id))
        ).all()
    )
    actions = {event.action for event in events}
    assert "review.hidden" in actions
    assert "review.restored" in actions
    # Original customer content is preserved on the review itself.
    assert hidden.json()["feedback"] == restored.json()["feedback"]


def test_admin_review_endpoints_require_admin(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    assert client.get("/api/v1/admin/reviews").status_code == 403
    assert client.get("/api/v1/admin/reviews/reports").status_code == 403
    assert client.post(
        f"/api/v1/admin/reviews/{uuid4()}/hide", json={"reason": "Inappropriate content reported by customer."}
    ).status_code == 403


def test_review_report_flow(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    session = setup["session"]
    booking_id = setup["booking_id"]
    admin = setup["admin"]

    created = client.post(
        f"/api/v1/customer/reviews/bookings/{booking_id}",
        json=_create_review_payload(),
        headers={"Idempotency-Key": str(uuid4())},
    ).json()
    review_id = created["id"]

    reporter = _create_user(session, ("customer",), display_name="Reporter Person")
    _set_actor(identity_holder, reporter)
    reported = client.post(
        f"/api/v1/customer/reviews/{review_id}/report",
        json={"reason": "abuse", "note": "Abusive language in the written feedback."},
    )
    assert reported.status_code == 201

    duplicate = client.post(
        f"/api/v1/customer/reviews/{review_id}/report",
        json={"reason": "spam"},
    )
    assert duplicate.status_code == 409

    _set_actor(identity_holder, admin)
    reports = client.get("/api/v1/admin/reviews/reports?status=open")
    assert reports.status_code == 200
    assert reports.json()["total"] == 1

    report_id = reports.json()["items"][0]["id"]
    resolved = client.post(
        f"/api/v1/admin/reviews/reports/{report_id}/resolve",
        json={"status": "reviewed"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "reviewed"


# ---------------------------------------------------------------------------
# Support tickets
# ---------------------------------------------------------------------------


def _create_ticket(client, **overrides) -> dict:
    payload = {
        "category": "booking_issue",
        "description": "The technician arrived two hours late and did not call to warn me.",
    }
    payload.update(overrides)
    response = client.post(
        "/api/v1/customer/support/tickets",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_support_ticket_create_and_ownership(passport_api) -> None:
    client, identity_holder, session = passport_api
    owner = _create_user(session, ("customer",), display_name="Owner")
    other = _create_user(session, ("customer",), display_name="Other")
    _set_actor(identity_holder, owner)

    ticket = _create_ticket(client, subject="Late technician")
    assert ticket["status"] == "open"
    assert ticket["subject"] == "Late technician"
    assert ticket["priority"] == "normal"
    assert "internal_notes" not in ticket

    listed = client.get("/api/v1/customer/support/tickets")
    assert listed.json()["total"] == 1

    _set_actor(identity_holder, other)
    hidden = client.get(f"/api/v1/customer/support/tickets/{ticket['id']}")
    assert hidden.status_code == 404
    listed = client.get("/api/v1/customer/support/tickets")
    assert listed.json()["total"] == 0


def test_support_ticket_booking_link_requires_ownership(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    session = setup["session"]
    identity_holder = setup["identity_holder"]

    _set_actor(identity_holder, _create_user(session, ("customer",), display_name="Stranger"))
    created = client.post(
        "/api/v1/customer/support/tickets",
        json={
            "category": "booking_issue",
            "description": "Linking somebody else's booking to this ticket should fail.",
            "booking_id": setup["booking_id"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 422
    assert created.json()["detail"]["code"] == "invalid_booking"


def test_support_ticket_full_staff_flow_with_privacy(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    setup["session"]
    customer = setup["customer"]
    admin = setup["admin"]

    _set_actor(identity_holder, customer)
    ticket = _create_ticket(client, category="repair_quality")
    ticket_id = ticket["id"]

    _set_actor(identity_holder, admin)
    queue = client.get("/api/v1/admin/support/tickets?status=open")
    assert queue.status_code == 200
    assert queue.json()["total"] == 1

    assigned = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/assign",
        json={"assignee_user_id": str(admin.id)},
    )
    assert assigned.status_code == 200
    assert assigned.json()["status"] == "assigned"
    assert assigned.json()["assigned_to"] == str(admin.id)

    staff_reply = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/messages",
        json={"body": "Apologies for the experience. A senior technician will review it today."},
    )
    assert staff_reply.status_code == 200
    assert staff_reply.json()["status"] == "in_progress"

    note = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/internal-notes",
        json={"body": "Do not refund yet; quality check scheduled for tomorrow."},
    )
    assert note.status_code == 201

    detail = client.get(f"/api/v1/admin/support/tickets/{ticket_id}")
    assert detail.status_code == 200
    note_bodies = [item["body"] for item in detail.json()["internal_notes"]]
    assert note_bodies == ["Do not refund yet; quality check scheduled for tomorrow."]

    escalated = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/escalate",
        json={"reason": "Repeated repair quality failure on a safety-critical appliance."},
    )
    assert escalated.status_code == 200
    assert escalated.json()["escalation_status"] == "escalated"
    assert escalated.json()["priority"] == "urgent"

    repeated = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/escalate",
        json={"reason": "Still broken after the follow-up visit today."},
    )
    assert repeated.status_code == 409

    resolved = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/status",
        json={"status": "resolved"},
    )
    assert resolved.status_code == 200

    closed = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/status",
        json={"status": "closed"},
    )
    assert closed.status_code == 200
    closed_again = client.post(
        f"/api/v1/admin/support/tickets/{ticket_id}/status",
        json={"status": "in_progress"},
    )
    assert closed_again.status_code == 422

    _set_actor(identity_holder, customer)
    customer_view = client.get(f"/api/v1/customer/support/tickets/{ticket_id}")
    assert customer_view.status_code == 200
    customer_text = json.dumps(customer_view.json())
    assert "Do not refund yet" not in customer_text
    assert "internal_notes" not in customer_view.json()
    messages = customer_view.json()["messages"]
    assert [m["author_kind"] for m in messages] == ["staff"]


def test_support_ticket_state_machine_and_waiting_flow(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, customer)
    ticket = _create_ticket(client)

    _set_actor(identity_holder, admin)
    invalid = client.post(
        f"/api/v1/admin/support/tickets/{ticket['id']}/status",
        json={"status": "closed"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "invalid_ticket_transition"

    waiting = client.post(
        f"/api/v1/admin/support/tickets/{ticket['id']}/status",
        json={"status": "in_progress"},
    )
    assert waiting.status_code == 200
    waiting = client.post(
        f"/api/v1/admin/support/tickets/{ticket['id']}/status",
        json={"status": "waiting_for_customer"},
    )
    assert waiting.status_code == 200

    _set_actor(identity_holder, customer)
    replied = client.post(
        f"/api/v1/customer/support/tickets/{ticket['id']}/messages",
        json={"body": "The technician came yesterday and the unit is cooling normally now."},
    )
    assert replied.status_code == 200
    assert replied.json()["status"] == "in_progress"


def test_support_ticket_closed_rejects_customer_reply(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, customer)
    ticket = _create_ticket(client)
    _set_actor(identity_holder, admin)
    for target in ("in_progress", "resolved", "closed"):
        response = client.post(
            f"/api/v1/admin/support/tickets/{ticket['id']}/status",
            json={"status": target},
        )
        assert response.status_code == 200, response.text
    _set_actor(identity_holder, customer)
    reply = client.post(
        f"/api/v1/customer/support/tickets/{ticket['id']}/messages",
        json={"body": "One more question about the repair yesterday."},
    )
    assert reply.status_code == 409
    assert reply.json()["detail"]["code"] == "ticket_closed"


def test_support_assignee_must_be_active_admin(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Admin")
    technician = _create_user(session, ("technician",), display_name="Tech")
    _set_actor(identity_holder, customer)
    ticket = _create_ticket(client)
    _set_actor(identity_holder, admin)
    for bad_assignee in (customer.id, technician.id):
        response = client.post(
            f"/api/v1/admin/support/tickets/{ticket['id']}/assign",
            json={"assignee_user_id": str(bad_assignee)},
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_assignee"


def test_support_admin_endpoints_require_admin(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    assert client.get("/api/v1/admin/support/tickets").status_code == 403
    assert client.post(
        f"/api/v1/admin/support/tickets/{uuid4()}/assign",
        json={"assignee_user_id": str(uuid4())},
    ).status_code == 403


def test_ticket_events_and_operations_audit(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, customer)
    ticket = _create_ticket(client)
    _set_actor(identity_holder, admin)
    client.post(
        f"/api/v1/admin/support/tickets/{ticket['id']}/assign",
        json={"assignee_user_id": str(admin.id)},
    )
    from app.models import SupportTicketEvent

    events = list(
        session.scalars(
            select(SupportTicketEvent).where(
                SupportTicketEvent.ticket_id == UUID(ticket["id"])
            )
        ).all()
    )
    event_types = [event.event_type for event in events]
    assert "ticket.created" in event_types
    assert "ticket.assigned" in event_types

    audit = list(
        session.scalars(
            select(OperationsAuditEvent).where(
                OperationsAuditEvent.entity_id == UUID(ticket["id"])
            )
        ).all()
    )
    assert any(event.action == "ticket.assigned" for event in audit)


# ---------------------------------------------------------------------------
# Admin customers and suspension enforcement
# ---------------------------------------------------------------------------


def test_admin_customer_list_detail_and_suspension(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Search Target")
    admin = _create_user(session, ("admin",), display_name="Admin")
    _set_actor(identity_holder, admin)

    listing = client.get("/api/v1/admin/customers?search=Search%20Target")
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1
    assert any(item["user_id"] == str(customer.id) for item in listing.json()["items"])

    detail = client.get(f"/api/v1/admin/customers/{customer.id}")
    assert detail.status_code == 200
    assert detail.json()["display_name"] == "Search Target"
    assert detail.json()["open_warranty_claims"] == 0

    short_reason = client.post(
        f"/api/v1/admin/customers/{customer.id}/suspend",
        json={"reason": "fraud"},
    )
    assert short_reason.status_code == 422

    suspended = client.post(
        f"/api/v1/admin/customers/{customer.id}/suspend",
        json={"reason": "Repeated payment chargebacks on completed jobs."},
    )
    assert suspended.status_code == 200
    assert suspended.json()["account_status"] == "suspended"

    events = list(
        session.scalars(
            select(UserAuditEvent).where(UserAuditEvent.subject_user_id == customer.id)
        ).all()
    )
    assert any(event.reason == "Repeated payment chargebacks on completed jobs." for event in events)

    # A suspended account can no longer use customer APIs.
    _set_actor(identity_holder, customer)
    denied = client.get("/api/v1/customer/support/tickets")
    assert denied.status_code == 403

    _set_actor(identity_holder, admin)
    reactivated = client.post(
        f"/api/v1/admin/customers/{customer.id}/reactivate",
        json={"reason": "Chargeback resolved and payment received from the customer."},
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["account_status"] == "active"

    _set_actor(identity_holder, customer)
    restored = client.get("/api/v1/customer/support/tickets")
    assert restored.status_code == 200


def test_suspended_technician_is_not_assignable(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    session = setup["session"]
    admin = setup["admin"]

    from app.models import AppUser, Booking

    technician_id = session.get(Booking, UUID(setup["booking_id"])).assigned_technician_user_id
    technician = session.get(AppUser, technician_id)

    _set_actor(identity_holder, admin)
    suspended = client.post(
        f"/api/v1/admin/technicians/{technician.id}/suspend",
        json={"reason": "Verification documents failed the fraud review."},
    )
    assert suspended.status_code == 200

    # A fresh booking for the same service cannot be assigned to the suspended technician.
    setup["service"]
    customer = _create_user(session, ("customer",), display_name="Second Customer")
    _set_actor(identity_holder, customer)
    booking_payload = {
        "service_slug": "ac-repair",
        "problem_description": "Completely different unit in the bedroom stopped cooling.",
        "preferred_date": (date.today() + timedelta(days=9)).isoformat(),
        "preferred_start": "08:00:00",
        "preferred_end": "11:00:00",
        "timezone_name": "Asia/Kolkata",
        "new_address": {
            "label": "Home",
            "recipient_name": "Customer Two",
            "address_line1": "44 Example Lane",
            "locality": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411038",
        },
    }
    created = client.post(
        "/api/v1/customer/bookings",
        json=booking_payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    booking_id = created.json()["id"]

    _set_actor(identity_holder, admin)
    assignment = client.post(
        f"/api/v1/admin/bookings/{booking_id}/assign",
        json={"technician_user_id": str(technician.id)},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert assignment.status_code != 200
    # Historical assignment on the completed booking is preserved.
    assert session.get(Booking, UUID(setup["booking_id"])).assigned_technician_user_id == technician.id

    reactivated = client.post(
        f"/api/v1/admin/technicians/{technician.id}/reactivate",
        json={"reason": "Documents re-verified by the fraud team."},
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["account_status"] == "active"


def test_admin_customers_endpoints_require_admin(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    assert client.get("/api/v1/admin/customers").status_code == 403
    assert client.get(f"/api/v1/admin/customers/{customer.id}").status_code == 403


# ---------------------------------------------------------------------------
# Admin overview and audit
# ---------------------------------------------------------------------------


def test_admin_overview_metrics_and_charts(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    admin = setup["admin"]
    customer = setup["customer"]

    _set_actor(identity_holder, customer)
    _create_ticket(client, category="other")

    _set_actor(identity_holder, admin)
    overview = client.get("/api/v1/admin/overview?days=30")
    assert overview.status_code == 200
    body = overview.json()
    metrics = body["metrics"]
    assert metrics["total_bookings"] == 1
    assert metrics["completed_bookings"] == 1
    assert metrics["open_support_tickets"] == 1
    assert metrics["total_customers"] >= 1
    assert metrics["total_technicians"] >= 1
    assert metrics["pending_quotations"] == 0
    assert metrics["approved_quotations"] == 1
    assert metrics["review_count"] == 0
    assert metrics["average_rating"] is None
    assert len(body["booking_trend"]) == 30
    assert sum(point["count"] for point in body["booking_trend"]) >= 1
    assert len(body["status_distribution"]) == 10
    assert all(point["count"] == 0 for point in body["status_distribution"] if point["status"] == "requested")
    assert body["category_popularity"][0]["service_slug"] == "ac-repair"
    assert body["technician_performance"][0]["completed_bookings"] == 1
    assert isinstance(body["recent_activity"], list)


def test_admin_audit_lists_events_and_filters(passport_api) -> None:
    setup = _setup_completed_booking(passport_api)
    client = setup["client"]
    identity_holder = setup["identity_holder"]
    admin = setup["admin"]
    customer = setup["customer"]

    _set_actor(identity_holder, customer)
    _create_ticket(client)
    _set_actor(identity_holder, admin)

    audit = client.get("/api/v1/admin/audit")
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1

    filtered = client.get("/api/v1/admin/audit?entity_type=support_ticket")
    assert filtered.status_code == 200
    assert all(item["entity_type"] == "support_ticket" for item in filtered.json()["items"])

    paged = client.get("/api/v1/admin/audit?limit=1&offset=0")
    assert paged.status_code == 200
    assert len(paged.json()["items"]) == 1
    assert paged.json()["total"] >= 1

    bad_range = client.get("/api/v1/admin/audit?date_from=2026-12-01&date_to=2026-11-01")
    assert bad_range.status_code == 422


def test_admin_audit_requires_admin(passport_api) -> None:
    client, identity_holder, session = passport_api
    customer = _create_user(session, ("customer",), display_name="Owner")
    _set_actor(identity_holder, customer)
    assert client.get("/api/v1/admin/audit").status_code == 403
