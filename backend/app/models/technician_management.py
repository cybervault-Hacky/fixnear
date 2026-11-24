"""Private technician skills, coverage, availability, and review state."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TechnicianSkill(Base):
    """A technician's self-reported experience for one active service."""

    __tablename__ = 'technician_skills'
    __table_args__ = (
        UniqueConstraint(
            'technician_user_id', 'service_id', name='uq_technician_skills_owner_service'
        ),
        CheckConstraint(
            'years_experience IS NULL OR years_experience BETWEEN 0 AND 60',
            name='ck_technician_skills_experience_range',
        ),
        Index('ix_technician_skills_service', 'service_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('technician_profiles.user_id', ondelete='CASCADE'),
        nullable=False,
    )
    service_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('services.id', ondelete='RESTRICT'), nullable=False
    )
    years_experience: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    service: Mapped['Service'] = relationship(back_populates='technician_skills')


class TechnicianCoverageArea(Base):
    """Private, technician-entered coverage preference; not a service promise."""

    __tablename__ = 'technician_coverage_areas'
    __table_args__ = (
        UniqueConstraint(
            'technician_user_id', 'area_key', name='uq_technician_coverage_owner_area'
        ),
        CheckConstraint(
            '(center_latitude IS NULL AND center_longitude IS NULL) OR '
            '(center_latitude IS NOT NULL AND center_longitude IS NOT NULL)',
            name='ck_technician_coverage_coordinates_pair',
        ),
        CheckConstraint(
            'center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90',
            name='ck_technician_coverage_latitude_range',
        ),
        CheckConstraint(
            'center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180',
            name='ck_technician_coverage_longitude_range',
        ),
        Index('ix_technician_coverage_owner', 'technician_user_id'),
        Index('ix_technician_coverage_coordinates', 'center_latitude', 'center_longitude'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('technician_profiles.user_id', ondelete='CASCADE'),
        nullable=False,
    )
    area_name: Mapped[str] = mapped_column(String(120), nullable=False)
    area_key: Mapped[str] = mapped_column(String(260), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), nullable=False, default='')
    center_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TechnicianAvailabilityPreference(Base):
    """Private recurring preferences; never treated as live appointment availability."""

    __tablename__ = 'technician_availability_preferences'
    __table_args__ = (
        UniqueConstraint('technician_user_id', name='uq_technician_availability_owner'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('technician_profiles.user_id', ondelete='CASCADE'),
        nullable=False,
    )
    timezone_name: Mapped[str] = mapped_column(
        String(64), nullable=False, default='Asia/Kolkata', server_default=text("'Asia/Kolkata'")
    )
    weekly_schedule: Mapped[dict[str, dict[str, object]]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TechnicianVerificationReview(Base):
    """Append-only admin decision history; no documents or identity numbers are stored."""

    __tablename__ = 'technician_verification_reviews'
    __table_args__ = (
        CheckConstraint(
            "decision IN ('approved', 'rejected')",
            name='ck_technician_verification_reviews_decision',
        ),
        Index(
            'ix_technician_verification_reviews_owner_created',
            'technician_user_id',
            'created_at',
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('technician_profiles.user_id', ondelete='CASCADE'),
        nullable=False,
    )
    reviewer_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('app_users.id', ondelete='RESTRICT'), nullable=False
    )
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


if TYPE_CHECKING:
    from app.models.service_catalog import Service
