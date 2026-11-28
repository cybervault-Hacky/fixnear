"""Owner-scoped in-app notification reads and preferences; no public creation."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.authorization import get_current_app_user
from app.db.session import get_db_session
from app.models import AppUser, InAppNotification, NotificationPreference
from app.services.notifications import CATEGORIES

router = APIRouter(prefix="/notifications", tags=["in-app notifications"])
DB = Annotated[Session, Depends(get_db_session)]
Actor = Annotated[AppUser, Depends(get_current_app_user)]
Category = Literal["booking", "quote", "warranty", "maintenance", "support", "security"]
State = Literal["unread", "read", "archived"]


class NotificationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    category: Category
    title: str
    message: str
    action_path: str
    state: State
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationView]
    total: int
    unread_count: int
    limit: int
    offset: int


class StateChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: State


class PreferenceChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: StrictBool


@router.get("", response_model=NotificationPage)
def list_notifications(
    actor: Actor,
    session: DB,
    state: State | None = None,
    category: Category | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> NotificationPage:
    filters = [InAppNotification.recipient_user_id == actor.id]
    if state is not None:
        filters.append(InAppNotification.state == state)
    if category is not None:
        filters.append(InAppNotification.category == category)
    items = list(
        session.scalars(
            select(InAppNotification)
            .where(*filters)
            .order_by(InAppNotification.created_at.desc(), InAppNotification.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    total = (
        session.scalar(
            select(func.count()).select_from(InAppNotification).where(*filters)
        )
        or 0
    )
    unread = (
        session.scalar(
            select(func.count())
            .select_from(InAppNotification)
            .where(
                InAppNotification.recipient_user_id == actor.id,
                InAppNotification.state == "unread",
            )
        )
        or 0
    )
    return NotificationPage(
        items=[NotificationView.model_validate(item) for item in items],
        total=total,
        unread_count=unread,
        limit=limit,
        offset=offset,
    )


@router.get("/preferences")
def get_preferences(actor: Actor, session: DB) -> dict[str, bool]:
    stored = {
        p.category: p.enabled
        for p in session.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == actor.id
            )
        )
    }
    return {
        category: True if category == "security" else stored.get(category, True)
        for category in CATEGORIES
    }


@router.put("/preferences/{category}")
def set_preference(
    category: Category, request: PreferenceChange, actor: Actor, session: DB
) -> dict[str, bool]:
    if category == "security" and not request.enabled:
        raise HTTPException(
            status_code=422, detail="Security alerts cannot be disabled."
        )
    item = session.scalar(
        select(NotificationPreference)
        .where(
            NotificationPreference.user_id == actor.id,
            NotificationPreference.category == category,
        )
        .with_for_update()
    )
    if item is None:
        item = NotificationPreference(
            user_id=actor.id, category=category, enabled=request.enabled
        )
        session.add(item)
    else:
        item.enabled = request.enabled
    session.commit()
    return {"enabled": item.enabled}


@router.post("/read-all")
def read_all(actor: Actor, session: DB) -> dict[str, int]:
    result = session.execute(
        update(InAppNotification)
        .where(
            InAppNotification.recipient_user_id == actor.id,
            InAppNotification.state == "unread",
        )
        .values(state="read")
    )
    session.commit()
    return {"updated": result.rowcount}


@router.patch("/{notification_id}", response_model=NotificationView)
def update_notification(
    notification_id: UUID, request: StateChange, actor: Actor, session: DB
) -> NotificationView:
    item = session.scalar(
        select(InAppNotification)
        .where(
            InAppNotification.id == notification_id,
            InAppNotification.recipient_user_id == actor.id,
        )
        .with_for_update()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    item.state = request.state
    session.commit()
    return NotificationView.model_validate(item)
