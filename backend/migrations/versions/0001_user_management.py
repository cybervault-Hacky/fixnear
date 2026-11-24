"""Create the application identity, role, profile, and audit foundation.

Revision ID: 0001_user_management
Revises:
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0001_user_management'
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create application-owned tables and seed only the role catalog."""

    op.create_table(
        'roles',
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('description', sa.String(length=160), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('code', name='pk_roles'),
    )
    role_table = sa.table(
        'roles',
        sa.column('code', sa.String(length=32)),
        sa.column('description', sa.String(length=160)),
    )
    op.bulk_insert(
        role_table,
        [
            {'code': 'customer', 'description': 'Customer application access'},
            {'code': 'technician', 'description': 'Technician application access'},
            {'code': 'admin', 'description': 'Privileged administrative access'},
        ],
    )

    op.create_table(
        'app_users',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('auth_issuer', sa.String(length=512), nullable=False),
        sa.Column('auth_subject', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=True),
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'status',
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'suspended', 'disabled')",
            name='ck_app_users_status',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_app_users'),
        sa.UniqueConstraint(
            'auth_issuer', 'auth_subject', name='uq_app_users_auth_identity'
        ),
    )
    op.create_index('ix_app_users_status', 'app_users', ['status'], unique=False)

    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('role_code', sa.String(length=32), nullable=False),
        sa.Column(
            'granted_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('granted_by', sa.Uuid(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['granted_by'], ['app_users.id'], name='fk_user_roles_granted_by_app_users', ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['role_code'], ['roles.code'], name='fk_user_roles_role_code_roles', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['app_users.id'], name='fk_user_roles_user_id_app_users', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('user_id', 'role_code', name='pk_user_roles'),
    )
    op.create_index('ix_user_roles_role_code', 'user_roles', ['role_code'], unique=False)

    op.create_table(
        'customer_profiles',
        sa.Column('user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('display_name', sa.String(length=120), nullable=False),
        sa.Column('phone_e164', sa.String(length=16), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['app_users.id'], name='fk_customer_profiles_user_id_app_users', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('user_id', name='pk_customer_profiles'),
    )

    op.create_table(
        'technician_profiles',
        sa.Column('user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('display_name', sa.String(length=120), nullable=False),
        sa.Column('professional_description', sa.Text(), server_default='', nullable=False),
        sa.Column('years_experience', sa.SmallInteger(), nullable=True),
        sa.Column(
            'onboarding_status',
            sa.String(length=16),
            server_default=sa.text("'incomplete'"),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            'years_experience IS NULL OR years_experience BETWEEN 0 AND 60',
            name='ck_technician_profiles_experience_range',
        ),
        sa.CheckConstraint(
            "onboarding_status IN ('incomplete', 'complete')",
            name='ck_technician_profiles_onboarding_status',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['app_users.id'], name='fk_technician_profiles_user_id_app_users', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('user_id', name='pk_technician_profiles'),
    )

    op.create_table(
        'user_audit_events',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('actor_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('subject_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('before_value', sa.String(length=64), nullable=True),
        sa.Column('after_value', sa.String(length=64), nullable=False),
        sa.Column('request_id', sa.String(length=128), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action IN ('role.granted', 'role.revoked', 'status.changed')",
            name='ck_user_audit_events_action',
        ),
        sa.ForeignKeyConstraint(
            ['actor_user_id'], ['app_users.id'], name='fk_user_audit_events_actor_user_id_app_users', ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['subject_user_id'], ['app_users.id'], name='fk_user_audit_events_subject_user_id_app_users', ondelete='RESTRICT'
        ),
        sa.PrimaryKeyConstraint('id', name='pk_user_audit_events'),
    )
    op.create_index(
        'ix_user_audit_events_subject_created',
        'user_audit_events',
        ['subject_user_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    """Remove application-owned tables in foreign-key-safe order."""

    op.drop_index('ix_user_audit_events_subject_created', table_name='user_audit_events')
    op.drop_table('user_audit_events')
    op.drop_table('technician_profiles')
    op.drop_table('customer_profiles')
    op.drop_index('ix_user_roles_role_code', table_name='user_roles')
    op.drop_table('user_roles')
    op.drop_index('ix_app_users_status', table_name='app_users')
    op.drop_table('app_users')
    op.drop_table('roles')
