"""Customer support and admin support desk APIs."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role, require_customer_role
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import AppUser, SupportTicket
from app.schemas.operations import (
    AdminTicketDetailResponse,
    AdminTicketInternalNoteResponse,
    AdminTicketListResponse,
    TicketAssignRequest,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketEscalateRequest,
    TicketListResponse,
    TicketMessageCreateRequest,
    TicketStatusUpdateRequest,
)


class TicketAssigneeResponse(BaseModel):
    user_id: UUID
    label: str


class TicketAssigneeListResponse(BaseModel):
    items: list[TicketAssigneeResponse]
from app.services import support as service
from app.services.booking_management import execute_idempotent

customer_router = APIRouter(prefix='/customer/support', tags=['customer support'])
admin_router = APIRouter(prefix='/admin/support', tags=['admin support'])

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CustomerActor = Annotated[AppUser, Depends(require_customer_role)]
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
IdempotencyKey = Annotated[UUID, Header(alias='Idempotency-Key')]


@customer_router.post(
    '/tickets',
    response_model=TicketDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_ticket(
    request: TicketCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
    _rate_limit: Annotated[None, Depends(rate_limit('ticket_create'))] = None,
):
    ticket_id = execute_idempotent(
        session,
        actor=actor,
        operation='support.ticket.create',
        key=idempotency_key,
        payload=request.model_dump(mode='json'),
        resource_type='support_ticket',
        mutation=lambda: service.create_ticket(
            session,
            actor,
            category=request.category,
            subject=request.subject,
            description=request.description,
            booking_id=request.booking_id,
            technician_user_id=request.technician_user_id,
            warranty_claim_id=request.warranty_claim_id,
        ).id,
    )
    ticket = session.get(SupportTicket, ticket_id)
    return TicketDetailResponse.model_validate(service.ticket_customer_payload(session, ticket))


@customer_router.get('/tickets', response_model=TicketListResponse)
def list_my_tickets(actor: CustomerActor, session: DatabaseSession):
    return TicketListResponse.model_validate(service.list_my_tickets(session, actor))


@customer_router.get('/tickets/{ticket_id}', response_model=TicketDetailResponse)
def get_my_ticket(
    ticket_id: UUID,
    actor: CustomerActor,
    session: DatabaseSession,
):
    return TicketDetailResponse.model_validate(service.get_my_ticket(session, actor, ticket_id))


@customer_router.post('/tickets/{ticket_id}/messages', response_model=TicketDetailResponse)
def add_customer_message(
    ticket_id: UUID,
    request: TicketMessageCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    _rate_limit: Annotated[None, Depends(rate_limit('ticket_reply'))] = None,
):
    payload = service.add_customer_message(session, actor, ticket_id=ticket_id, body=request.body)
    session.commit()
    return TicketDetailResponse.model_validate(payload)


@admin_router.get('/assignees', response_model=TicketAssigneeListResponse)
def list_assignees(_actor: AdminActor, session: DatabaseSession):
    """Active administrators available for ticket assignment."""

    return TicketAssigneeListResponse.model_validate(
        {'items': service.list_active_admin_assignees(session)}
    )


@admin_router.get('/tickets', response_model=AdminTicketListResponse)
def list_tickets(
    _actor: AdminActor,
    session: DatabaseSession,
    status_filter: Annotated[
        Literal['open', 'assigned', 'in_progress', 'waiting_for_customer', 'resolved', 'closed']
        | None,
        Query(alias='status'),
    ] = None,
    priority: Annotated[Literal['normal', 'high', 'urgent'] | None, Query()] = None,
    escalated: Annotated[bool, Query()] = False,
    search: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
    _rate_limit: Annotated[None, Depends(rate_limit('admin_search'))] = None,
):
    return AdminTicketListResponse.model_validate(
        service.list_staff_queue(
            session,
            status_filter=status_filter,
            priority=priority,
            escalated_only=escalated,
            search=search,
            limit=limit,
            offset=offset,
        )
    )


@admin_router.get('/tickets/{ticket_id}', response_model=AdminTicketDetailResponse)
def get_ticket(ticket_id: UUID, _actor: AdminActor, session: DatabaseSession):
    return AdminTicketDetailResponse.model_validate(service.get_staff_ticket(session, ticket_id))


@admin_router.post('/tickets/{ticket_id}/assign', response_model=AdminTicketDetailResponse)
def assign_ticket(
    ticket_id: UUID,
    request: TicketAssignRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    payload = service.assign_ticket(
        session,
        actor,
        ticket_id=ticket_id,
        assignee_user_id=request.assignee_user_id,
    )
    session.commit()
    return AdminTicketDetailResponse.model_validate(payload)


@admin_router.post('/tickets/{ticket_id}/messages', response_model=AdminTicketDetailResponse)
def add_staff_message(
    ticket_id: UUID,
    request: TicketMessageCreateRequest,
    actor: AdminActor,
    session: DatabaseSession,
    _rate_limit: Annotated[None, Depends(rate_limit('ticket_reply'))] = None,
):
    payload = service.add_staff_message(session, actor, ticket_id=ticket_id, body=request.body)
    session.commit()
    return AdminTicketDetailResponse.model_validate(payload)


@admin_router.post(
    '/tickets/{ticket_id}/internal-notes',
    response_model=AdminTicketInternalNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_internal_note(
    ticket_id: UUID,
    request: TicketMessageCreateRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    payload = service.add_internal_note(session, actor, ticket_id=ticket_id, body=request.body)
    session.commit()
    notes = payload['internal_notes']
    latest = notes[-1]
    return AdminTicketInternalNoteResponse.model_validate(latest)


@admin_router.post('/tickets/{ticket_id}/status', response_model=AdminTicketDetailResponse)
def change_status(
    ticket_id: UUID,
    request: TicketStatusUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    payload = service.update_ticket_status(
        session, actor, ticket_id=ticket_id, new_status=request.status
    )
    session.commit()
    return AdminTicketDetailResponse.model_validate(payload)


@admin_router.post('/tickets/{ticket_id}/escalate', response_model=AdminTicketDetailResponse)
def escalate_ticket(
    ticket_id: UUID,
    request: TicketEscalateRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    payload = service.escalate_ticket(session, actor, ticket_id=ticket_id, reason=request.reason)
    session.commit()
    return AdminTicketDetailResponse.model_validate(payload)
