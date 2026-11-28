"""Unified, read-only view over every append-only audit stream in the platform.

No source table is modified here. The audit surface is restricted to administrators,
never serializes credentials, and exposes only fields the sources already store.
"""

from datetime import date
from uuid import UUID

from sqlalchemy import Date, String, cast, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models import (
    BookingEvent,
    CustomerProfile,
    HomePassportAuditEvent,
    OperationsAuditEvent,
    ServiceCatalogAuditEvent,
    TechnicianProfile,
    TechnicianVerificationReview,
    UserAuditEvent,
    UserRole,
)


def _audit_union():
    user_events = select(
        UserAuditEvent.id.label("id"),
        literal("user").label("source"),
        UserAuditEvent.actor_user_id.label("actor_user_id"),
        UserAuditEvent.action.label("action"),
        literal("user").label("entity_type"),
        UserAuditEvent.subject_user_id.label("entity_id"),
        UserAuditEvent.before_value.label("detail_from"),
        UserAuditEvent.after_value.label("detail_to"),
        UserAuditEvent.reason.label("note"),
        literal(False).label("is_internal"),
        UserAuditEvent.created_at.label("created_at"),
    )
    catalog_events = select(
        ServiceCatalogAuditEvent.id.label("id"),
        literal("catalog").label("source"),
        ServiceCatalogAuditEvent.actor_user_id.label("actor_user_id"),
        ServiceCatalogAuditEvent.action.label("action"),
        ServiceCatalogAuditEvent.entity_type.label("entity_type"),
        ServiceCatalogAuditEvent.entity_id.label("entity_id"),
        cast(ServiceCatalogAuditEvent.changed_fields, String).label("detail_from"),
        literal(None).label("detail_to"),
        literal(None).label("note"),
        literal(False).label("is_internal"),
        ServiceCatalogAuditEvent.created_at.label("created_at"),
    )
    booking_events = select(
        BookingEvent.id.label("id"),
        literal("booking").label("source"),
        BookingEvent.actor_user_id.label("actor_user_id"),
        BookingEvent.event_type.label("action"),
        literal("booking").label("entity_type"),
        BookingEvent.booking_id.label("entity_id"),
        BookingEvent.from_status.label("detail_from"),
        BookingEvent.to_status.label("detail_to"),
        BookingEvent.note.label("note"),
        BookingEvent.is_internal.label("is_internal"),
        BookingEvent.created_at.label("created_at"),
    )
    passport_events = select(
        HomePassportAuditEvent.id.label("id"),
        literal("homepassport").label("source"),
        HomePassportAuditEvent.actor_user_id.label("actor_user_id"),
        HomePassportAuditEvent.action.label("action"),
        HomePassportAuditEvent.entity_type.label("entity_type"),
        HomePassportAuditEvent.entity_id.label("entity_id"),
        cast(HomePassportAuditEvent.changed_fields, String).label("detail_from"),
        literal(None).label("detail_to"),
        HomePassportAuditEvent.note.label("note"),
        literal(False).label("is_internal"),
        HomePassportAuditEvent.created_at.label("created_at"),
    )
    verification_reviews = select(
        TechnicianVerificationReview.id.label("id"),
        literal("verification").label("source"),
        TechnicianVerificationReview.reviewer_user_id.label("actor_user_id"),
        TechnicianVerificationReview.decision.label("action"),
        literal("technician_verification").label("entity_type"),
        TechnicianVerificationReview.technician_user_id.label("entity_id"),
        literal(None).label("detail_from"),
        TechnicianVerificationReview.decision.label("detail_to"),
        TechnicianVerificationReview.note.label("note"),
        literal(True).label("is_internal"),
        TechnicianVerificationReview.created_at.label("created_at"),
    )
    operations_events = select(
        OperationsAuditEvent.id.label("id"),
        literal("operations").label("source"),
        OperationsAuditEvent.actor_user_id.label("actor_user_id"),
        OperationsAuditEvent.action.label("action"),
        OperationsAuditEvent.entity_type.label("entity_type"),
        OperationsAuditEvent.entity_id.label("entity_id"),
        cast(OperationsAuditEvent.changed_fields, String).label("detail_from"),
        literal(None).label("detail_to"),
        OperationsAuditEvent.note.label("note"),
        OperationsAuditEvent.is_internal.label("is_internal"),
        OperationsAuditEvent.created_at.label("created_at"),
    )
    return union_all(
        user_events,
        catalog_events,
        booking_events,
        passport_events,
        verification_reviews,
        operations_events,
    ).subquery("audit_union")


def _detail(detail_from, detail_to) -> str | None:
    left = str(detail_from).strip() if detail_from is not None else None
    right = str(detail_to).strip() if detail_to is not None else None
    if left and right:
        return f"{left} → {right}"
    return left or right


def _actor_labels(session: Session, actor_ids: set[UUID]) -> dict[UUID, str]:
    if not actor_ids:
        return {}
    labels: dict[UUID, str] = {}
    customer_names = session.execute(
        select(CustomerProfile.user_id, CustomerProfile.display_name).where(
            CustomerProfile.user_id.in_(actor_ids)
        )
    ).all()
    for user_id, name in customer_names:
        labels[user_id] = name
    remaining = {user_id for user_id in actor_ids if user_id not in labels}
    if remaining:
        technician_names = session.execute(
            select(TechnicianProfile.user_id, TechnicianProfile.display_name).where(
                TechnicianProfile.user_id.in_(remaining)
            )
        ).all()
        for user_id, name in technician_names:
            labels[user_id] = name
    remaining = {user_id for user_id in actor_ids if user_id not in labels}
    if remaining:
        admins = session.scalars(
            select(UserRole.user_id).where(
                UserRole.user_id.in_(remaining), UserRole.role_code == "admin"
            )
        ).all()
        for user_id in admins:
            labels[user_id] = "FixNear administrator"
    return labels


def list_audit_entries(
    session: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    actor_user_id: UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, object]:
    union = _audit_union()
    conditions = []
    if date_from is not None:
        conditions.append(cast(union.c.created_at, Date) >= date_from)
    if date_to is not None:
        conditions.append(cast(union.c.created_at, Date) <= date_to)
    if actor_user_id is not None:
        conditions.append(union.c.actor_user_id == actor_user_id)
    if action is not None:
        conditions.append(union.c.action == action)
    if entity_type is not None:
        conditions.append(union.c.entity_type == entity_type)

    statement = select(union)
    count_statement = select(func.count()).select_from(union)
    for condition in conditions:
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)

    total = int(session.scalar(count_statement) or 0)
    rows = session.execute(
        statement.order_by(union.c.created_at.desc(), union.c.source).limit(limit).offset(offset)
    ).all()

    actor_ids = {row.actor_user_id for row in rows if row.actor_user_id is not None}
    labels = _actor_labels(session, actor_ids)

    items = [
        {
            "id": row.id,
            "source": row.source,
            "actor_user_id": row.actor_user_id,
            "actor_label": labels.get(row.actor_user_id) if row.actor_user_id else None,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "detail": _detail(row.detail_from, row.detail_to),
            "note": row.note,
            "is_internal": bool(row.is_internal),
            "created_at": row.created_at,
        }
        for row in rows
    ]
    return {"items": items, "total": total}


def recent_activity(session: Session, *, limit: int = 10) -> list[dict[str, object]]:
    union = _audit_union()
    rows = session.execute(
        select(union).order_by(union.c.created_at.desc()).limit(limit)
    ).all()
    actor_ids = {row.actor_user_id for row in rows if row.actor_user_id is not None}
    labels = _actor_labels(session, actor_ids)
    return [
        {
            "source": row.source,
            "actor_label": labels.get(row.actor_user_id) if row.actor_user_id else None,
            "action": row.action,
            "entity_type": row.entity_type,
            "created_at": row.created_at,
        }
        for row in rows
    ]
