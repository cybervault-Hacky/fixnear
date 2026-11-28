"""Process one bounded batch using only local deterministic adapters.

Run manually: python -m app.workers.notification_delivery. No external provider is used.
"""

from datetime import UTC, datetime

from sqlalchemy import or_, select

from app.db.session import get_session_factory
from app.models import NotificationDelivery
from app.services.notification_delivery import (
    SimulatedAdapter,
    process_one,
    recover_expired,
)


def run_once(limit: int = 100) -> int:
    if not 1 <= limit <= 100:
        raise ValueError("Batch size must be between 1 and 100")
    with get_session_factory()() as session:
        recover_expired(session)
        ids = list(
            session.scalars(
                select(NotificationDelivery.id)
                .where(
                    NotificationDelivery.state.in_(["pending", "retry_pending"]),
                    NotificationDelivery.attempt_count
                    < NotificationDelivery.max_attempts,
                    or_(
                        NotificationDelivery.next_attempt_at.is_(None),
                        NotificationDelivery.next_attempt_at <= datetime.now(UTC),
                    ),
                )
                .order_by(NotificationDelivery.created_at, NotificationDelivery.id)
                .limit(limit)
            )
        )
        return sum(process_one(session, job_id, SimulatedAdapter()) for job_id in ids)


if __name__ == "__main__":
    print(
        f"Processed {run_once()} local in-app/simulated delivery jobs; no external delivery occurred."
    )
