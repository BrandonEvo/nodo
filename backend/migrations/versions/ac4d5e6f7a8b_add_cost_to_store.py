"""add cost to store products and unit_cost snapshot to order items

Revision ID: ac4d5e6f7a8b
Revises: ab2c3d4e5f6a
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'ac4d5e6f7a8b'
down_revision: Union[str, Sequence[str], None] = 'ab2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('store_products',
                  sa.Column('cost', sa.Numeric(12, 2), nullable=False, server_default='0'))
    # Snapshot del costo al momento de la venta — el costo del producto puede cambiar después
    op.add_column('store_order_items',
                  sa.Column('unit_cost', sa.Numeric(12, 2), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('store_order_items', 'unit_cost')
    op.drop_column('store_products', 'cost')
