"""shopper: histórico de ventas en vivo (RLS) + foto de banner

Revision ID: v1e2n3t4a5s6
Revises: a1m2z3c4a5c6
Create Date: 2026-07-17 10:00:00.000000

Dos cambios aditivos, ninguno destructivo:

1. `shopper_catalog_settings.store_banner_url` (Text): foto de fondo del banner de la
   venta en vivo (la tienda real donde está comprando el dueño: Target, Ross…). Text y
   no String porque es un data URI redimensionado, igual que shopper_catalog_items.image_url.

2. `shopper_store_sessions`: histórico de cada venta en vivo. Hasta hoy `settings.store_*`
   se sobrescribe en cada apertura, así que una venta cerrada no dejaba ningún rastro
   consultable. Guarda identidad + ventana (no métricas): las cifras se derivan de las
   reservas creadas dentro de la ventana, para que el histórico siga siendo verdad cuando
   un pedido se entrega o se cancela después del cierre.

Tabla nueva con tenant_id → RLS obligatoria: ENABLE + 4 políticas + GRANT a nodo_app.
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'v1e2n3t4a5s6'
down_revision: Union[str, Sequence[str], None] = 'a1m2z3c4a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enable_rls(table: str) -> None:
    """ENABLE RLS + las 4 políticas de tenant + GRANT al rol de aplicación."""
    op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
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
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO nodo_app')


def upgrade() -> None:
    op.add_column(
        'shopper_catalog_settings',
        sa.Column('store_banner_url', sa.Text(), nullable=True),
    )

    op.create_table(
        'shopper_store_sessions',
        sa.Column('id',               sa.UUID(),     primary_key=True, nullable=False),
        sa.Column('tenant_id',        sa.UUID(),     sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',       sa.UUID(),     sa.ForeignKey('users.id'), nullable=True),

        sa.Column('store_session_id', sa.UUID(),     nullable=False, index=True),
        sa.Column('store_name',       sa.String(100), nullable=True),
        sa.Column('banner_url',       sa.Text(),     nullable=True),

        sa.Column('opened_at',        sa.DateTime(), nullable=False),
        sa.Column('closed_at',        sa.DateTime(), nullable=True),
        sa.Column('closes_at',        sa.DateTime(), nullable=True),

        sa.Column('created_at',       sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',       sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',        sa.Boolean(),  nullable=False, server_default='true'),
    )
    # El histórico se lee siempre "las ventas de este tenant, la más reciente arriba".
    op.create_index(
        'ix_shopper_store_sessions_tenant_opened',
        'shopper_store_sessions', ['tenant_id', 'opened_at'],
    )
    _enable_rls('shopper_store_sessions')


def downgrade() -> None:
    op.drop_index('ix_shopper_store_sessions_tenant_opened', table_name='shopper_store_sessions')
    op.drop_table('shopper_store_sessions')
    op.drop_column('shopper_catalog_settings', 'store_banner_url')
