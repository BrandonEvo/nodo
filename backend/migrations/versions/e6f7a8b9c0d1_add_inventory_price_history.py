"""add inventory_price_history table

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-05-17 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'inventory_price_history',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('inventory_item_id', sa.Uuid(), nullable=False),
        sa.Column('unit_cost', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_inventory_price_history_id', 'inventory_price_history', ['id'])
    op.create_index('ix_inventory_price_history_inventory_item_id', 'inventory_price_history', ['inventory_item_id'])
    op.create_index('ix_inventory_price_history_tenant_id', 'inventory_price_history', ['tenant_id'])


def downgrade() -> None:
    op.drop_index('ix_inventory_price_history_tenant_id', 'inventory_price_history')
    op.drop_index('ix_inventory_price_history_inventory_item_id', 'inventory_price_history')
    op.drop_index('ix_inventory_price_history_id', 'inventory_price_history')
    op.drop_table('inventory_price_history')
