"""Support tickets: customer threads, staff triage, internal notes, and audit."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    Booking,
    CustomerProfile,
    SupportInternalNote,
    SupportMessage,
    SupportTicket,
    SupportTicketEvent,
    UserRole,
    WarrantyClaim,
)
from app.services.operations_audit import record_operations_audit

_OPEN_STATUSES = {"open", "assigned", "in_progress", "waiting_for_customer"}
_TERMINAL_STATUSES = {"closed"}

_ALLOWED_STAFF_TRANSITIONS: dict[str, set[str]] = {
    "open": {"assigned", "in_progress", "resolved"},
    "assigned": {"in_progress", "waiting_for_customer", "resolved"},
    "in_progress": {"waiting_for_customer", "resolved"},
    "waiting_for_customer": {"in_progress", "resolved"},
    "resolved": {"closed", "in_progress"},
    "closed": set(),
}

_CATEGORY_SUBJECTS = {
    "booking_issue": "Booking issue",
    "technician_issue": "Technician issue",
    "payment_query": "Payment query",
    "warranty_claim": "Warranty claim support",
    "repair_quality": "Repair quality concern",
    "refund_request": "Refund request",
    "account_issue": "Account issue",
    "other": "Support request",
}


def _error(code: str, message: str, status_code: int = status.HTTP_409_CONFLICT) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _not_found() -> HTTPException:
    return _error("ticket_not_found", "Ticket not found.", status.HTTP_404_NOT_FOUND)


def _record_event(
    session: Session,
    ticket: SupportTicket,
    *,
    actor: AppUser | None,
    event_type: str,
    from_status: str | None = None,
    to_status: str | None = None,
) -> SupportTicketEvent:
    event = SupportTicketEvent(
        ticket_id=ticket.id,
        actor_user_id=actor.id if actor else None,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
    )
    session.add(event)
    return event


def _set_status(
    session: Session,
    ticket: SupportTicket,
    *,
    actor: AppUser,
    new_status: str,
) -> None:
    previous = ticket.status
    ticket.status = new_status
    if new_status == "resolved":
        ticket.resolved_at = datetime.now(UTC)
    elif previous == "resolved":
        ticket.resolved_at = None
    if new_status == "closed":
        ticket.closed_at = datetime.now(UTC)
    _record_event(
        session,
        ticket,
        actor=actor,
        event_type="ticket.status_changed",
        from_status=previous,
        to_status=new_status,
    )


def _message_payload(message: SupportMessage) -> dict[str, object]:
    return {
        "id": message.id,
        "author_kind": message.author_kind,
        "body": message.body,
        "created_at": message.created_at,
    }


def _event_payload(event: SupportTicketEvent, *, include_actor: bool) -> dict[str, object]:
    payload: dict[str, object] = {
        "event_type": event.event_type,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "created_at": event.created_at,
    }
    if include_actor:
        payload["actor_user_id"] = event.actor_user_id
    return payload


def _ticket_summary(ticket: SupportTicket) -> dict[str, object]:
    return {
        "id": ticket.id,
        "category": ticket.category,
        "subject": ticket.subject,
        "status": ticket.status,
        "priority": ticket.priority,
        "escalation_status": ticket.escalation_status,
        "booking_id": ticket.booking_id,
        "technician_user_id": ticket.technician_user_id,
        "warranty_claim_id": ticket.warranty_claim_id,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }


def _customer_payload(session: Session, ticket: SupportTicket) -> dict[str, object]:
    messages = list(
        session.scalars(
            select(SupportMessage)
            .where(SupportMessage.ticket_id == ticket.id)
            .order_by(SupportMessage.created_at)
        ).all()
    )
    events = list(
        session.scalars(
            select(SupportTicketEvent)
            .where(
                SupportTicketEvent.ticket_id == ticket.id,
                SupportTicketEvent.event_type.in_(
                    ("ticket.created", "ticket.status_changed", "ticket.assigned", "ticket.escalated")
                ),
            )
            .order_by(SupportTicketEvent.created_at)
        ).all()
    )
    payload = _ticket_summary(ticket)
    payload.update(
        {
            "description": ticket.description,
            "resolved_at": ticket.resolved_at,
            "closed_at": ticket.closed_at,
            "messages": [_message_payload(message) for message in messages],
            "events": [_event_payload(event, include_actor=False) for event in events],
        }
    )
    return payload


def _staff_payload(session: Session, ticket: SupportTicket) -> dict[str, object]:
    customer_name = session.scalar(
        select(CustomerProfile.display_name).where(
            CustomerProfile.user_id == ticket.customer_user_id
        )
    )
    assigned_name = None
    if ticket.assigned_to is not None:
        assigned_name = session.scalar(
            select(CustomerProfile.display_name).where(
                CustomerProfile.user_id == ticket.assigned_to
            )
        )
        if assigned_name is None:
            assigned_name = "FixNear administrator"
    messages = list(
        session.scalars(
            select(SupportMessage)
            .where(SupportMessage.ticket_id == ticket.id)
            .order_by(SupportMessage.created_at)
        ).all()
    )
    internal_notes = list(
        session.scalars(
            select(SupportInternalNote)
            .where(SupportInternalNote.ticket_id == ticket.id)
            .order_by(SupportInternalNote.created_at)
        ).all()
    )
    events = list(
        session.scalars(
            select(SupportTicketEvent)
            .where(SupportTicketEvent.ticket_id == ticket.id)
            .order_by(SupportTicketEvent.created_at)
        ).all()
    )
    payload = _ticket_summary(ticket)
    payload.update(
        {
            "customer_user_id": ticket.customer_user_id,
            "customer_display_name": customer_name,
            "assigned_to": ticket.assigned_to,
            "assigned_to_name": assigned_name,
            "description": ticket.description,
            "resolved_at": ticket.resolved_at,
            "closed_at": ticket.closed_at,
            "assigned_at": ticket.assigned_at,
            "messages": [_message_payload(message) for message in messages],
            "internal_notes": [
                {
                    "id": note.id,
                    "author_user_id": note.author_user_id,
                    "body": note.body,
                    "created_at": note.created_at,
                }
                for note in internal_notes
            ],
            "events": [_event_payload(event, include_actor=True) for event in events],
        }
    )
    return payload


def _validate_link(
    session: Session, actor: AppUser, booking_id: UUID | None, warranty_claim_id: UUID | None
) -> None:
    if booking_id is not None:
        booking = session.scalar(
            select(Booking).where(
                Booking.id == booking_id,
                Booking.customer_user_id == actor.id,
            )
        )
        if booking is None:
            raise _error(
                "invalid_booking",
                "Select one of your own bookings.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
    if warranty_claim_id is not None:
        claim = session.scalar(
            select(WarrantyClaim).where(
                WarrantyClaim.id == warranty_claim_id,
                WarrantyClaim.customer_user_id == actor.id,
            )
        )
        if claim is None:
            raise _error(
                "invalid_claim",
                "Select one of your own warranty claims.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )


def create_ticket(
    session: Session,
    actor: AppUser,
    *,
    category: str,
    description: str,
    subject: str | None,
    booking_id: UUID | None,
    technician_user_id: UUID | None,
    warranty_claim_id: UUID | None,
) -> SupportTicket:
    _validate_link(session, actor, booking_id, warranty_claim_id)
    if technician_user_id is not None:
        technician = session.scalar(
            select(UserRole).where(
                UserRole.user_id == technician_user_id,
                UserRole.role_code == "technician",
            )
        )
        if technician is None:
            raise _error(
                "invalid_technician",
                "Select a registered FixNear technician.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
    ticket = SupportTicket(
        customer_user_id=actor.id,
        booking_id=booking_id,
        technician_user_id=technician_user_id,
        warranty_claim_id=warranty_claim_id,
        category=category,
        subject=(subject or _CATEGORY_SUBJECTS[category])[:200],
        description=description,
    )
    session.add(ticket)
    session.flush()
    _record_event(session, ticket, actor=actor, event_type="ticket.created")
    session.flush()
    return ticket


def ticket_customer_payload(session: Session, ticket: SupportTicket) -> dict[str, object]:
    return _customer_payload(session, ticket)


def list_my_tickets(session: Session, actor: AppUser) -> dict[str, object]:
    tickets = list(
        session.scalars(
            select(SupportTicket)
            .where(SupportTicket.customer_user_id == actor.id)
            .order_by(SupportTicket.created_at.desc())
        ).all()
    )
    return {"items": [_ticket_summary(ticket) for ticket in tickets], "total": len(tickets)}


def get_my_ticket(session: Session, actor: AppUser, ticket_id: UUID) -> dict[str, object]:
    ticket = session.scalar(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id,
            SupportTicket.customer_user_id == actor.id,
        )
    )
    if ticket is None:
        raise _not_found()
    return _customer_payload(session, ticket)


def add_customer_message(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    body: str,
) -> dict[str, object]:
    ticket = session.scalar(
        select(SupportTicket)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.customer_user_id == actor.id,
        )
        .with_for_update()
    )
    if ticket is None:
        raise _not_found()
    if ticket.status == "closed":
        raise _error(
            "ticket_closed",
            "This ticket is closed. Open a new ticket if you need more help.",
        )
    message = SupportMessage(
        ticket_id=ticket.id,
        author_user_id=actor.id,
        author_kind="customer",
        body=body,
    )
    session.add(message)
    previous = ticket.status
    if previous == "waiting_for_customer" or previous == "resolved":
        _set_status(session, ticket, actor=actor, new_status="in_progress")
    session.flush()
    return _customer_payload(session, ticket)


def list_staff_queue(
    session: Session,
    *,
    status_filter: str | None,
    priority: str | None,
    escalated_only: bool,
    search: str | None,
    limit: int,
    offset: int,
) -> dict[str, object]:
    statement = select(SupportTicket)
    conditions = []
    if status_filter:
        conditions.append(SupportTicket.status == status_filter)
    if priority:
        conditions.append(SupportTicket.priority == priority)
    if escalated_only:
        conditions.append(SupportTicket.escalation_status == "escalated")
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                SupportTicket.subject.ilike(pattern),
                SupportTicket.description.ilike(pattern),
            )
        )
    count_statement = select(func.count()).select_from(SupportTicket)
    for condition in conditions:
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
    total = int(session.scalar(count_statement) or 0)
    tickets = list(
        session.scalars(
            statement.order_by(SupportTicket.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    customer_ids = {ticket.customer_user_id for ticket in tickets}
    assigned_ids = {ticket.assigned_to for ticket in tickets if ticket.assigned_to}
    names = {
        user_id: name
        for user_id, name in session.execute(
            select(CustomerProfile.user_id, CustomerProfile.display_name).where(
                CustomerProfile.user_id.in_(customer_ids | assigned_ids)
            )
        ).all()
    }
    items = []
    for ticket in tickets:
        payload = _ticket_summary(ticket)
        payload.update(
            {
                "customer_user_id": ticket.customer_user_id,
                "customer_display_name": names.get(ticket.customer_user_id),
                "assigned_to": ticket.assigned_to,
                "assigned_to_name": (
                    names.get(ticket.assigned_to)
                    if ticket.assigned_to
                    else None
                )
                or ("FixNear administrator" if ticket.assigned_to else None),
            }
        )
        items.append(payload)
    return {"items": items, "total": total}


def _get_ticket_for_staff(session: Session, ticket_id: UUID) -> SupportTicket:
    ticket = session.scalar(
        select(SupportTicket).where(SupportTicket.id == ticket_id).with_for_update()
    )
    if ticket is None:
        raise _not_found()
    return ticket


def get_staff_ticket(session: Session, ticket_id: UUID) -> dict[str, object]:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise _not_found()
    return _staff_payload(session, ticket)


def assign_ticket(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    assignee_user_id: UUID,
) -> dict[str, object]:
    ticket = _get_ticket_for_staff(session, ticket_id)
    assignee = session.scalar(
        select(UserRole).where(
            UserRole.user_id == assignee_user_id,
            UserRole.role_code == "admin",
        )
    )
    assignee_user = session.get(AppUser, assignee_user_id)
    if assignee is None or assignee_user is None or assignee_user.status != "active":
        raise _error(
            "invalid_assignee",
            "Assign tickets only to an active FixNear administrator.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if ticket.assigned_to == assignee_user_id:
        raise _error("ticket_already_assigned", "This ticket is already assigned to that account.")
    ticket.assigned_to = assignee_user_id
    ticket.assigned_at = datetime.now(UTC)
    if ticket.status == "open":
        _set_status(session, ticket, actor=actor, new_status="assigned")
    _record_event(session, ticket, actor=actor, event_type="ticket.assigned")
    record_operations_audit(
        session,
        actor=actor,
        entity_type="support_ticket",
        entity_id=ticket.id,
        action="ticket.assigned",
        changed_fields=["assigned_to"],
        is_internal=True,
    )
    session.flush()
    return _staff_payload(session, ticket)


def add_staff_message(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    body: str,
) -> dict[str, object]:
    ticket = _get_ticket_for_staff(session, ticket_id)
    if ticket.status == "closed":
        raise _error("ticket_closed", "This ticket is closed.")
    message = SupportMessage(
        ticket_id=ticket.id,
        author_user_id=actor.id,
        author_kind="staff",
        body=body,
    )
    session.add(message)
    if ticket.status in ("open", "assigned"):
        _set_status(session, ticket, actor=actor, new_status="in_progress")
    session.flush()
    return _staff_payload(session, ticket)


def add_internal_note(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    body: str,
) -> dict[str, object]:
    ticket = _get_ticket_for_staff(session, ticket_id)
    note = SupportInternalNote(ticket_id=ticket.id, author_user_id=actor.id, body=body)
    session.add(note)
    record_operations_audit(
        session,
        actor=actor,
        entity_type="support_ticket",
        entity_id=ticket.id,
        action="ticket.note_added",
        is_internal=True,
    )
    session.flush()
    return _staff_payload(session, ticket)


def update_ticket_status(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    new_status: str,
) -> dict[str, object]:
    ticket = _get_ticket_for_staff(session, ticket_id)
    previous = ticket.status
    if new_status == previous:
        raise _error("status_unchanged", "The ticket already has that status.")
    allowed = _ALLOWED_STAFF_TRANSITIONS.get(previous, set())
    if new_status not in allowed:
        raise _error(
            "invalid_ticket_transition",
            f"Tickets in '{previous}' cannot move directly to '{new_status}'.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    _set_status(session, ticket, actor=actor, new_status=new_status)
    record_operations_audit(
        session,
        actor=actor,
        entity_type="support_ticket",
        entity_id=ticket.id,
        action="ticket.status_changed",
        changed_fields=["status"],
        note=f"{previous} -> {new_status}",
        is_internal=True,
    )
    session.flush()
    return _staff_payload(session, ticket)


def escalate_ticket(
    session: Session,
    actor: AppUser,
    *,
    ticket_id: UUID,
    reason: str,
) -> dict[str, object]:
    ticket = _get_ticket_for_staff(session, ticket_id)
    if ticket.escalation_status == "escalated":
        raise _error("ticket_already_escalated", "This ticket is already escalated.")
    ticket.escalation_status = "escalated"
    ticket.priority = "urgent"
    _record_event(
        session,
        ticket,
        actor=actor,
        event_type="ticket.escalated",
    )
    record_operations_audit(
        session,
        actor=actor,
        entity_type="support_ticket",
        entity_id=ticket.id,
        action="ticket.escalated",
        changed_fields=["escalation_status", "priority"],
        note=reason,
        is_internal=True,
    )
    session.flush()
    return _staff_payload(session, ticket)


def list_active_admin_assignees(session: Session) -> list[dict[str, object]]:
    """Active administrators a ticket may be assigned to; used by the admin UI."""

    rows = session.execute(
        select(AppUser.id, AppUser.email, CustomerProfile.display_name)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == AppUser.id)
        .where(UserRole.role_code == "admin", AppUser.status == "active")
        .order_by(CustomerProfile.display_name.nulls_last(), AppUser.created_at)
        .limit(100)
    ).all()
    items = []
    for user_id, email, display_name in rows:
        if display_name:
            label = display_name
        elif email:
            label = email.split("@", 1)[0]
        else:
            label = f"Administrator {str(user_id)[:8]}"
        items.append({"user_id": user_id, "label": label})
    return items


def is_open_ticket_status(ticket_status: str) -> bool:
    return ticket_status in _OPEN_STATUSES


def is_terminal_ticket_status(ticket_status: str) -> bool:
    return ticket_status in _TERMINAL_STATUSES
