"""add icon to module

Revision ID: r9n0o1p2q3r4
Revises: q8m9n0o1p2q3
Create Date: 2026-05-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'r9n0o1p2q3r4'
down_revision = 'q8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('modules', sa.Column('icon', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('modules', 'icon')
