"""Admin-only category and service catalog management endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.service_catalog import (
    ServiceAdminResponse,
    ServiceCategoryAdminResponse,
    ServiceCategoryCreateRequest,
    ServiceCategoryUpdateRequest,
    ServiceCreateRequest,
    ServiceUpdateRequest,
)
from app.services.service_catalog import (
    create_category,
    create_service,
    deactivate_category,
    deactivate_service,
    list_admin_categories,
    list_admin_services,
    update_category,
    update_service,
)

router = APIRouter(prefix='/admin/service-catalog', tags=['admin service catalog'])
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get('/categories', response_model=list[ServiceCategoryAdminResponse])
def read_categories(_actor: AdminActor, session: DatabaseSession):
    return [
        ServiceCategoryAdminResponse.model_validate(category)
        for category in list_admin_categories(session)
    ]


@router.post(
    '/categories',
    response_model=ServiceCategoryAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_category(
    request: ServiceCategoryCreateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> ServiceCategoryAdminResponse:
    category = create_category(session, request, actor=actor)
    session.commit()
    session.refresh(category)
    return ServiceCategoryAdminResponse.model_validate(category)


@router.patch('/categories/{category_id}', response_model=ServiceCategoryAdminResponse)
def edit_category(
    category_id: UUID,
    request: ServiceCategoryUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> ServiceCategoryAdminResponse:
    category = update_category(session, category_id, request, actor=actor)
    session.commit()
    session.refresh(category)
    return ServiceCategoryAdminResponse.model_validate(category)


@router.delete('/categories/{category_id}', status_code=status.HTTP_204_NO_CONTENT)
def disable_category(
    category_id: UUID,
    actor: AdminActor,
    session: DatabaseSession,
) -> Response:
    deactivate_category(session, category_id, actor=actor)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/services', response_model=list[ServiceAdminResponse])
def read_services(_actor: AdminActor, session: DatabaseSession):
    return [
        ServiceAdminResponse.model_validate(service) for service in list_admin_services(session)
    ]


@router.post(
    '/services',
    response_model=ServiceAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_service(
    request: ServiceCreateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> ServiceAdminResponse:
    service = create_service(session, request, actor=actor)
    session.commit()
    session.refresh(service)
    return ServiceAdminResponse.model_validate(service)


@router.patch('/services/{service_id}', response_model=ServiceAdminResponse)
def edit_service(
    service_id: UUID,
    request: ServiceUpdateRequest,
    actor: AdminActor,
    session: DatabaseSession,
) -> ServiceAdminResponse:
    service = update_service(session, service_id, request, actor=actor)
    session.commit()
    session.refresh(service)
    return ServiceAdminResponse.model_validate(service)


@router.delete('/services/{service_id}', status_code=status.HTTP_204_NO_CONTENT)
def disable_service(
    service_id: UUID,
    actor: AdminActor,
    session: DatabaseSession,
) -> Response:
    deactivate_service(session, service_id, actor=actor)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
