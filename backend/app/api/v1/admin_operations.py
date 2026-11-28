"""Admin overview dashboard, customer management, and unified audit APIs."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import AppUser
from app.schemas.accounts import AccountStatus, AdminManagedUserResponse
from app.schemas.operations import (
    AdminAccountStatusRequest,
    AdminCustomerDetailResponse,
    AdminCustomerListResponse,
    AdminOverviewResponse,
    AuditListResponse,
)
from app.services import admin_audit, admin_customers, admin_dashboard

router = APIRouter(prefix='/admin', tags=['admin operations'])

DatabaseSession = Annotated[Session, Depends(get_db_session)]
AdminActor = Annotated[AppUser, Depends(require_admin_role)]


@router.get('/overview', response_model=AdminOverviewResponse)
def read_overview(
    _actor: AdminActor,
    session: DatabaseSession,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
    _rate_limit: Annotated[None, Depends(rate_limit('admin_overview'))] = None,
):
    """Database-backed platform metrics; average rating is null when no reviews exist."""

    return AdminOverviewResponse.model_validate(admin_dashboard.build_overview(session, days=days))


@router.get('/customers', response_model=AdminCustomerListResponse)
def list_customers(
    _actor: AdminActor,
    session: DatabaseSession,
    search: Annotated[str | None, Query(max_length=200)] = None,
    account_status: Annotated[
        Literal['pending', 'active', 'suspended', 'disabled'] | None, Query()
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
    _rate_limit: Annotated[None, Depends(rate_limit('admin_search'))] = None,
):
    return AdminCustomerListResponse.model_validate(
        admin_customers.list_customers(
            session,
            search=search,
            account_status=account_status,
            limit=limit,
            offset=offset,
        )
    )


@router.get('/customers/{user_id}', response_model=AdminCustomerDetailResponse)
def read_customer(
    user_id: UUID,
    _actor: AdminActor,
    session: DatabaseSession,
):
    return AdminCustomerDetailResponse.model_validate(
        admin_customers.get_customer_detail(session, user_id)
    )


@router.post('/customers/{user_id}/suspend', response_model=AdminManagedUserResponse)
def suspend_customer(
    user_id: UUID,
    request: AdminAccountStatusRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    """Suspend a customer account; the reason is mandatory and audited."""

    response = admin_customers.set_customer_status(
        session,
        actor,
        user_id=user_id,
        new_status=AccountStatus.SUSPENDED,
        reason=request.reason,
    )
    session.commit()
    return response


@router.post('/customers/{user_id}/reactivate', response_model=AdminManagedUserResponse)
def reactivate_customer(
    user_id: UUID,
    request: AdminAccountStatusRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    response = admin_customers.set_customer_status(
        session,
        actor,
        user_id=user_id,
        new_status=AccountStatus.ACTIVE,
        reason=request.reason,
    )
    session.commit()
    return response


@router.get('/audit', response_model=AuditListResponse)
def list_audit(
    _actor: AdminActor,
    session: DatabaseSession,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    actor_user_id: Annotated[UUID | None, Query()] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    entity_type: Annotated[str | None, Query(max_length=40)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
    _rate_limit: Annotated[None, Depends(rate_limit('admin_audit'))] = None,
):
    if date_from is not None and date_to is not None and date_to < date_from:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={'code': 'invalid_date_range', 'message': 'date_to cannot be before date_from.'},
        )
    return AuditListResponse.model_validate(
        admin_audit.list_audit_entries(
            session,
            date_from=date_from,
            date_to=date_to,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            limit=limit,
            offset=offset,
        )
    )
