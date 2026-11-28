"""Admin-only delivery inspection and audited retry of simulated/in-app jobs."""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.authorization import require_admin_role
from app.core.rate_limit import rate_limit
from app.db.session import get_db_session
from app.models import (
    AppUser,
    InAppNotification,
    NotificationDelivery,
    NotificationDeliveryAttempt,
)
from app.services.operations_audit import record_operations_audit

router = APIRouter(
    prefix="/admin/notification-deliveries", tags=["admin notification deliveries"]
)
Admin = Annotated[AppUser, Depends(require_admin_role)]
DB = Annotated[Session, Depends(get_db_session)]
State = Literal[
    "pending", "processing", "delivered", "retry_pending", "permanently_failed"
]
Channel = Literal["in_app", "email", "sms", "web_push", "mobile_push"]
Category = Literal["booking", "quote", "warranty", "maintenance", "support", "security"]


def view(job: NotificationDelivery, notification: InAppNotification) -> dict:
    return {
        "id": job.id,
        "event_reference": str(notification.booking_event_id),
        "category": notification.category,
        "recipient_reference": str(notification.recipient_user_id),
        "channel": job.channel,
        "simulated": job.channel != "in_app",
        "state": job.state,
        "attempt_count": job.attempt_count,
        "max_attempts": job.max_attempts,
        "created_at": job.created_at,
        "last_attempt_at": job.last_attempt_at,
        "next_attempt_at": job.next_attempt_at,
        "failure_reason": job.failure_reason,
    }


@router.get("")
def listing(
    _actor: Admin,
    session: DB,
    state: State | None = None,
    channel: Channel | None = None,
    category: Category | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    _limited: Annotated[None, Depends(rate_limit("admin_search"))] = None,
):
    filters = []
    if state:
        filters.append(NotificationDelivery.state == state)
    if channel:
        filters.append(NotificationDelivery.channel == channel)
    if category:
        filters.append(InAppNotification.category == category)
    base = (
        select(NotificationDelivery, InAppNotification)
        .join(
            InAppNotification,
            InAppNotification.id == NotificationDelivery.notification_id,
        )
        .where(*filters)
    )
    total = session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = session.execute(
        base.order_by(
            NotificationDelivery.created_at.desc(), NotificationDelivery.id.desc()
        )
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "items": [view(job, notification) for job, notification in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{delivery_id}")
def detail(
    delivery_id: UUID,
    _actor: Admin,
    session: DB,
    _limited: Annotated[None, Depends(rate_limit("admin_search"))] = None,
):
    row = session.execute(
        select(NotificationDelivery, InAppNotification)
        .join(
            InAppNotification,
            InAppNotification.id == NotificationDelivery.notification_id,
        )
        .where(NotificationDelivery.id == delivery_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Delivery not found.")
    attempts = session.scalars(
        select(NotificationDeliveryAttempt)
        .where(NotificationDeliveryAttempt.delivery_id == delivery_id)
        .order_by(NotificationDeliveryAttempt.attempt_number)
    ).all()
    return {
        **view(*row),
        "attempts": [
            {
                "number": a.attempt_number,
                "outcome": a.outcome,
                "started_at": a.started_at,
                "finished_at": a.finished_at,
                "failure_reason": a.failure_reason,
            }
            for a in attempts
        ],
    }


@router.post("/{delivery_id}/retry")
def retry(
    delivery_id: UUID,
    actor: Admin,
    session: DB,
    _limited: Annotated[None, Depends(rate_limit("admin_search"))] = None,
):
    result = session.execute(
        update(NotificationDelivery)
        .where(
            NotificationDelivery.id == delivery_id,
            NotificationDelivery.state == "permanently_failed",
        )
        .values(
            state="retry_pending",
            max_attempts=NotificationDelivery.attempt_count + 3,
            next_attempt_at=datetime.now(UTC),
            failure_reason=None,
        )
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Only permanently failed deliveries can be retried."
        )
    record_operations_audit(
        session,
        actor=actor,
        entity_type="notification_delivery",
        entity_id=delivery_id,
        action="notification_delivery.retry",
        changed_fields=("state", "max_attempts"),
    )
    session.commit()
    return {"state": "retry_pending", "delivery_id": delivery_id}
