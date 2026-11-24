"""Database-backed customer service catalog models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.technician_management import TechnicianSkill


class ServiceCategory(Base):
    """Admin-managed catalog category with explicit visibility and ordering."""

    __tablename__ = 'service_categories'
    __table_args__ = (
        CheckConstraint('display_order >= 0', name='ck_service_categories_display_order'),
        Index('ix_service_categories_active_order', 'is_active', 'display_order'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default='')
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    services: Mapped[list['Service']] = relationship(back_populates='category')


class Service(Base):
    """A published or inactive service guide; no prices or provider availability are stored."""

    __tablename__ = 'services'
    __table_args__ = (
        CheckConstraint('display_order >= 0', name='ck_services_display_order'),
        Index('ix_services_category_active_order', 'category_id', 'is_active', 'display_order'),
        Index('ix_services_active_order', 'is_active', 'display_order'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    category_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('service_categories.id', ondelete='RESTRICT'),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    home_title: Mapped[str] = mapped_column(String(120), nullable=False)
    home_description: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    listing_description: Mapped[str] = mapped_column(String(500), nullable=False)
    keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    common_problems: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)
    inspection_scope: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    questions: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)
    related_service_slugs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    category: Mapped[ServiceCategory] = relationship(back_populates='services')
    technician_skills: Mapped[list['TechnicianSkill']] = relationship(back_populates='service')


class ServiceCatalogAuditEvent(Base):
    """Append-only metadata about privileged service-catalog changes."""

    __tablename__ = 'service_catalog_audit_events'
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('category', 'service')",
            name='ck_service_catalog_audit_entity_type',
        ),
        CheckConstraint(
            "action IN ('created', 'updated', 'activated', 'deactivated')",
            name='ck_service_catalog_audit_action',
        ),
        Index(
            'ix_service_catalog_audit_actor_created',
            'actor_user_id',
            'created_at',
        ),
        Index(
            'ix_service_catalog_audit_entity_created',
            'entity_type',
            'entity_id',
            'created_at',
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('app_users.id', ondelete='SET NULL'), nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
