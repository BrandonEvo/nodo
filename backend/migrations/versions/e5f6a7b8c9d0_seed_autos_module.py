"""seed_autos_module — Registra el módulo Importación de Vehículos USA

Revision ID: e5f6a7b8c9d0
Revises: d1e2f3a4b5c6
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = 'AUTOS'
MODULE_NAME  = 'Importación de Vehículos'
MODULE_DESC  = 'Calculadora de costos de importación de vehículos desde USA: grúa, barco, impuestos SAT y tramitación Guatemala.'
MODULE_ROUTE = 'autos'


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', false, true, '{MODULE_ROUTE}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)


def downgrade() -> None:
    op.execute(f"DELETE FROM modules WHERE code = '{MODULE_CODE}'")
