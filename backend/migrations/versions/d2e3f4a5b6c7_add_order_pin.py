"""import: PIN de 4 dígitos por pedido para el lookup público (WhatsApp + PIN)

Añade import_reservations.order_pin (String(4), nullable, indexado). El cliente
recupera su pedido acumulado con su WhatsApp + este PIN, sin el link directo.
El PIN se comparte entre todas las reservas del mismo order_token.

Backfill: asigna un PIN aleatorio por order_token existente.

Aditivo y compatible hacia atrás (columna nullable). La tabla ya tiene RLS y el
GRANT a nodo_app → no se requieren políticas nuevas.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-07 00:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('import_reservations', sa.Column('order_pin', sa.String(4), nullable=True))
    op.create_index('ix_import_reservations_order_pin', 'import_reservations', ['order_pin'])
    # Backfill: un PIN aleatorio de 4 dígitos por order_token existente.
    op.execute("""
        UPDATE import_reservations r
        SET order_pin = sub.pin
        FROM (
            SELECT order_token,
                   lpad((floor(random() * 9000) + 1000)::int::text, 4, '0') AS pin
            FROM import_reservations
            WHERE order_token IS NOT NULL
            GROUP BY order_token
        ) sub
        WHERE r.order_token = sub.order_token AND r.order_pin IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_import_reservations_order_pin', table_name='import_reservations')
    op.drop_column('import_reservations', 'order_pin')
