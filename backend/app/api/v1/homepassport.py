"""Role-scoped HomePassport, warranty, claim, document, and reminder APIs."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role, require_customer_role
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.homepassport import (
    AdminAuditListResponse,
    AdminServiceHistoryCorrectionRequest,
    AdminVerificationUpdateRequest,
    AdminWarrantyListResponse,
    ApplianceCreateRequest,
    ApplianceDetailResponse,
    ApplianceListResponse,
    ApplianceResponse,
    ApplianceUpdateRequest,
    ClaimListResponse,
    ClaimResponse,
    ClaimStatus,
    ClaimTransitionRequest,
    DocumentListResponse,
    DocumentUploadIntentRequest,
    DocumentUploadIntentResponse,
    HomePassportOverviewResponse,
    PartCreateRequest,
    PartResponse,
    ReminderCreateRequest,
    ReminderListResponse,
    ReminderResponse,
    ReminderUpdateRequest,
    ServiceHistoryCreateRequest,
    ServiceHistoryFeedbackRequest,
    ServiceHistoryResponse,
    WarrantyClaimCreateRequest,
    WarrantyClaimRespondRequest,
    WarrantyCreateRequest,
    WarrantyListResponse,
    WarrantyResponse,
    WarrantyUpdateRequest,
)
from app.services import homepassport as service
from app.services.booking_management import execute_idempotent
from app.services.document_storage import DocumentStorage, get_document_storage

customer_router = APIRouter(prefix='/customer/homepassport', tags=['homepassport'])
admin_router = APIRouter(prefix='/admin/homepassport', tags=['admin homepassport'])

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CustomerActor = Annotated[AppUser, Depends(require_customer_role)]
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
IdempotencyKey = Annotated[UUID, Header(alias='Idempotency-Key')]
DocumentStorageDep = Annotated[DocumentStorage | None, Depends(get_document_storage)]


# ---------------------------------------------------------------------------
# Customer: overview and appliances
# ---------------------------------------------------------------------------


@customer_router.get('/overview', response_model=HomePassportOverviewResponse)
def read_overview(actor: CustomerActor, session: DatabaseSession):
    return HomePassportOverviewResponse.model_validate(service.get_overview(session, actor))


@customer_router.get('/appliances', response_model=ApplianceListResponse)
def read_appliances(
    actor: CustomerActor,
    session: DatabaseSession,
    include_archived: bool = False,
):
    return service.list_appliances(session, actor, include_archived=include_archived)


@customer_router.post(
    '/appliances', response_model=ApplianceResponse, status_code=status.HTTP_201_CREATED
)
def create_appliance(
    request: ApplianceCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    appliance_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.appliance.create',
        key=idempotency_key,
        payload=request.model_dump(mode='json'),
        resource_type='appliance',
        mutation=lambda: service.create_appliance(session, actor, request).id,
    )
    appliance = service._get_owned_appliance(
        session, actor, appliance_id, include_archived=True
    )
    return ApplianceResponse.model_validate(service._appliance_payload(appliance))


@customer_router.get('/appliances/{appliance_id}', response_model=ApplianceDetailResponse)
def read_appliance(
    appliance_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    return ApplianceDetailResponse.model_validate(
        service.get_appliance_detail(session, actor, appliance_id)
    )


@customer_router.patch('/appliances/{appliance_id}', response_model=ApplianceResponse)
def patch_appliance(
    appliance_id: UUID,
    request: ApplianceUpdateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    appliance = service.update_appliance(session, actor, appliance_id, request)
    session.commit()
    return ApplianceResponse.model_validate(service._appliance_payload(appliance))


@customer_router.post(
    '/appliances/{appliance_id}/archive', response_model=ApplianceResponse
)
def archive_appliance(
    appliance_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    appliance = service.archive_appliance(session, actor, appliance_id)
    session.commit()
    return ApplianceResponse.model_validate(service._appliance_payload(appliance))


@customer_router.post(
    '/appliances/{appliance_id}/unarchive', response_model=ApplianceResponse
)
def unarchive_appliance(
    appliance_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    appliance = service.unarchive_appliance(session, actor, appliance_id)
    session.commit()
    return ApplianceResponse.model_validate(service._appliance_payload(appliance))


@customer_router.delete(
    '/appliances/{appliance_id}', status_code=status.HTTP_204_NO_CONTENT
)
def delete_appliance(
    appliance_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    service.delete_appliance(session, actor, appliance_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Customer: service history and parts
# ---------------------------------------------------------------------------


@customer_router.post(
    '/appliances/{appliance_id}/service-history',
    response_model=ServiceHistoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_service_history(
    appliance_id: UUID,
    request: ServiceHistoryCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    history_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.service-history.create',
        key=idempotency_key,
        payload={'appliance_id': str(appliance_id), **request.model_dump(mode='json')},
        resource_type='service_history',
        mutation=lambda: service.create_customer_service_history(
            session, actor, appliance_id, request
        ).id,
    )
    record = session.get(service.ApplianceServiceHistory, history_id)
    assert record is not None
    return ServiceHistoryResponse.model_validate(
        service._service_history_payload(record)
    )


@customer_router.patch(
    '/service-history/{history_id}/feedback', response_model=ServiceHistoryResponse
)
def set_service_history_feedback(
    history_id: UUID,
    request: ServiceHistoryFeedbackRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    record = service.set_service_history_feedback(session, actor, history_id, request)
    session.commit()
    return ServiceHistoryResponse.model_validate(
        service._service_history_payload(record)
    )


@customer_router.delete(
    '/service-history/{history_id}', status_code=status.HTTP_204_NO_CONTENT
)
def delete_service_history(
    history_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    service.delete_customer_service_history(session, actor, history_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@customer_router.post(
    '/appliances/{appliance_id}/parts',
    response_model=PartResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_part(
    appliance_id: UUID,
    request: PartCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    part_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.part.create',
        key=idempotency_key,
        payload={'appliance_id': str(appliance_id), **request.model_dump(mode='json')},
        resource_type='part',
        mutation=lambda: service.create_customer_part(
            session, actor, appliance_id, request
        ).id,
    )
    part = session.get(service.ReplacedPart, part_id)
    assert part is not None
    return PartResponse.model_validate(service._part_payload(part))


@customer_router.delete('/parts/{part_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_part(part_id: UUID, actor: CustomerActor, session: DatabaseSession):
    service.delete_customer_part(session, actor, part_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Customer: warranty vault
# ---------------------------------------------------------------------------


@customer_router.get('/warranties', response_model=WarrantyListResponse)
def read_warranties(actor: CustomerActor, session: DatabaseSession):
    return service.list_warranties(session, actor)


@customer_router.post(
    '/warranties', response_model=WarrantyResponse, status_code=status.HTTP_201_CREATED
)
def create_warranty(
    request: WarrantyCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    warranty_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.warranty.create',
        key=idempotency_key,
        payload=request.model_dump(mode='json'),
        resource_type='warranty',
        mutation=lambda: service.create_warranty(session, actor, request).id,
    )
    warranty = session.get(service.WarrantyRecord, warranty_id)
    assert warranty is not None
    return WarrantyResponse.model_validate(service._warranty_payload(session, warranty))


@customer_router.get('/warranties/{warranty_id}', response_model=WarrantyResponse)
def read_warranty(
    warranty_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    warranty = service._get_owned_warranty(session, actor, warranty_id)
    return WarrantyResponse.model_validate(service._warranty_payload(session, warranty))


@customer_router.patch('/warranties/{warranty_id}', response_model=WarrantyResponse)
def patch_warranty(
    warranty_id: UUID,
    request: WarrantyUpdateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    warranty = service.update_warranty(session, actor, warranty_id, request)
    session.commit()
    return WarrantyResponse.model_validate(service._warranty_payload(session, warranty))


# ---------------------------------------------------------------------------
# Customer: warranty claims
# ---------------------------------------------------------------------------


@customer_router.post(
    '/warranties/{warranty_id}/claims',
    response_model=ClaimResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_claim(
    warranty_id: UUID,
    request: WarrantyClaimCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    claim_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.claim.create',
        key=idempotency_key,
        payload={'warranty_id': str(warranty_id), **request.model_dump(mode='json')},
        resource_type='warranty_claim',
        mutation=lambda: service.create_claim(session, actor, warranty_id, request).id,
    )
    claim = session.get(service.WarrantyClaim, claim_id)
    assert claim is not None
    return ClaimResponse.model_validate(service._claim_payload(session, claim))


@customer_router.get('/claims', response_model=ClaimListResponse)
def read_claims(actor: CustomerActor, session: DatabaseSession):
    return service.list_customer_claims(session, actor)


@customer_router.get('/claims/{claim_id}', response_model=ClaimResponse)
def read_claim(claim_id: UUID, actor: CustomerActor, session: DatabaseSession):
    return ClaimResponse.model_validate(
        service.get_claim(session, actor, claim_id, viewer='customer')
    )


@customer_router.post(
    '/claims/{claim_id}/respond', response_model=ClaimResponse
)
def respond_to_claim(
    claim_id: UUID,
    request: WarrantyClaimRespondRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    service.respond_to_claim(session, actor, claim_id, request)
    session.commit()
    return ClaimResponse.model_validate(
        service.get_claim(session, actor, claim_id, viewer='customer')
    )


# ---------------------------------------------------------------------------
# Customer: documents vault
# ---------------------------------------------------------------------------


@customer_router.get('/documents', response_model=DocumentListResponse)
def read_documents(
    actor: CustomerActor,
    session: DatabaseSession,
    storage: DocumentStorageDep,
):
    return service.list_documents(session, actor, storage_available=storage is not None)


@customer_router.post(
    '/documents/upload-intents',
    response_model=DocumentUploadIntentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_document_upload_intent(
    request: DocumentUploadIntentRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    storage: DocumentStorageDep,
):
    result = service.create_document_upload_intent(session, actor, request, storage)
    session.commit()
    return DocumentUploadIntentResponse.model_validate(result)


@customer_router.post(
    '/appliances/{appliance_id}/photo-intent',
    response_model=DocumentUploadIntentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_appliance_photo_intent(
    appliance_id: UUID,
    request: DocumentUploadIntentRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    storage: DocumentStorageDep,
):
    result = service.create_photo_upload_intent(
        session, actor, appliance_id, request, storage
    )
    session.commit()
    return DocumentUploadIntentResponse.model_validate(result)


@customer_router.delete(
    '/documents/{document_id}', status_code=status.HTTP_204_NO_CONTENT
)
def delete_document(
    document_id: UUID,
    actor: CustomerActor,
    session: DatabaseSession,
    storage: DocumentStorageDep,
):
    service.delete_document(session, actor, document_id, storage)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Customer: maintenance reminders
# ---------------------------------------------------------------------------


@customer_router.get('/reminders', response_model=ReminderListResponse)
def read_reminders(
    actor: CustomerActor,
    session: DatabaseSession,
    enabled: bool | None = None,
):
    return service.list_reminders(session, actor, enabled_only=bool(enabled))


@customer_router.post(
    '/reminders', response_model=ReminderResponse, status_code=status.HTTP_201_CREATED
)
def create_reminder(
    request: ReminderCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
):
    reminder_id = execute_idempotent(
        session,
        actor=actor,
        operation='homepassport.reminder.create',
        key=idempotency_key,
        payload=request.model_dump(mode='json'),
        resource_type='reminder',
        mutation=lambda: service.create_reminder(session, actor, request).id,
    )
    reminder = session.get(service.MaintenanceReminder, reminder_id)
    assert reminder is not None
    return ReminderResponse.model_validate(service._reminder_payload(reminder))


@customer_router.patch('/reminders/{reminder_id}', response_model=ReminderResponse)
def patch_reminder(
    reminder_id: UUID,
    request: ReminderUpdateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    reminder = service.update_reminder(session, actor, reminder_id, request)
    session.commit()
    return ReminderResponse.model_validate(service._reminder_payload(reminder))


@customer_router.delete(
    '/reminders/{reminder_id}', status_code=status.HTTP_204_NO_CONTENT
)
def delete_reminder(
    reminder_id: UUID, actor: CustomerActor, session: DatabaseSession
):
    service.delete_reminder(session, actor, reminder_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Admin: warranty claim review
# ---------------------------------------------------------------------------


@admin_router.get('/claims', response_model=ClaimListResponse)
def list_claims_for_review(
    _actor: AdminActor,
    session: DatabaseSession,
    claim_status: Annotated[ClaimStatus | None, Query(alias='status')] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
):
    return service.list_admin_claims(
        session, claim_status=claim_status, limit=limit, offset=offset
    )


@admin_router.get('/claims/{claim_id}', response_model=ClaimResponse)
def read_claim_for_review(
    claim_id: UUID, _actor: AdminActor, session: DatabaseSession
):
    return ClaimResponse.model_validate(
        service.get_claim(session, _actor, claim_id, viewer='admin')
    )


@admin_router.post('/claims/{claim_id}/transitions', response_model=ClaimResponse)
def transition_claim_review(
    claim_id: UUID,
    request: ClaimTransitionRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    claim = service.transition_claim(session, actor, claim_id, request)
    session.commit()
    return ClaimResponse.model_validate(service._claim_payload(session, claim))


@admin_router.get(
    '/claims/{claim_id}/documents', response_model=DocumentListResponse
)
def list_claim_evidence(
    claim_id: UUID, _actor: AdminActor, session: DatabaseSession
):
    items = service.list_claim_evidence(session, claim_id)
    return DocumentListResponse(items=items, total=len(items), upload_available=False)


# ---------------------------------------------------------------------------
# Admin: warranty oversight, service record corrections, audit history
# ---------------------------------------------------------------------------


@admin_router.get('/warranties', response_model=AdminWarrantyListResponse)
def list_warranties_for_oversight(
    _actor: AdminActor,
    session: DatabaseSession,
    verification_status: Annotated[
        Literal['unverified', 'pending_review', 'verified'] | None, Query()
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
):
    return service.list_admin_warranties(
        session, verification_status=verification_status, limit=limit, offset=offset
    )


@admin_router.patch('/warranties/{warranty_id}/verification')
def set_warranty_verification(
    warranty_id: UUID,
    request: AdminVerificationUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> dict[str, Literal['unverified', 'pending_review', 'verified']]:
    warranty = service.set_warranty_verification(session, actor, warranty_id, request)
    session.commit()
    return {'verification_status': warranty.verification_status}  # type: ignore[return-value]


@admin_router.patch(
    '/service-history/{history_id}', response_model=ServiceHistoryResponse
)
def correct_service_history(
    history_id: UUID,
    request: AdminServiceHistoryCorrectionRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    record = service.correct_service_history(session, actor, history_id, request)
    session.commit()
    return ServiceHistoryResponse.model_validate(
        service._service_history_payload(record)
    )


@admin_router.get('/audit', response_model=AdminAuditListResponse)
def list_audit_history(
    _actor: AdminActor,
    session: DatabaseSession,
    entity_type: Annotated[str | None, Query(min_length=1, max_length=40)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
):
    return service.list_audit_events(
        session, entity_type=entity_type, limit=limit, offset=offset
    )
