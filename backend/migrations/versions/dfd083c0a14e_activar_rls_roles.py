"""Activar_RLS_Roles

Revision ID: dfd083c0a14e
Revises: 8426775232b3
Create Date: 2026-04-07 04:52:01.839186

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dfd083c0a14e'
down_revision: Union[str, Sequence[str], None] = '8426775232b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Forzar RLS en la tabla
    op.execute("ALTER TABLE roles ENABLE ROW LEVEL SECURITY;")
    
    # 2. Crear la política de aislamiento
    # El 'true' evita crashes si la variable app.current_tenant está vacía (retorna null)
    op.execute("""
        CREATE POLICY tenant_isolation_policy ON roles
            USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
    """)

def downgrade():
    op.execute("DROP POLICY tenant_isolation_policy ON roles;")
    op.execute("ALTER TABLE roles DISABLE ROW LEVEL SECURITY;")