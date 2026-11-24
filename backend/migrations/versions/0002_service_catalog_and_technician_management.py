"""Add managed service catalog and private technician management.

Revision ID: 0002_service_technician
Revises: 0001_user_management
Create Date: 2026-11-23
"""

import json
from collections.abc import Sequence
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op

revision: str = '0002_service_technician'
down_revision: str | None = '0001_user_management'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_SEED_NAMESPACE = uuid5(NAMESPACE_URL, 'https://fixnear.example/service-catalog/v1')


def _seed_rows() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Read the immutable migration snapshot copied from the six existing guides."""

    seed_file = Path(__file__).with_name('service_catalog_seed.json')
    services = json.loads(seed_file.read_text(encoding='utf-8'))
    category_ids = {
        'appliance-repair': uuid5(_SEED_NAMESPACE, 'category:appliance-repair'),
        'home-systems': uuid5(_SEED_NAMESPACE, 'category:home-systems'),
    }
    categories = [
        {
            'id': category_ids['appliance-repair'],
            'slug': 'appliance-repair',
            'title': 'Appliance repair',
            'description': 'Guides for common household appliance repair concerns.',
            'display_order': 0,
            'is_active': True,
        },
        {
            'id': category_ids['home-systems'],
            'slug': 'home-systems',
            'title': 'Home systems',
            'description': 'Guides for common household electrical and plumbing concerns.',
            'display_order': 1,
            'is_active': True,
        },
    ]
    service_rows = []
    for order, service in enumerate(services):
        slug = service['slug']
        category_slug = service.pop('category_slug')
        service_rows.append(
            {
                **service,
                'id': uuid5(_SEED_NAMESPACE, f'service:{slug}'),
                'category_id': category_ids[category_slug],
                'display_order': order,
                'is_active': True,
            }
        )
    return categories, service_rows


def _sql_literal(value: object) -> str:
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert_service_seed_rows(rows: list[dict[str, object]]) -> None:
    """Insert JSON seed values as SQL literals so offline PostgreSQL DDL compiles."""

    columns = (
        'id',
        'category_id',
        'slug',
        'title',
        'home_title',
        'home_description',
        'description',
        'listing_description',
        'keywords',
        'common_problems',
        'inspection_scope',
        'questions',
        'related_service_slugs',
        'display_order',
        'is_active',
    )
    json_columns = {
        'keywords',
        'common_problems',
        'inspection_scope',
        'questions',
        'related_service_slugs',
    }
    for row in rows:
        values = []
        for column in columns:
            value = row[column]
            if column in json_columns:
                value = json.dumps(value, ensure_ascii=False)
            values.append(_sql_literal(value))
        op.execute(
            f"INSERT INTO services ({', '.join(columns)}) "
            f"VALUES ({', '.join(values)})"
        )


def upgrade() -> None:
    """Create service catalog and technician management tables additively."""

    op.create_table(
        'service_categories',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(length=80), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('display_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint('display_order >= 0', name='ck_service_categories_display_order'),
        sa.PrimaryKeyConstraint('id', name='pk_service_categories'),
        sa.UniqueConstraint('slug', name='uq_service_categories_slug'),
    )
    op.create_index(
        'ix_service_categories_active_order',
        'service_categories',
        ['is_active', 'display_order'],
        unique=False,
    )

    op.create_table(
        'services',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('category_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(length=80), nullable=False),
        sa.Column('title', sa.String(length=160), nullable=False),
        sa.Column('home_title', sa.String(length=120), nullable=False),
        sa.Column('home_description', sa.String(length=240), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('listing_description', sa.String(length=500), nullable=False),
        sa.Column('keywords', sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('common_problems', sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('inspection_scope', sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('questions', sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column(
            'related_service_slugs', sa.JSON(), server_default=sa.text("'[]'"), nullable=False
        ),
        sa.Column('display_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint('display_order >= 0', name='ck_services_display_order'),
        sa.ForeignKeyConstraint(
            ['category_id'],
            ['service_categories.id'],
            name='fk_services_category_id_service_categories',
            ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_services'),
        sa.UniqueConstraint('slug', name='uq_services_slug'),
    )
    op.create_index(
        'ix_services_category_active_order',
        'services',
        ['category_id', 'is_active', 'display_order'],
        unique=False,
    )
    op.create_index(
        'ix_services_active_order', 'services', ['is_active', 'display_order'], unique=False
    )

    categories_table = sa.table(
        'service_categories',
        sa.column('id', sa.Uuid(as_uuid=True)),
        sa.column('slug', sa.String(length=80)),
        sa.column('title', sa.String(length=120)),
        sa.column('description', sa.Text()),
        sa.column('display_order', sa.Integer()),
        sa.column('is_active', sa.Boolean()),
    )
    categories, service_rows = _seed_rows()
    op.bulk_insert(categories_table, categories)
    _insert_service_seed_rows(service_rows)

    with op.batch_alter_table('technician_profiles') as batch_op:
        batch_op.add_column(
            sa.Column(
                'verification_status',
                sa.String(length=20),
                server_default=sa.text("'not_submitted'"),
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column('verification_submitted_at', sa.DateTime(timezone=True)))
        batch_op.add_column(sa.Column('verification_reviewed_at', sa.DateTime(timezone=True)))
        batch_op.create_check_constraint(
            'ck_technician_profiles_verification_status',
            "verification_status IN ('not_submitted', 'pending_review', 'approved', 'rejected')",
        )
        batch_op.create_index(
            'ix_technician_profiles_verification_status', ['verification_status'], unique=False
        )

    op.create_table(
        'technician_skills',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('technician_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('service_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('years_experience', sa.SmallInteger(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            'years_experience IS NULL OR years_experience BETWEEN 0 AND 60',
            name='ck_technician_skills_experience_range',
        ),
        sa.ForeignKeyConstraint(
            ['service_id'], ['services.id'], name='fk_technician_skills_service_id_services', ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['technician_user_id'],
            ['technician_profiles.user_id'],
            name='fk_technician_skills_technician_user_id_technician_profiles',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_technician_skills'),
        sa.UniqueConstraint(
            'technician_user_id', 'service_id', name='uq_technician_skills_owner_service'
        ),
    )
    op.create_index('ix_technician_skills_service', 'technician_skills', ['service_id'])

    op.create_table(
        'technician_coverage_areas',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('technician_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('area_name', sa.String(length=120), nullable=False),
        sa.Column('area_key', sa.String(length=260), nullable=False),
        sa.Column('city', sa.String(length=120), nullable=False),
        sa.Column('state', sa.String(length=120), nullable=False),
        sa.Column('postal_code', sa.String(length=12), server_default='', nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ['technician_user_id'],
            ['technician_profiles.user_id'],
            name='fk_tech_coverage_profile',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_technician_coverage_areas'),
        sa.UniqueConstraint(
            'technician_user_id', 'area_key', name='uq_technician_coverage_owner_area'
        ),
    )
    op.create_index(
        'ix_technician_coverage_owner',
        'technician_coverage_areas',
        ['technician_user_id'],
        unique=False,
    )

    op.create_table(
        'technician_availability_preferences',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('technician_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column(
            'timezone_name',
            sa.String(length=64),
            server_default=sa.text("'Asia/Kolkata'"),
            nullable=False,
        ),
        sa.Column('weekly_schedule', sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ['technician_user_id'],
            ['technician_profiles.user_id'],
            name='fk_tech_availability_profile',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_technician_availability_preferences'),
        sa.UniqueConstraint(
            'technician_user_id', name='uq_technician_availability_owner'
        ),
    )

    op.create_table(
        'technician_verification_reviews',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('technician_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('reviewer_user_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('decision', sa.String(length=16), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "decision IN ('approved', 'rejected')",
            name='ck_technician_verification_reviews_decision',
        ),
        sa.ForeignKeyConstraint(
            ['reviewer_user_id'],
            ['app_users.id'],
            name='fk_technician_verification_reviews_reviewer_user_id_app_users',
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['technician_user_id'],
            ['technician_profiles.user_id'],
            name='fk_tech_reviews_profile',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_technician_verification_reviews'),
    )
    op.create_index(
        'ix_technician_verification_reviews_owner_created',
        'technician_verification_reviews',
        ['technician_user_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    """Remove only Phase 7 tables and columns, leaving the Phase 6 schema intact."""

    op.drop_index(
        'ix_technician_verification_reviews_owner_created',
        table_name='technician_verification_reviews',
    )
    op.drop_table('technician_verification_reviews')
    op.drop_table('technician_availability_preferences')
    op.drop_index('ix_technician_coverage_owner', table_name='technician_coverage_areas')
    op.drop_table('technician_coverage_areas')
    op.drop_index('ix_technician_skills_service', table_name='technician_skills')
    op.drop_table('technician_skills')

    with op.batch_alter_table('technician_profiles') as batch_op:
        batch_op.drop_index('ix_technician_profiles_verification_status')
        batch_op.drop_constraint(
            'ck_technician_profiles_verification_status', type_='check'
        )
        batch_op.drop_column('verification_reviewed_at')
        batch_op.drop_column('verification_submitted_at')
        batch_op.drop_column('verification_status')

    op.drop_index('ix_services_active_order', table_name='services')
    op.drop_index('ix_services_category_active_order', table_name='services')
    op.drop_table('services')
    op.drop_index('ix_service_categories_active_order', table_name='service_categories')
    op.drop_table('service_categories')
