"""Application identity, role, profile, and security-audit models."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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


class Role(Base):
    """Server-controlled application role catalog."""

    __tablename__ = 'roles'

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    description: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    assignments: Mapped[list['UserRole']] = relationship(back_populates='role')


class AppUser(Base):
    """Application projection mapped to one external Supabase Auth identity."""

    __tablename__ = 'app_users'
    __table_args__ = (
        UniqueConstraint('auth_issuer', 'auth_subject', name='uq_app_users_auth_identity'),
        CheckConstraint(
            "status IN ('pending', 'active', 'suspended', 'disabled')",
            name='ck_app_users_status',
        ),
        Index('ix_app_users_status', 'status'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    auth_issuer: Mapped[str] = mapped_column(String(512), nullable=False)
    auth_subject: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'pending'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    roles: Mapped[list['UserRole']] = relationship(
        back_populates='user',
        foreign_keys='UserRole.user_id',
        cascade='all, delete-orphan',
    )
    customer_profile: Mapped['CustomerProfile | None'] = relationship(
        back_populates='user',
        cascade='all, delete-orphan',
        uselist=False,
    )
    technician_profile: Mapped['TechnicianProfile | None'] = relationship(
        back_populates='user',
        cascade='all, delete-orphan',
        uselist=False,
    )


class UserRole(Base):
    """A grant from the server-managed role catalog to an application user."""

    __tablename__ = 'user_roles'
    __table_args__ = (Index('ix_user_roles_role_code', 'role_code'),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('app_users.id', ondelete='CASCADE'),
        primary_key=True,
    )
    role_code: Mapped[str] = mapped_column(
        String(32),
        ForeignKey('roles.code', ondelete='RESTRICT'),
        primary_key=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    granted_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('app_users.id', ondelete='SET NULL'),
        nullable=True,
    )

    user: Mapped[AppUser] = relationship(back_populates='roles', foreign_keys=[user_id])
    role: Mapped[Role] = relationship(back_populates='assignments')


class CustomerProfile(Base):
    """Minimal customer-specific profile; authentication remains with Supabase."""

    __tablename__ = 'customer_profiles'

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('app_users.id', ondelete='CASCADE'),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone_e164: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[AppUser] = relationship(back_populates='customer_profile')


class TechnicianProfile(Base):
    """Minimal professional profile; fields are not verification or certification."""

    __tablename__ = 'technician_profiles'
    __table_args__ = (
        CheckConstraint(
            'years_experience IS NULL OR years_experience BETWEEN 0 AND 60',
            name='ck_technician_profiles_experience_range',
        ),
        CheckConstraint(
            "onboarding_status IN ('incomplete', 'complete')",
            name='ck_technician_profiles_onboarding_status',
        ),
        CheckConstraint(
            "verification_status IN ('not_submitted', 'pending_review', 'approved', 'rejected')",
            name='ck_technician_profiles_verification_status',
        ),
        Index('ix_technician_profiles_verification_status', 'verification_status'),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey('app_users.id', ondelete='CASCADE'),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    professional_description: Mapped[str] = mapped_column(Text, nullable=False, default='')
    years_experience: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    onboarding_status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'incomplete'")
    )
    verification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'not_submitted'")
    )
    verification_submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verification_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[AppUser] = relationship(back_populates='technician_profile')


class UserAuditEvent(Base):
    """Append-only record of role/status operations; stores no credentials or PII."""

    __tablename__ = 'user_audit_events'
    __table_args__ = (
        CheckConstraint(
            "action IN ('role.granted', 'role.revoked', 'status.changed')",
            name='ck_user_audit_events_action',
        ),
        Index('ix_user_audit_events_subject_created', 'subject_user_id', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('app_users.id', ondelete='SET NULL'), nullable=True
    )
    subject_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('app_users.id', ondelete='RESTRICT'), nullable=False
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    before_value: Mapped[str | None] = mapped_column(String(64), nullable=True)
    after_value: Mapped[str] = mapped_column(String(64), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
