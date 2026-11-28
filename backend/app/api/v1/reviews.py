"""Customer, technician, and admin review APIs."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from app.auth.authorization import (
    require_admin_role,
    require_approved_technician,
    require_customer_role,
)
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import AppUser, Review
from app.schemas.operations import (
    AdminReviewListResponse,
    AdminReviewModerationRequest,
    AdminReviewResponse,
    ReportResolutionRequest,
    ReviewCreateRequest,
    ReviewListResponse,
    ReviewReportListResponse,
    ReviewReportRequest,
    ReviewReportResponse,
    ReviewResponse,
    ReviewSummaryResponse,
    ReviewUpdateRequest,
)
from app.services import reviews as service
from app.services.booking_management import execute_idempotent

customer_router = APIRouter(prefix='/customer/reviews', tags=['reviews'])
technician_router = APIRouter(prefix='/technician/reviews', tags=['technician reviews'])
admin_router = APIRouter(prefix='/admin/reviews', tags=['admin reviews'])

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CustomerActor = Annotated[AppUser, Depends(require_customer_role)]
TechnicianActor = Annotated[AppUser, Depends(require_approved_technician)]
AdminActor = Annotated[AppUser, Depends(require_admin_role)]
IdempotencyKey = Annotated[UUID, Header(alias='Idempotency-Key')]


@customer_router.post(
    '/bookings/{booking_id}',
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    booking_id: UUID,
    request: ReviewCreateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
    idempotency_key: IdempotencyKey,
    _rate_limit: Annotated[None, Depends(rate_limit('review_submit'))] = None,
):
    """Create a review for a completed booking; one review per booking, ever."""

    review_id = execute_idempotent(
        session,
        actor=actor,
        operation='reviews.create',
        key=idempotency_key,
        payload={'booking_id': str(booking_id), **request.model_dump(mode='json')},
        resource_type='review',
        mutation=lambda: service.create_review(
            session,
            actor,
            booking_id=booking_id,
            **request.model_dump(),
        ).id,
    )
    review = session.get(Review, review_id)
    return ReviewResponse.model_validate(service.review_payload(session, review))


@customer_router.get('/eligible-bookings')
def list_eligible_bookings(actor: CustomerActor, session: DatabaseSession):
    """Completed bookings the customer may still review."""

    return {'items': service.list_eligible_bookings(session, actor)}


@customer_router.get('', response_model=ReviewListResponse)
def list_my_reviews(actor: CustomerActor, session: DatabaseSession):
    return ReviewListResponse.model_validate(service.list_my_reviews(session, actor))


@customer_router.patch('/{review_id}', response_model=ReviewResponse)
def edit_review(
    review_id: UUID,
    request: ReviewUpdateRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    changes = request.model_dump(exclude_unset=True)
    if not changes:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={'code': 'empty_update', 'message': 'Provide at least one field to update.'},
        )
    review = service.update_review(session, actor, review_id=review_id, changes=changes)
    session.commit()
    return ReviewResponse.model_validate(review)


@customer_router.post(
    '/{review_id}/report',
    response_model=ReviewReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def report_review(
    review_id: UUID,
    request: ReviewReportRequest,
    actor: CustomerActor,
    session: DatabaseSession,
):
    report = service.report_review(
        session,
        actor,
        review_id=review_id,
        reason=request.reason,
        note=request.note,
    )
    session.commit()
    return ReviewReportResponse.model_validate(report)


@technician_router.get('', response_model=ReviewListResponse)
def list_received_reviews(actor: TechnicianActor, session: DatabaseSession):
    return ReviewListResponse.model_validate(service.list_technician_reviews(session, actor))


@technician_router.get('/summary', response_model=ReviewSummaryResponse)
def read_rating_summary(actor: TechnicianActor, session: DatabaseSession):
    return ReviewSummaryResponse.model_validate(
        service.technician_rating_summary(session, actor.id)
    )


@admin_router.get('', response_model=AdminReviewListResponse)
def list_reviews(
    _actor: AdminActor,
    session: DatabaseSession,
    status_filter: Annotated[Literal['published', 'hidden'] | None, Query(alias='status')] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return AdminReviewListResponse.model_validate(
        service.list_admin_reviews(session, status_filter=status_filter, limit=limit, offset=offset)
    )


@admin_router.get('/reports', response_model=ReviewReportListResponse)
def list_reports(
    _actor: AdminActor,
    session: DatabaseSession,
    status_filter: Annotated[
        Literal['open', 'reviewed', 'dismissed'] | None, Query(alias='status')
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return ReviewReportListResponse.model_validate(
        service.list_reports(session, status_filter=status_filter, limit=limit, offset=offset)
    )


@admin_router.post('/reports/{report_id}/resolve', response_model=ReviewReportResponse)
def resolve_report(
    report_id: UUID,
    request: ReportResolutionRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    report = service.resolve_report(session, actor, report_id=report_id, new_status=request.status)
    session.commit()
    return ReviewReportResponse.model_validate(report)


@admin_router.post('/{review_id}/hide', response_model=AdminReviewResponse)
def hide_review(
    review_id: UUID,
    request: AdminReviewModerationRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    """Hide a review; content is preserved, reason is audited, no rewriting."""

    review = service.hide_review(session, actor, review_id=review_id, reason=request.reason)
    session.commit()
    return AdminReviewResponse.model_validate(review)


@admin_router.post('/{review_id}/restore', response_model=AdminReviewResponse)
def restore_review(
    review_id: UUID,
    request: AdminReviewModerationRequest,
    actor: AdminActor,
    session: DatabaseSession,
):
    review = service.restore_review(session, actor, review_id=review_id, reason=request.reason)
    session.commit()
    return AdminReviewResponse.model_validate(review)
