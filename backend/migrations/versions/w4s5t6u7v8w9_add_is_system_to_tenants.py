"""add is_system to tenants

Revision ID: w4s5t6u7v8w9
Revises: v3r4s5t6u7v8
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'w4s5t6u7v8w9'
down_revision = 'v3r4s5t6u7v8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'))

    # Marcar el tenant más antiguo del sistema como protegido.
    # Este es el tenant Nodo creado durante el setup inicial.
    op.execute("""
        UPDATE tenants
        SET is_system = TRUE
        WHERE id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
    """)


def downgrade() -> None:
    op.drop_column('tenants', 'is_system')
