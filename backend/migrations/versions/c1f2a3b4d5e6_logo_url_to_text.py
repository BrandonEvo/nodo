"""logo_url to text

Revision ID: c1f2a3b4d5e6
Revises: 04683d9beeee
Create Date: 2026-05-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'c1f2a3b4d5e6'
down_revision = 'e4fa0d8d6a2f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('tenants', 'logo_url',
                    existing_type=sa.VARCHAR(length=1024),
                    type_=sa.Text(),
                    existing_nullable=True)


def downgrade() -> None:
    op.alter_column('tenants', 'logo_url',
                    existing_type=sa.Text(),
                    type_=sa.VARCHAR(length=1024),
                    existing_nullable=True)
