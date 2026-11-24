"""Add append-only audit metadata for privileged catalog changes.

Revision ID: 0003_service_catalog_audit
Revises: 0002_service_technician
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003_service_catalog_audit'
down_revision: str | None = '0002_service_technician'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create an append-only record of admin catalog mutations."""

    op.create_table(
        'service_catalog_audit_events',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column(
            'actor_user_id',
            sa.Uuid(as_uuid=True),
            nullable=True,
        ),
        sa.Column('entity_type', sa.String(length=16), nullable=False),
        sa.Column('entity_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(length=16), nullable=False),
        sa.Column(
            'changed_fields',
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "entity_type IN ('category', 'service')",
            name='ck_service_catalog_audit_entity_type',
        ),
        sa.CheckConstraint(
            "action IN ('created', 'updated', 'activated', 'deactivated')",
            name='ck_service_catalog_audit_action',
        ),
        sa.ForeignKeyConstraint(
            ['actor_user_id'],
            ['app_users.id'],
            name='fk_service_catalog_audit_actor_user_id_app_users',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_service_catalog_audit_events'),
    )
    op.create_index(
        'ix_service_catalog_audit_actor_created',
        'service_catalog_audit_events',
        ['actor_user_id', 'created_at'],
        unique=False,
    )
    op.create_index(
        'ix_service_catalog_audit_entity_created',
        'service_catalog_audit_events',
        ['entity_type', 'entity_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    """Remove only the catalog audit table added by this revision."""

    op.drop_index(
        'ix_service_catalog_audit_entity_created',
        table_name='service_catalog_audit_events',
    )
    op.drop_index(
        'ix_service_catalog_audit_actor_created',
        table_name='service_catalog_audit_events',
    )
    op.drop_table('service_catalog_audit_events')
