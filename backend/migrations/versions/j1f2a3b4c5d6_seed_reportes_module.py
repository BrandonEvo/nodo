"""seed reportes module and assign to Charlies Bakerys

Revision ID: j1f2a3b4c5d6
Revises: i0e1f2a3b4c5
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'j1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'i0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = 'REPORTES'
MODULE_NAME  = 'Reportes Financieros'
MODULE_DESC  = 'Dashboard mensual con P&L completo, utilidad operativa y utilidad neta'
MODULE_ROUTE = 'reportes'


def upgrade() -> None:
    # 1. Registrar el módulo si no existe
    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', true, true, '{MODULE_ROUTE}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)

    # 2. Asignar a Charlies Bakerys vía subscriptions
    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(),
               t.id,
               m.id,
               'active',
               NOW(), true, NOW(), NOW()
        FROM tenants t, modules m
        WHERE t.name = 'Charlies Bakerys'
          AND m.code = '{MODULE_CODE}'
          AND NOT EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.tenant_id = t.id AND s.module_id = m.id
          )
    """)


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM subscriptions
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
    op.execute(f"DELETE FROM modules WHERE code = '{MODULE_CODE}'")
