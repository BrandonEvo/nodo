"""add recipe book fields to recipes

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-05-17 00:02:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recipes', sa.Column('description', sa.String(500), nullable=True))
    op.add_column('recipes', sa.Column('instructions', sa.Text(), nullable=True))
    op.add_column('recipes', sa.Column('bake_temp', sa.Float(), nullable=True))
    op.add_column('recipes', sa.Column('bake_time', sa.Integer(), nullable=True))
    op.add_column('recipes', sa.Column('difficulty', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('recipes', 'difficulty')
    op.drop_column('recipes', 'bake_time')
    op.drop_column('recipes', 'bake_temp')
    op.drop_column('recipes', 'instructions')
    op.drop_column('recipes', 'description')
