"""add last_unit_cost to inventory_items

Revision ID: a2b3c4d5e6f7
Revises: e5f6a7b8c9d0, e4fa0d8d6a2f
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = ('e5f6a7b8c9d0', 'e4fa0d8d6a2f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'inventory_items',
        sa.Column('last_unit_cost', sa.Float(), nullable=False, server_default='0.0'),
    )


def downgrade() -> None:
    op.drop_column('inventory_items', 'last_unit_cost')
