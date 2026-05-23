"""add stock_movements table

Revision ID: f7b8c9d0e1f2
Revises: e6f7a8b9c0d1
Create Date: 2026-05-17 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'stock_movements',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('inventory_item_id', sa.Uuid(), nullable=False),
        sa.Column('move_type', sa.String(length=20), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit_cost', sa.Float(), nullable=True),
        sa.Column('stock_after', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_stock_movements_id', 'stock_movements', ['id'])
    op.create_index('ix_stock_movements_inventory_item_id', 'stock_movements', ['inventory_item_id'])
    op.create_index('ix_stock_movements_tenant_id', 'stock_movements', ['tenant_id'])


def downgrade() -> None:
    op.drop_index('ix_stock_movements_tenant_id', 'stock_movements')
    op.drop_index('ix_stock_movements_inventory_item_id', 'stock_movements')
    op.drop_index('ix_stock_movements_id', 'stock_movements')
    op.drop_table('stock_movements')
