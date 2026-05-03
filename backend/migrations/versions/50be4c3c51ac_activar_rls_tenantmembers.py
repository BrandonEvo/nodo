"""Activar_RLS_TenantMembers

Revision ID: 50be4c3c51ac
Revises: dfd083c0a14e
Create Date: 2026-04-08 02:30:20.289345

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '50be4c3c51ac'
down_revision: Union[str, Sequence[str], None] = 'dfd083c0a14e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY tenant_isolation_policy ON tenant_members
            USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
    """)

def downgrade():
    op.execute("DROP POLICY tenant_isolation_policy ON tenant_members;")
    op.execute("ALTER TABLE tenant_members DISABLE ROW LEVEL SECURITY;")