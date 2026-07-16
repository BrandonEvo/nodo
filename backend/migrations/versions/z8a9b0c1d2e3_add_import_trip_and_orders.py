"""import catalog: fecha de viaje, gancho de venta y pedido acumulado

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'z8a9b0c1d2e3'
down_revision: Union[str, Sequence[str], None] = 'y7z8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Próximo viaje de importación (deadline real del banner público)
    op.add_column('import_catalog_settings', sa.Column('trip_name', sa.String(100), nullable=True))
    op.add_column('import_catalog_settings', sa.Column('trip_close_at', sa.DateTime(), nullable=True))

    # Gancho de venta de una línea + prueba social real
    op.add_column('import_catalog_items', sa.Column('hook', sa.String(80), nullable=True))
    op.add_column('import_catalog_items', sa.Column('last_reserved_at', sa.DateTime(), nullable=True))

    # Pedido acumulado: agrupa reservas del mismo teléfono bajo un token
    op.add_column('import_reservations', sa.Column('order_token', sa.UUID(), nullable=True))
    op.create_index('ix_import_reservations_order_token', 'import_reservations', ['order_token'])
    # Reservas existentes: cada una arranca como su propio pedido para que
    # los links viejos /mi-reserva sigan resolviendo a un pedido consultable.
    op.execute('UPDATE import_reservations SET order_token = client_token WHERE order_token IS NULL')


def downgrade() -> None:
    op.drop_index('ix_import_reservations_order_token', table_name='import_reservations')
    op.drop_column('import_reservations', 'order_token')
    op.drop_column('import_catalog_items', 'last_reserved_at')
    op.drop_column('import_catalog_items', 'hook')
    op.drop_column('import_catalog_settings', 'trip_close_at')
    op.drop_column('import_catalog_settings', 'trip_name')
