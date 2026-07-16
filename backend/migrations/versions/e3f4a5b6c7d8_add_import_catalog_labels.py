"""import: terminología configurable del catálogo (trip_label / origin_label)

Añade import_catalog_settings.trip_label (String(30)) y origin_label (String(60)),
ambas nullable. Permiten que el negocio cambie la palabra "viaje" y la línea de
origen ("desde USA 🇺🇸") del banner y los mensajes — útil para pedidos locales.

Aditivo y compatible hacia atrás (columnas nullable). La tabla ya tiene RLS y el
GRANT a nodo_app → no se requieren políticas nuevas.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-08 04:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('import_catalog_settings', sa.Column('trip_label', sa.String(30), nullable=True))
    op.add_column('import_catalog_settings', sa.Column('origin_label', sa.String(60), nullable=True))


def downgrade() -> None:
    op.drop_column('import_catalog_settings', 'origin_label')
    op.drop_column('import_catalog_settings', 'trip_label')
