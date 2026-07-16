"""amazon scrape cache: cache global por ASIN (sin tenant, sin RLS)

Revision ID: a1m2z3c4a5c6
Revises: c1o2u3p4o5n6
Create Date: 2026-07-16 05:30:00.000000

Cache GLOBAL de scrapes de Amazon keyed por ASIN. Los datos del producto son públicos
→ la tabla NO lleva tenant_id ni RLS (a diferencia de las tablas de negocio). Un scrape
exitoso de cualquier tenant sirve a todos y esquiva el 503 anti-bot (Amazon bloquea la IP
del datacenter de forma intermitente). Aditiva: solo crea la tabla, no toca datos.
`GRANT` a nodo_app por higiene (get_session corre como nodo_admin superuser, pero una
sesión con rol de app podría consultarla).
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'a1m2z3c4a5c6'
down_revision: Union[str, Sequence[str], None] = 'c1o2u3p4o5n6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'amazon_scrape_cache',
        sa.Column('asin',        sa.String(10),     primary_key=True, nullable=False),
        sa.Column('name',        sa.Text(),         nullable=True),
        sa.Column('price_usd',   sa.Numeric(12, 2), nullable=True),
        sa.Column('image_url',   sa.Text(),         nullable=True),
        sa.Column('product_url', sa.Text(),         nullable=False),
        sa.Column('description', sa.Text(),         nullable=True),
        sa.Column('source',      sa.String(10),     nullable=False, server_default='direct'),
        sa.Column('hit_count',   sa.Integer(),      nullable=False, server_default='0'),
        sa.Column('created_at',  sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
    )
    # updated_at = ancla del TTL; índice para poder purgar entradas viejas si algún día hace falta.
    op.create_index('ix_amazon_scrape_cache_updated_at', 'amazon_scrape_cache', ['updated_at'])
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON amazon_scrape_cache TO nodo_app')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS amazon_scrape_cache CASCADE')
