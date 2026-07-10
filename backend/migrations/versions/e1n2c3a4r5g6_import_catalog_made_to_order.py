"""import_catalog: is_made_to_order (venta por encargo, sin inventario)

Separa los dos negocios que hasta ahora compartían `stock_total`:

- Por encargo (default): no hay inventario. El producto se compra cuando el
  cliente aparta. No se muestra escasez de unidades porque no existe.
- Stock físico: el negocio tiene N unidades en la mano. La escasez es real y
  se muestra ("quedan 2", "última").

Backfill: los ítems publicados desde Amazon o desde una cotización siempre
fueron por encargo (el `stock_total: 10` del publicador era un número
inventado). Los `manual` conservan `false` porque ahí el vendedor sí escribió
una cantidad a propósito.

Revision ID: e1n2c3a4r5g6
Revises: p1a2n3c4o5p6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1n2c3a4r5g6"
down_revision: Union[str, Sequence[str], None] = "p1a2n3c4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "import_catalog_items",
        sa.Column(
            "is_made_to_order",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.execute(
        "UPDATE import_catalog_items SET is_made_to_order = FALSE "
        "WHERE source = 'manual'"
    )


def downgrade() -> None:
    op.drop_column("import_catalog_items", "is_made_to_order")
