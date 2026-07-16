"""import: máquina de estados de reservas + categoría + datos de pago + flag IA

Añade:
  - import_reservations:    comprada_at, en_camino_at, no_disponible_at, cancelada_at,
                            resolution, resolution_note, suggested_item_id (FK),
                            replaces_reservation_id (self FK), client_notified_at
  - import_catalog_items:   category
  - import_catalog_settings: bank_name, bank_account_holder, bank_account_number,
                            bank_account_type, ai_copy_enabled
Rename de valor: status 'completada' → 'entregada'. Backfill cancelada_at.

Todo aditivo y compatible hacia atrás (columnas nullable / con server_default),
así que el backend viejo en ejecución no se rompe. Las tablas ya tienen RLS y el
GRANT a nodo_app → no se requieren políticas nuevas.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── import_reservations: timestamps por estado + desenlace + reemplazo ──
    op.add_column('import_reservations', sa.Column('comprada_at', sa.DateTime(), nullable=True))
    op.add_column('import_reservations', sa.Column('en_camino_at', sa.DateTime(), nullable=True))
    op.add_column('import_reservations', sa.Column('no_disponible_at', sa.DateTime(), nullable=True))
    op.add_column('import_reservations', sa.Column('cancelada_at', sa.DateTime(), nullable=True))
    op.add_column('import_reservations', sa.Column('resolution', sa.String(24), nullable=True))
    op.add_column('import_reservations', sa.Column('resolution_note', sa.String(300), nullable=True))
    op.add_column('import_reservations',
        sa.Column('suggested_item_id', sa.UUID(), sa.ForeignKey('import_catalog_items.id'), nullable=True))
    op.add_column('import_reservations',
        sa.Column('replaces_reservation_id', sa.UUID(), sa.ForeignKey('import_reservations.id'), nullable=True))
    op.add_column('import_reservations', sa.Column('client_notified_at', sa.DateTime(), nullable=True))
    op.create_index('ix_import_reservations_suggested_item_id', 'import_reservations', ['suggested_item_id'])
    op.create_index('ix_import_reservations_replaces_reservation_id', 'import_reservations', ['replaces_reservation_id'])

    # ── import_catalog_items: categoría para filtros / similitud ────────────
    op.add_column('import_catalog_items', sa.Column('category', sa.String(40), nullable=True))
    op.create_index('ix_import_catalog_items_category', 'import_catalog_items', ['category'])

    # ── import_catalog_settings: datos de pago + flag IA ────────────────────
    op.add_column('import_catalog_settings', sa.Column('bank_name', sa.String(80), nullable=True))
    op.add_column('import_catalog_settings', sa.Column('bank_account_holder', sa.String(150), nullable=True))
    op.add_column('import_catalog_settings', sa.Column('bank_account_number', sa.String(60), nullable=True))
    op.add_column('import_catalog_settings', sa.Column('bank_account_type', sa.String(20), nullable=True))
    op.add_column('import_catalog_settings',
        sa.Column('ai_copy_enabled', sa.Boolean(), nullable=False, server_default='false'))

    # ── Rename de valor: 'completada' pasa a llamarse 'entregada' ───────────
    op.execute("UPDATE import_reservations SET status = 'entregada' WHERE status = 'completada'")
    # Backfill best-effort del timestamp de cancelación (antes no existía).
    op.execute(
        "UPDATE import_reservations SET cancelada_at = updated_at "
        "WHERE status = 'cancelada' AND cancelada_at IS NULL"
    )


def downgrade() -> None:
    op.execute("UPDATE import_reservations SET status = 'completada' WHERE status = 'entregada'")

    op.drop_column('import_catalog_settings', 'ai_copy_enabled')
    op.drop_column('import_catalog_settings', 'bank_account_type')
    op.drop_column('import_catalog_settings', 'bank_account_number')
    op.drop_column('import_catalog_settings', 'bank_account_holder')
    op.drop_column('import_catalog_settings', 'bank_name')

    op.drop_index('ix_import_catalog_items_category', table_name='import_catalog_items')
    op.drop_column('import_catalog_items', 'category')

    op.drop_index('ix_import_reservations_replaces_reservation_id', table_name='import_reservations')
    op.drop_index('ix_import_reservations_suggested_item_id', table_name='import_reservations')
    op.drop_column('import_reservations', 'client_notified_at')
    op.drop_column('import_reservations', 'replaces_reservation_id')
    op.drop_column('import_reservations', 'suggested_item_id')
    op.drop_column('import_reservations', 'resolution_note')
    op.drop_column('import_reservations', 'resolution')
    op.drop_column('import_reservations', 'cancelada_at')
    op.drop_column('import_reservations', 'no_disponible_at')
    op.drop_column('import_reservations', 'en_camino_at')
    op.drop_column('import_reservations', 'comprada_at')
