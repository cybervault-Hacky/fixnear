"""Role-scoped customer, technician, and admin booking APIs."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.authorization import (
    require_admin_role,
    require_customer_role,
    require_technician_role,
)
from app.db.session import get_db_session
from app.models import AppUser, Booking, BookingVisit
from app.schemas.booking_management import (
    AttachmentUploadIntentRequest,
    AttachmentUploadIntentResponse,
    BookingAssignmentDecisionRequest,
    BookingAssignmentDecisionResponse,
    BookingAssignmentRequest,
    BookingCancelRequest,
    BookingCreateRequest,
    BookingDetailResponse,
    BookingEscalationRequest,
    BookingListResponse,
    BookingQuoteCreateRequest,
    BookingStatus,
    BookingTransitionRequest,
    BookingVisitResponse,
    BookingVisitUpdateRequest,
    CustomerAddressInput,
    CustomerAddressResponse,
    CustomerAddressUpdateRequest,
    QuoteDecisionRequest,
)
from app.services.booking_management import (
    assign_booking,
    cancel_booking,
    create_booking,
    create_booking_attachment_intent,
    create_booking_quote,
    create_customer_address,
    decide_assignment,
    decide_booking_quote,
    delete_customer_address,
    execute_idempotent,
    list_admin_bookings,
    list_customer_addresses,
    list_customer_bookings,
    list_eligible_technicians,
    list_technician_bookings,
    read_booking_detail,
    transition_technician_booking,
    update_booking_escalation,
    update_booking_visit,
    update_customer_address,
)
from app.services.booking_storage import (
    BookingAttachmentStorage,
    get_booking_attachment_storage,
)

customer_router = APIRouter(prefix='/customer', tags=['customer bookings'])
technician_router = APIRouter(prefix='/technician/bookings', tags=['technician bookings'])
admin_router = APIRouter(prefix='/admin/bookings', tags=['admin bookings'])
DatabaseSession = Annotated[Session, Depends(get_db_session)]
CustomerActor = Annotated[AppUser, Depends(require_customer_role)]
TechnicianActor = Annotated[AppUser, Depends(require_technician_role)]
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
IdempotencyKey = Annotated[UUID, Header(alias='Idempotency-Key')]


def _booking_detail_response(
    session: Session,
    *,
    actor: AppUser,
    booking_id: UUID,
    viewer: Literal['customer', 'technician', 'admin'],
) -> BookingDetailResponse:
    result = read_booking_detail(session, actor=actor, booking_id=booking_id, viewer=viewer)
    session.commit()  # Persist the sensitive-location access audit with the read response.
    return BookingDetailResponse.model_validate(result)


@customer_router.get('/addresses', response_model=list[CustomerAddressResponse])
def get_saved_addresses(
    actor: CustomerActor,
    session: DatabaseSession,
) -> list[CustomerAddressResponse]:
    addresses = list_customer_addresses(session, actor)
    session.commit()  # Persist access audits whenever saved private addresses are disclosed.
    return [CustomerAddressResponse.model_validate(item) for item in addresses]


@customer_router.post(
    '/addresses', response_model=CustomerAddressResponse, status_code=status.HTTP_201_CREATED
)
def add_saved_address(
    request: CustomerAddressInput,
    actor: CustomerActor,
    session: DatabaseSession,
) -> CustomerAddressResponse:
    address = create_customer_address(session, actor, request)
    session.commit()
    session.refresh(address)
    return CustomerAddressResponse.model_validate(address)


@customer_router.patch('/addresses/{address_id}', response_model=CustomerAddressResponse)
def edit_saved_address(
    address_id: UUID,
    request: CustomerAddressUpdateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
) -> CustomerAddressResponse:
    address = update_customer_address(session, actor, address_id, request)
    session.commit()
    session.refresh(address)
    return CustomerAddressResponse.model_validate(address)


@customer_router.delete('/addresses/{address_id}', status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_address(
    address_id: UUID,
    actor: CustomerActor,
    session: DatabaseSession,
) -> Response:
    delete_customer_address(session, actor, address_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@customer_router.get('/bookings', response_model=BookingListResponse)
def get_customer_bookings(
    actor: CustomerActor,
    session: DatabaseSession,
    booking_status: Annotated[BookingStatus | None, Query(alias='status')] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> BookingListResponse:
    return BookingListResponse.model_validate(
        list_customer_bookings(
            session,
            actor=actor,
            booking_status=booking_status,
            limit=limit,
            offset=offset,
        )
    )


@customer_router.post('/bookings', response_model=BookingDetailResponse, status_code=201)
def submit_customer_booking(
    request: BookingCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    booking_id = execute_idempotent(
        session,
        actor=actor,
        operation='customer.booking.create',
        key=idempotency_key,
        payload=request.model_dump(mode='json'),
        resource_type='booking',
        mutation=lambda: create_booking(session, actor, request),
    )
    return _booking_detail_response(session, actor=actor, booking_id=booking_id, viewer='customer')


@customer_router.get('/bookings/{booking_id}', response_model=BookingDetailResponse)
def get_customer_booking(
    booking_id: UUID,
    actor: CustomerActor,
    session: DatabaseSession,
) -> BookingDetailResponse:
    return _booking_detail_response(session, actor=actor, booking_id=booking_id, viewer='customer')


@customer_router.post('/bookings/{booking_id}/cancel', response_model=BookingDetailResponse)
def cancel_customer_booking(
    booking_id: UUID,
    request: BookingCancelRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='customer.booking.cancel',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: cancel_booking(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
            actor_kind='customer',
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='customer')


@customer_router.post(
    '/bookings/{booking_id}/quotes/{quote_id}/decision',
    response_model=BookingDetailResponse,
)
def decide_customer_quote(
    booking_id: UUID,
    quote_id: UUID,
    request: QuoteDecisionRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='customer.quote.decision',
        key=idempotency_key,
        payload={
            'booking_id': str(booking_id),
            'quote_id': str(quote_id),
            **request.model_dump(mode='json'),
        },
        resource_type='booking',
        mutation=lambda: decide_booking_quote(
            session,
            actor=actor,
            booking_id=booking_id,
            quote_id=quote_id,
            request=request,
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='customer')


@customer_router.post(
    '/bookings/{booking_id}/attachments/upload-intents',
    response_model=AttachmentUploadIntentResponse,
    status_code=status.HTTP_201_CREATED,
)
def prepare_customer_attachment_upload(
    booking_id: UUID,
    request: AttachmentUploadIntentRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    storage: Annotated[
        BookingAttachmentStorage | None,
        Depends(get_booking_attachment_storage),
    ],
) -> AttachmentUploadIntentResponse:
    result = create_booking_attachment_intent(
        session,
        actor=actor,
        booking_id=booking_id,
        original_filename=request.original_filename,
        content_type=request.content_type,
        size_bytes=request.size_bytes,
        storage=storage,
    )
    session.commit()
    return AttachmentUploadIntentResponse.model_validate(result)


@technician_router.get('', response_model=BookingListResponse)
def get_technician_bookings(
    actor: TechnicianActor,
    session: DatabaseSession,
    booking_status: Annotated[BookingStatus | None, Query(alias='status')] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> BookingListResponse:
    return BookingListResponse.model_validate(
        list_technician_bookings(
            session,
            actor=actor,
            booking_status=booking_status,
            limit=limit,
            offset=offset,
        )
    )


@technician_router.get('/{booking_id}', response_model=BookingDetailResponse)
def get_technician_booking(
    booking_id: UUID,
    actor: TechnicianActor,
    session: DatabaseSession,
) -> BookingDetailResponse:
    return _booking_detail_response(session, actor=actor, booking_id=booking_id, viewer='technician')


@technician_router.post(
    '/{booking_id}/assignment-decision', response_model=BookingAssignmentDecisionResponse
)
def respond_to_assignment(
    booking_id: UUID,
    request: BookingAssignmentDecisionRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingAssignmentDecisionResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='technician.booking.assignment-decision',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: decide_assignment(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    booking = session.get(Booking, result_id)
    if booking is None:
        raise HTTPException(status_code=404, detail='Booking not found.')
    return BookingAssignmentDecisionResponse(
        booking_id=booking.id,
        decision=request.decision,
        status=booking.status,
    )


@technician_router.post('/{booking_id}/transitions', response_model=BookingDetailResponse)
def transition_technician_work(
    booking_id: UUID,
    request: BookingTransitionRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='technician.booking.transition',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: transition_technician_booking(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='technician')


@technician_router.put('/{booking_id}/visit', response_model=BookingVisitResponse)
def update_technician_visit_status(
    booking_id: UUID,
    request: BookingVisitUpdateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingVisitResponse:
    visit_id = execute_idempotent(
        session,
        actor=actor,
        operation='technician.booking.visit.update',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking_visit',
        mutation=lambda: update_booking_visit(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    visit = session.get(BookingVisit, visit_id)
    if visit is None:
        raise HTTPException(status_code=404, detail='Booking visit not found.')
    return BookingVisitResponse.model_validate(visit)


@technician_router.post('/{booking_id}/quotes', response_model=BookingDetailResponse)
def issue_technician_quote(
    booking_id: UUID,
    request: BookingQuoteCreateRequest,
    actor: TechnicianActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    quote_id = execute_idempotent(
        session,
        actor=actor,
        operation='technician.booking.quote.create',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='quote',
        mutation=lambda: create_booking_quote(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    _ = quote_id
    return _booking_detail_response(session, actor=actor, booking_id=booking_id, viewer='technician')


@admin_router.get('', response_model=BookingListResponse)
def get_admin_bookings(
    _actor: AdminActor,
    session: DatabaseSession,
    booking_status: Annotated[BookingStatus | None, Query(alias='status')] = None,
    escalation_status: Annotated[Literal['normal', 'escalated', 'resolved'] | None, Query()] = None,
    service_slug: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    technician_user_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> BookingListResponse:
    if date_from and date_to and date_to < date_from:
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_date_range', 'message': 'End date must not be earlier than start date.'},
        )
    return BookingListResponse.model_validate(
        list_admin_bookings(
            session,
            booking_status=booking_status,
            escalation_status=escalation_status,
            service_slug=service_slug,
            technician_user_id=technician_user_id,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
    )


@admin_router.get('/{booking_id}/eligible-technicians')
def get_eligible_booking_technicians(
    booking_id: UUID,
    _actor: AdminActor,
    session: DatabaseSession,
) -> list[dict[str, object]]:
    return list_eligible_technicians(session, booking_id)


@admin_router.get('/{booking_id}', response_model=BookingDetailResponse)
def get_admin_booking(
    booking_id: UUID,
    actor: AdminActor,
    session: DatabaseSession,
) -> BookingDetailResponse:
    return _booking_detail_response(session, actor=actor, booking_id=booking_id, viewer='admin')


@admin_router.put('/{booking_id}/visit', response_model=BookingVisitResponse)
def update_admin_booking_visit(
    booking_id: UUID,
    request: BookingVisitUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingVisitResponse:
    visit_id = execute_idempotent(
        session,
        actor=actor,
        operation='admin.booking.visit.update',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking_visit',
        mutation=lambda: update_booking_visit(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    visit = session.get(BookingVisit, visit_id)
    if visit is None:
        raise HTTPException(status_code=404, detail='Booking visit not found.')
    return BookingVisitResponse.model_validate(visit)


@admin_router.post('/{booking_id}/assign', response_model=BookingDetailResponse)
def assign_admin_booking(
    booking_id: UUID,
    request: BookingAssignmentRequest,
    actor: AdminActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='admin.booking.assign',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: assign_booking(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='admin')


@admin_router.post('/{booking_id}/cancel', response_model=BookingDetailResponse)
def cancel_admin_booking(
    booking_id: UUID,
    request: BookingCancelRequest,
    actor: AdminActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='admin.booking.cancel',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: cancel_booking(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
            actor_kind='admin',
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='admin')


@admin_router.patch('/{booking_id}/escalation', response_model=BookingDetailResponse)
def manage_booking_escalation(
    booking_id: UUID,
    request: BookingEscalationRequest,
    actor: AdminActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
) -> BookingDetailResponse:
    result_id = execute_idempotent(
        session,
        actor=actor,
        operation='admin.booking.escalation',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='booking',
        mutation=lambda: update_booking_escalation(
            session,
            actor=actor,
            booking_id=booking_id,
            request=request,
        ),
    )
    return _booking_detail_response(session, actor=actor, booking_id=result_id, viewer='admin')
