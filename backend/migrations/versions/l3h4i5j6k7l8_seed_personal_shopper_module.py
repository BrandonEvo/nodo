"""seed personal shopper module and assign to Charlies Bakerys

Revision ID: l3h4i5j6k7l8
Revises: k2g3h4i5j6k7
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'l3h4i5j6k7l8'
down_revision: Union[str, Sequence[str], None] = 'k2g3h4i5j6k7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = 'PERSONAL_SHOPPER'
MODULE_NAME  = 'Personal Shopper'
MODULE_DESC  = 'Gestión de pedidos personalizados: solicitudes de clientes, cotizaciones, estado de pedido y entrega'
MODULE_ROUTE = 'personal-shopper'


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', false, true, '{MODULE_ROUTE}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)

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
