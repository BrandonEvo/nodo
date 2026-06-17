"""add store promotions and product hook fields (precio ancla + badge)

Revision ID: cf2a3b4c5d6e
Revises: be1f2a3b4c5d
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'cf2a3b4c5d6e'
# Encadenada tras las ofertas de Citas para mantener un head lineal único:
# ad5e6f7a8b9c -> be1f2a3b4c5d (citas offers) -> cf2a3b4c5d6e (store promos).
# Las dos migraciones son independientes (tablas distintas); el orden es indiferente.
down_revision: Union[str, Sequence[str], None] = 'be1f2a3b4c5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PROMO_TABLE = 'store_promotions'


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY {table}_tenant_select ON {table} FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_insert ON {table} FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_update ON {table} FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_delete ON {table} FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO nodo_app")


def upgrade() -> None:
    # ── Gancho a nivel producto: precio ancla tachado + etiqueta llamativa ──
    # No crean tabla nueva: store_products ya tiene RLS, no requieren políticas.
    op.add_column('store_products',
                  sa.Column('compare_at_price', sa.Numeric(12, 2), nullable=True))
    op.add_column('store_products',
                  sa.Column('badge', sa.String(40), nullable=True))

    # ── Promociones por rango de fechas (2x1, % off, ancla, combo, badge) ──
    op.create_table(
        PROMO_TABLE,
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('product_id',   sa.UUID(),   sa.ForeignKey('store_products.id'), nullable=True, index=True),
        sa.Column('title',        sa.String(80),  nullable=False),
        # percent | two_for_one | compare_at | bundle | badge
        sa.Column('promo_type',   sa.String(20),  nullable=False, server_default='percent'),
        sa.Column('value',        sa.Numeric(12, 2), nullable=True),
        sa.Column('description',  sa.String(200), nullable=True),
        sa.Column('urgency_text', sa.String(80),  nullable=True),

        sa.Column('starts_on',    sa.Date(), nullable=True),
        sa.Column('ends_on',      sa.Date(), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='true'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('ix_store_promotions_tenant_pub', PROMO_TABLE, ['tenant_id', 'is_published'])

    _enable_rls(PROMO_TABLE)


def downgrade() -> None:
    op.execute(f"REVOKE ALL ON {PROMO_TABLE} FROM nodo_app")
    op.drop_index('ix_store_promotions_tenant_pub', table_name=PROMO_TABLE)
    op.drop_table(PROMO_TABLE)

    op.drop_column('store_products', 'badge')
    op.drop_column('store_products', 'compare_at_price')
