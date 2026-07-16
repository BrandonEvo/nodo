"""shopper live store: tienda en vivo (drop) + vencimiento de catálogo

Agrega la sesión de tienda en vivo tipo drop al Personal Shopper: el dueño abre
tienda con reloj, publica ítems 'live' sellados a la sesión, y al cerrar (a mano o
por reloj) se congela — no entran más reservas, las hechas quedan firmes. Los ítems
de catálogo (Amazon/evergreen) ganan expires_at para vivir un número de días.

Todo es aditivo (nullable / server_default) → no rompe el backend viejo en ejecución.
No hay tabla nueva → no se tocan RLS ni grants (shopper_catalog_settings y
shopper_catalog_items ya los tienen desde migraciones previas).

Revision ID: l1i2v3e4s5t6
Revises: f2s3h4o5p6q7
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l1i2v3e4s5t6"
down_revision: Union[str, Sequence[str], None] = "f2s3h4o5p6q7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── shopper_catalog_settings: sesión de tienda en vivo (drop) ────────────────
    op.add_column("shopper_catalog_settings", sa.Column("store_status", sa.String(10), nullable=False, server_default="closed"))
    op.add_column("shopper_catalog_settings", sa.Column("store_name", sa.String(100), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("store_opened_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("store_closes_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("store_session_id", sa.UUID(), nullable=True))

    # ── shopper_catalog_items: canal + vencimiento + sello de sesión ─────────────
    op.add_column("shopper_catalog_items", sa.Column("listing", sa.String(10), nullable=False, server_default="catalog"))
    op.add_column("shopper_catalog_items", sa.Column("store_session_id", sa.UUID(), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    for col in ("expires_at", "store_session_id", "listing"):
        op.drop_column("shopper_catalog_items", col)
    for col in ("store_session_id", "store_closes_at", "store_opened_at", "store_name", "store_status"):
        op.drop_column("shopper_catalog_settings", col)
