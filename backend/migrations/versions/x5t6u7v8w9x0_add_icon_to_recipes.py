"""add icon to recipes

Revision ID: x5t6u7v8w9x0
Revises: w4s5t6u7v8w9
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'x5t6u7v8w9x0'
down_revision = 'w4s5t6u7v8w9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('recipes', sa.Column('icon', sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column('recipes', 'icon')
