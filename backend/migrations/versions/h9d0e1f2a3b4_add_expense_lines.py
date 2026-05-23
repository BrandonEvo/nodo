"""add expense_lines table

Revision ID: h9d0e1f2a3b4
Revises: g8c9d0e1f2a3
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'g8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'expense_lines',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('category', sa.Enum('operating_expense', 'owner_drawing', 'financing_cost',
                                      name='expensecategory'), nullable=False),
        sa.Column('cost_center', sa.String(length=50), nullable=True),
        sa.Column('concept', sa.String(length=200), nullable=False),
        sa.Column('qty', sa.Numeric(10, 2), nullable=False, server_default='1'),
        sa.Column('unit_cost', sa.Numeric(10, 2), nullable=False),
        sa.Column('month', sa.Date(), nullable=False),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_expense_lines_id', 'expense_lines', ['id'])
    op.create_index('ix_expense_lines_tenant_id', 'expense_lines', ['tenant_id'])
    op.create_index('ix_expense_lines_month', 'expense_lines', ['month'])


def downgrade() -> None:
    op.drop_index('ix_expense_lines_month', 'expense_lines')
    op.drop_index('ix_expense_lines_tenant_id', 'expense_lines')
    op.drop_index('ix_expense_lines_id', 'expense_lines')
    op.drop_table('expense_lines')
    sa.Enum(name='expensecategory').drop(op.get_bind(), checkfirst=True)
