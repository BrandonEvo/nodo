"""merge heads and add production daily fields

Revision ID: i0e1f2a3b4c5
Revises: 99edafcf2e08, h9d0e1f2a3b4
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = ('99edafcf2e08', 'h9d0e1f2a3b4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('production_orders', sa.Column('harina_lbs', sa.Numeric(10, 2), nullable=True))
    op.add_column('production_orders', sa.Column('costo_produccion', sa.Numeric(10, 2), nullable=True))
    op.add_column('production_orders', sa.Column('venta_esperada', sa.Numeric(10, 2), nullable=True))
    op.add_column('production_orders', sa.Column('utilidad_diaria', sa.Numeric(10, 2), nullable=True))
    op.add_column('production_orders', sa.Column('production_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('production_orders', 'production_date')
    op.drop_column('production_orders', 'utilidad_diaria')
    op.drop_column('production_orders', 'venta_esperada')
    op.drop_column('production_orders', 'costo_produccion')
    op.drop_column('production_orders', 'harina_lbs')
