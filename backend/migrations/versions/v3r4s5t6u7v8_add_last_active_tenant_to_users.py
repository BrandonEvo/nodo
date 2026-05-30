"""add last_active_tenant_id to users

Revision ID: v3r4s5t6u7v8
Revises: u2q3r4s5t6u7
Create Date: 2026-05-26

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = 'v3r4s5t6u7v8'
down_revision = 'u2q3r4s5t6u7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'last_active_tenant_id',
            sa.UUID(),
            sa.ForeignKey('tenants.id'),
            nullable=True,
        )
    )
    op.create_index('ix_users_last_active_tenant_id', 'users', ['last_active_tenant_id'])


def downgrade() -> None:
    op.drop_index('ix_users_last_active_tenant_id', table_name='users')
    op.drop_column('users', 'last_active_tenant_id')
