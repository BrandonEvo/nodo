"""rename IMPORT module to "Importaciones" and set icons for IMPORT and PERSONAL_SHOPPER

Revision ID: fc3d4e5f6a7b
Revises: eb2c3d4e5f6a
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'fc3d4e5f6a7b'
down_revision: Union[str, Sequence[str], None] = 'eb2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Importaciones: nombre más simple + icono de envío/courier
    op.execute("""
        UPDATE modules
        SET name = 'Importaciones', icon = 'truck', updated_at = NOW()
        WHERE code = 'IMPORT'
    """)
    # Personal Shopper: icono de bolsa de compras
    op.execute("""
        UPDATE modules
        SET icon = 'shopping-bag', updated_at = NOW()
        WHERE code = 'PERSONAL_SHOPPER'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE modules
        SET name = 'Calculadora de Importaciones', icon = NULL, updated_at = NOW()
        WHERE code = 'IMPORT'
    """)
    op.execute("""
        UPDATE modules
        SET icon = NULL, updated_at = NOW()
        WHERE code = 'PERSONAL_SHOPPER'
    """)
