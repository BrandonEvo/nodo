"""add tracking_status and tracking_note to shopper_orders

Revision ID: n5j6k7l8m9n0
Revises: m4i5j6k7l8m9
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'n5j6k7l8m9n0'
down_revision = 'm4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('shopper_orders', sa.Column('tracking_status', sa.String(40), nullable=True))
    op.add_column('shopper_orders', sa.Column('tracking_note', sa.String(300), nullable=True))
    op.add_column('shopper_orders', sa.Column('tracking_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('shopper_orders', 'tracking_updated_at')
    op.drop_column('shopper_orders', 'tracking_note')
    op.drop_column('shopper_orders', 'tracking_status')
