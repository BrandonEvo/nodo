"""add tracking_token to shopper_orders

Revision ID: o6k7l8m9n0o1
Revises: n5j6k7l8m9n0
Create Date: 2026-05-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'o6k7l8m9n0o1'
down_revision = 'n5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'shopper_orders',
        sa.Column('tracking_token', sa.UUID(), nullable=True),
    )
    # Rellenar tokens para filas existentes
    op.execute(
        "UPDATE shopper_orders SET tracking_token = gen_random_uuid() WHERE tracking_token IS NULL"
    )
    # Hacer NOT NULL y unique
    op.alter_column('shopper_orders', 'tracking_token', nullable=False)
    op.create_index('ix_shopper_orders_tracking_token', 'shopper_orders', ['tracking_token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_shopper_orders_tracking_token', table_name='shopper_orders')
    op.drop_column('shopper_orders', 'tracking_token')
