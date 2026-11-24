"""Add customer bookings, assignment history, PriceLock quotes, and idempotency.

Revision ID: 0004_booking_pricelock
Revises: 0003_service_catalog_audit
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0004_booking_pricelock'
down_revision: str | None = '0003_service_catalog_audit'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create additive booking and quotation tables with private ownership FKs."""

    op.create_table(
        'customer_addresses',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('customer_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('label', sa.String(length=40), nullable=False),
        sa.Column('recipient_name', sa.String(length=120), nullable=False),
        sa.Column('address_line1', sa.String(length=200), nullable=False),
        sa.Column('address_line2', sa.String(length=200), nullable=True),
        sa.Column('locality', sa.String(length=120), nullable=False),
        sa.Column('city', sa.String(length=120), nullable=False),
        sa.Column('state', sa.String(length=120), nullable=False),
        sa.Column('postal_code', sa.String(length=12), nullable=False),
        sa.Column('contact_phone', sa.String(length=16), nullable=True),
        sa.Column('is_default', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('length(trim(label)) > 0', name='ck_customer_addresses_label_nonempty'),
        sa.CheckConstraint(
            'length(trim(address_line1)) > 0', name='ck_customer_addresses_line1_nonempty'
        ),
        sa.ForeignKeyConstraint(
            ['customer_user_id'],
            ['customer_profiles.user_id'],
            name='fk_customer_addresses_customer_user_id_customer_profiles',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_customer_addresses'),
    )
    op.create_index(
        'ix_customer_addresses_owner_updated',
        'customer_addresses',
        ['customer_user_id', 'updated_at'],
        unique=False,
    )

    op.create_table(
        'bookings',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('customer_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('service_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('service_slug_snapshot', sa.String(length=80), nullable=False),
        sa.Column('service_title_snapshot', sa.String(length=160), nullable=False),
        sa.Column('saved_address_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('address_label', sa.String(length=40), nullable=False),
        sa.Column('recipient_name', sa.String(length=120), nullable=False),
        sa.Column('address_line1', sa.String(length=200), nullable=False),
        sa.Column('address_line2', sa.String(length=200), nullable=True),
        sa.Column('locality', sa.String(length=120), nullable=False),
        sa.Column('city', sa.String(length=120), nullable=False),
        sa.Column('state', sa.String(length=120), nullable=False),
        sa.Column('postal_code', sa.String(length=12), nullable=False),
        sa.Column('contact_phone', sa.String(length=16), nullable=True),
        sa.Column('problem_description', sa.Text(), nullable=False),
        sa.Column('preferred_date', sa.Date(), nullable=False),
        sa.Column('preferred_start', sa.Time(), nullable=False),
        sa.Column('preferred_end', sa.Time(), nullable=False),
        sa.Column('timezone_name', sa.String(length=64), server_default=sa.text("'Asia/Kolkata'"), nullable=False),
        sa.Column('status', sa.String(length=32), server_default=sa.text("'requested'"), nullable=False),
        sa.Column('assigned_technician_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('escalation_status', sa.String(length=16), server_default=sa.text("'normal'"), nullable=False),
        sa.Column('escalation_reason', sa.Text(), nullable=True),
        sa.Column('escalation_updated_by_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('escalation_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancellation_reason', sa.Text(), nullable=True),
        sa.Column('cancelled_by_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False),
        sa.Column('event_sequence', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('requested', 'assigned', 'accepted', 'inspection_pending', "
            "'quote_pending', 'quote_rejected', 'approved', 'in_progress', 'completed', 'cancelled')",
            name='ck_bookings_status',
        ),
        sa.CheckConstraint(
            "escalation_status IN ('normal', 'escalated', 'resolved')",
            name='ck_bookings_escalation_status',
        ),
        sa.CheckConstraint('preferred_start < preferred_end', name='ck_bookings_preferred_window'),
        sa.CheckConstraint('version >= 1', name='ck_bookings_version_positive'),
        sa.CheckConstraint('event_sequence >= 0', name='ck_bookings_event_sequence_nonnegative'),
        sa.ForeignKeyConstraint(
            ['customer_user_id'],
            ['customer_profiles.user_id'],
            name='fk_bookings_customer_user_id_customer_profiles',
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['service_id'], ['services.id'], name='fk_bookings_service_id_services', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['saved_address_id'],
            ['customer_addresses.id'],
            name='fk_bookings_saved_address_id_customer_addresses',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['assigned_technician_user_id'],
            ['technician_profiles.user_id'],
            name='fk_bookings_assigned_technician_technician_profiles',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['escalation_updated_by_user_id'],
            ['app_users.id'],
            name='fk_bookings_escalation_actor_app_users',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['cancelled_by_user_id'],
            ['app_users.id'],
            name='fk_bookings_cancelled_by_app_users',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_bookings'),
    )
    op.create_index('ix_bookings_customer_created', 'bookings', ['customer_user_id', 'created_at'])
    op.create_index('ix_bookings_status_requested', 'bookings', ['status', 'preferred_date'])
    op.create_index(
        'ix_bookings_technician_status',
        'bookings',
        ['assigned_technician_user_id', 'status'],
    )
    op.create_index('ix_bookings_service_status', 'bookings', ['service_id', 'status'])
    op.create_index('ix_bookings_escalation_created', 'bookings', ['escalation_status', 'created_at'])

    op.create_table(
        'booking_quotes',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('booking_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=16), server_default=sa.text("'pending'"), nullable=False),
        sa.Column('is_current', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('currency', sa.String(length=3), server_default=sa.text("'INR'"), nullable=False),
        sa.Column('total_paise', sa.BigInteger(), nullable=False),
        sa.Column('technician_notes', sa.Text(), nullable=True),
        sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('decision_by_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decision_note', sa.String(length=1000), nullable=True),
        sa.CheckConstraint('version >= 1', name='ck_booking_quotes_version_positive'),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'superseded', 'expired')",
            name='ck_booking_quotes_status',
        ),
        sa.CheckConstraint('total_paise >= 0', name='ck_booking_quotes_total_nonnegative'),
        sa.ForeignKeyConstraint(
            ['booking_id'], ['bookings.id'], name='fk_booking_quotes_booking_id_bookings', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['created_by_user_id'],
            ['app_users.id'],
            name='fk_booking_quotes_created_by_app_users',
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['decision_by_user_id'],
            ['app_users.id'],
            name='fk_booking_quotes_decision_by_app_users',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_booking_quotes'),
        sa.UniqueConstraint('booking_id', 'version', name='uq_booking_quotes_version'),
    )
    op.create_index('ix_booking_quotes_booking_created', 'booking_quotes', ['booking_id', 'issued_at'])
    op.create_index(
        'uq_booking_quotes_current',
        'booking_quotes',
        ['booking_id'],
        unique=True,
        sqlite_where=sa.text('is_current = 1'),
        postgresql_where=sa.text('is_current = true'),
    )

    op.create_table(
        'booking_quote_line_items',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('quote_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('line_type', sa.String(length=24), nullable=False),
        sa.Column('description', sa.String(length=240), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_amount_paise', sa.BigInteger(), nullable=False),
        sa.Column('line_total_paise', sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "line_type IN ('inspection', 'labour', 'part', 'additional_fee', 'tax')",
            name='ck_booking_quote_line_items_type',
        ),
        sa.CheckConstraint('quantity BETWEEN 1 AND 10000', name='ck_booking_quote_line_items_quantity'),
        sa.CheckConstraint('unit_amount_paise >= 0', name='ck_booking_quote_line_items_unit_nonnegative'),
        sa.CheckConstraint('line_total_paise >= 0', name='ck_booking_quote_line_items_total_nonnegative'),
        sa.ForeignKeyConstraint(
            ['quote_id'],
            ['booking_quotes.id'],
            name='fk_booking_quote_line_items_quote_id_booking_quotes',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_booking_quote_line_items'),
    )
    op.create_index(
        'ix_booking_quote_line_items_quote_position',
        'booking_quote_line_items',
        ['quote_id', 'position'],
    )

    op.create_table(
        'booking_events',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('booking_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('actor_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('target_user_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('event_type', sa.String(length=48), nullable=False),
        sa.Column('from_status', sa.String(length=32), nullable=True),
        sa.Column('to_status', sa.String(length=32), nullable=True),
        sa.Column('reference_id', sa.Uuid(as_uuid=True), nullable=True),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column('is_internal', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ['booking_id'], ['bookings.id'], name='fk_booking_events_booking_id_bookings', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['actor_user_id'], ['app_users.id'], name='fk_booking_events_actor_app_users', ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['target_user_id'], ['app_users.id'], name='fk_booking_events_target_app_users', ondelete='SET NULL'
        ),
        sa.PrimaryKeyConstraint('id', name='pk_booking_events'),
        sa.UniqueConstraint('booking_id', 'sequence', name='uq_booking_events_sequence'),
    )
    op.create_index('ix_booking_events_booking_created', 'booking_events', ['booking_id', 'sequence'])
    op.create_index('ix_booking_events_actor_created', 'booking_events', ['actor_user_id', 'created_at'])

    op.create_table(
        'booking_attachments',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('booking_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('uploaded_by_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=120), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=24), server_default=sa.text("'pending_upload'"), nullable=False),
        sa.Column('storage_provider', sa.String(length=40), nullable=True),
        sa.Column('storage_key', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending_upload', 'uploaded', 'failed')",
            name='ck_booking_attachments_status',
        ),
        sa.CheckConstraint('size_bytes BETWEEN 1 AND 20000000', name='ck_booking_attachments_size'),
        sa.ForeignKeyConstraint(
            ['booking_id'], ['bookings.id'], name='fk_booking_attachments_booking_id_bookings', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['uploaded_by_user_id'],
            ['app_users.id'],
            name='fk_booking_attachments_uploaded_by_app_users',
            ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_booking_attachments'),
    )
    op.create_index(
        'ix_booking_attachments_booking_created',
        'booking_attachments',
        ['booking_id', 'created_at'],
    )

    op.create_table(
        'mutation_idempotency',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('actor_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('operation', sa.String(length=64), nullable=False),
        sa.Column('key', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('resource_type', sa.String(length=32), nullable=False),
        sa.Column('resource_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ['actor_user_id'], ['app_users.id'], name='fk_mutation_idempotency_actor_app_users', ondelete='RESTRICT'
        ),
        sa.PrimaryKeyConstraint('id', name='pk_mutation_idempotency'),
        sa.UniqueConstraint(
            'actor_user_id', 'operation', 'key', name='uq_mutation_idempotency_actor_operation_key'
        ),
    )
    op.create_index('ix_mutation_idempotency_created', 'mutation_idempotency', ['created_at'])


def downgrade() -> None:
    """Drop Phase 8 tables without modifying the Phase 1–7 schema."""

    op.drop_index('ix_mutation_idempotency_created', table_name='mutation_idempotency')
    op.drop_table('mutation_idempotency')
    op.drop_index('ix_booking_attachments_booking_created', table_name='booking_attachments')
    op.drop_table('booking_attachments')
    op.drop_index('ix_booking_events_actor_created', table_name='booking_events')
    op.drop_index('ix_booking_events_booking_created', table_name='booking_events')
    op.drop_table('booking_events')
    op.drop_index('ix_booking_quote_line_items_quote_position', table_name='booking_quote_line_items')
    op.drop_table('booking_quote_line_items')
    op.drop_index('uq_booking_quotes_current', table_name='booking_quotes')
    op.drop_index('ix_booking_quotes_booking_created', table_name='booking_quotes')
    op.drop_table('booking_quotes')
    op.drop_index('ix_bookings_escalation_created', table_name='bookings')
    op.drop_index('ix_bookings_service_status', table_name='bookings')
    op.drop_index('ix_bookings_technician_status', table_name='bookings')
    op.drop_index('ix_bookings_status_requested', table_name='bookings')
    op.drop_index('ix_bookings_customer_created', table_name='bookings')
    op.drop_table('bookings')
    op.drop_index('ix_customer_addresses_owner_updated', table_name='customer_addresses')
    op.drop_table('customer_addresses')
