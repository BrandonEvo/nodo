"""tenants.og_image — tarjeta 1200x630 para el preview de links compartidos

El preview que arma WhatsApp no ejecuta JS y todas las fotos del producto son
data URI, así que no existe ninguna URL de imagen servible. Esta columna guarda
un JPEG (data URI) compuesto en el navegador con el logo y el color del negocio;
/og/img/... lo decodifica y lo sirve como bytes.

Revision ID: o9g1i2m3a4g5
Revises: m1t2i3e4n5d6
"""
from alembic import op
import sqlalchemy as sa

revision: str = "o9g1i2m3a4g5"
down_revision: str = "m1t2i3e4n5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("og_image", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "og_image")
