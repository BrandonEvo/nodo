"""seed_importaciones_module — Registra el módulo Calculadora de Importaciones (Fase 1, sin tablas)

Revision ID: d1e2f3a4b5c6
Revises: c9d8e7f6a5b4
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MODULE_CODE = 'IMPORT'
MODULE_NAME = 'Calculadora de Importaciones'
MODULE_DESC = 'Smart calculator de costos de importación: producto + courier + aduana GT con utilidad bidireccional.'
MODULE_ROUTE = 'importaciones'


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
