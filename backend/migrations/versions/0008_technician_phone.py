"""Add a private technician contact phone.

Revision ID: 0008_technician_phone
Revises: 0007_operations
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0008_technician_phone'
down_revision: str | None = '0007_operations'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('technician_profiles', sa.Column('phone_e164', sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column('technician_profiles', 'phone_e164')
