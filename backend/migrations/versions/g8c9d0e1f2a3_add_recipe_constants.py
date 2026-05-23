"""add recipe_constants table

Revision ID: g8c9d0e1f2a3
Revises: f7b8c9d0e1f2
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'f7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recipe_constants',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('constant_key', sa.String(length=50), nullable=False),
        sa.Column('value', sa.Numeric(10, 4), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'constant_key', 'effective_from',
                            name='uq_recipe_constants_tenant_key_date'),
    )
    op.create_index('ix_recipe_constants_id', 'recipe_constants', ['id'])
    op.create_index('ix_recipe_constants_tenant_id', 'recipe_constants', ['tenant_id'])
    op.create_index('ix_recipe_constants_constant_key', 'recipe_constants', ['constant_key'])


def downgrade() -> None:
    op.drop_index('ix_recipe_constants_constant_key', 'recipe_constants')
    op.drop_index('ix_recipe_constants_tenant_id', 'recipe_constants')
    op.drop_index('ix_recipe_constants_id', 'recipe_constants')
    op.drop_table('recipe_constants')
