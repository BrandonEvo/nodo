"""rename PERSONAL_SHOPPER module to "Mi Tienda"

Revision ID: m1t2i3e4n5d6
Revises: v1e2n3t4a5s6
Create Date: 2026-07-25 00:00:00.000000

"Personal Shopper" es jerga del rubro, no el nombre que el dueño le da a su negocio:
el módulo se abre para vender, y la pantalla ya se titula "Mi Tienda". El nombre viejo
además posiciona el producto en un vertical, contra la regla del proyecto.

`code` NO se toca: 'PERSONAL_SHOPPER' es la llave de suscripciones, iconos y rutas.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'm1t2i3e4n5d6'
down_revision: Union[str, Sequence[str], None] = 'v1e2n3t4a5s6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE modules
        SET name = 'Mi Tienda', updated_at = NOW()
        WHERE code = 'PERSONAL_SHOPPER'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE modules
        SET name = 'Personal Shopper', updated_at = NOW()
        WHERE code = 'PERSONAL_SHOPPER'
    """)
