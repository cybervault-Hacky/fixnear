"""Small helper for appending privileged-operations audit events."""

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AppUser, OperationsAuditEvent


def record_operations_audit(
    session: Session,
    *,
    actor: AppUser | None,
    entity_type: str,
    entity_id: UUID,
    action: str,
    changed_fields: Iterable[str] = (),
    note: str | None = None,
    is_internal: bool = False,
) -> OperationsAuditEvent:
    event = OperationsAuditEvent(
        actor_user_id=actor.id if actor is not None else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changed_fields=sorted(set(changed_fields)),
        note=note,
        is_internal=is_internal,
    )
    session.add(event)
    session.flush()
    return event
