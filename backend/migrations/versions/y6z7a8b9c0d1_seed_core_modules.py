"""seed core modules (calc, bodega, cocina, mostrador, cierre, recetas)

Revision ID: y6z7a8b9c0d1
Revises: x5t6u7v8w9x0
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'y6z7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'x5t6u7v8w9x0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Módulos base que ya tenían componente en el frontend (apps/index.ts)
# pero no estaban registrados en la tabla `modules`. Son gratuitos y se
# activan para todos los tenants existentes.
CORE_MODULES = [
    ('CALC',      'Calculadora de Costos', 'Cálculo de costos y precios de venta por producto',        'calc',      'calculator'),
    ('BODEGA',    'Bodega',                'Stock, materias primas y control de inventario',           'bodega',    'warehouse'),
    ('COCINA',    'Cocina',                'Producción diaria, planes de horneado y mermas',           'cocina',    'chef-hat'),
    ('MOSTRADOR', 'Mostrador',             'Punto de venta y registro de ventas en mostrador',         'mostrador', 'store'),
    ('CIERRE',    'Cierre de Caja',        'Cierre diario de caja y arqueo de efectivo',               'cierre',    'dollar-sign'),
    ('RECETAS',   'Recetas',               'Fichas técnicas, escandallos y costeo de recetas',         'recetas',   'book-open'),
]


def upgrade() -> None:
    for code, name, desc, route, icon in CORE_MODULES:
        # 1. Registrar el módulo si no existe
        op.execute(f"""
            INSERT INTO modules (id, code, name, description, is_premium, is_active,
                                 frontend_route, icon, created_at, updated_at)
            SELECT gen_random_uuid(), '{code}', '{name}',
                   '{desc}', false, true, '{route}', '{icon}',
                   NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{code}')
        """)

        # 2. Activar el módulo en todos los tenants existentes vía subscriptions
        op.execute(f"""
            INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                       is_active, created_at, updated_at)
            SELECT gen_random_uuid(), t.id, m.id, 'active', NOW(), true, NOW(), NOW()
            FROM tenants t, modules m
            WHERE m.code = '{code}'
              AND NOT EXISTS (
                  SELECT 1 FROM subscriptions s
                  WHERE s.tenant_id = t.id AND s.module_id = m.id
              )
        """)


def downgrade() -> None:
    for code, *_ in CORE_MODULES:
        op.execute(f"""
            DELETE FROM subscriptions
            WHERE module_id = (SELECT id FROM modules WHERE code = '{code}')
        """)
        op.execute(f"DELETE FROM modules WHERE code = '{code}'")
