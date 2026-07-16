"""add import catalog: settings, items, reservations (con RLS)

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a9
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'w5x6y7z8a9b0'
down_revision: Union[str, Sequence[str], None] = 'v4w5x6y7z8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ('import_catalog_settings', 'import_catalog_items', 'import_reservations')


def _enable_rls(table: str) -> None:
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
    # ── import_catalog_settings ────────────────────────────
    op.create_table(
        'import_catalog_settings',
        sa.Column('id',                sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('tenant_id',         sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('created_by',        sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('public_token',      sa.UUID(),      nullable=False),
        sa.Column('business_name',     sa.String(150), nullable=True),
        sa.Column('whatsapp_number',   sa.String(30),  nullable=True),
        sa.Column('delivery_days_min', sa.Integer(),   nullable=False, server_default='5'),
        sa.Column('delivery_days_max', sa.Integer(),   nullable=False, server_default='7'),
        sa.Column('created_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',         sa.Boolean(),   nullable=False, server_default='true'),
        sa.UniqueConstraint('tenant_id', name='uq_import_catalog_settings_tenant'),
        sa.UniqueConstraint('public_token', name='uq_import_catalog_settings_token'),
    )
    op.create_index('ix_import_catalog_settings_token', 'import_catalog_settings', ['public_token'], unique=True)
    _enable_rls('import_catalog_settings')

    # ── import_catalog_items ───────────────────────────────
    op.create_table(
        'import_catalog_items',
        sa.Column('id',             sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',      sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',     sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),
        sa.Column('source',         sa.String(20),   nullable=False, server_default='manual'),
        sa.Column('cotizacion_id',  sa.UUID(),       sa.ForeignKey('import_cotizaciones.id'), nullable=True),

        sa.Column('title',          sa.String(200),  nullable=False),
        sa.Column('description',    sa.String(500),  nullable=True),
        sa.Column('price_gtq',      sa.Numeric(12, 2), nullable=True),

        sa.Column('stock_total',    sa.Integer(),    nullable=False, server_default='1'),
        sa.Column('stock_reserved', sa.Integer(),    nullable=False, server_default='0'),
        sa.Column('stock_sold',     sa.Integer(),    nullable=False, server_default='0'),

        sa.Column('is_published',   sa.Boolean(),    nullable=False, server_default='false'),
        sa.Column('published_at',   sa.DateTime(),   nullable=True),

        sa.Column('amazon_url',     sa.String(500),  nullable=True),
        sa.Column('amazon_asin',    sa.String(20),   nullable=True),
        sa.Column('image_url',      sa.String(1000), nullable=True),
        sa.Column('notes',          sa.String(500),  nullable=True),

        sa.Column('created_at',     sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',     sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',      sa.Boolean(),    nullable=False, server_default='true'),
    )
    op.create_index('ix_import_catalog_items_tenant_pub', 'import_catalog_items', ['tenant_id', 'is_published'])
    _enable_rls('import_catalog_items')

    # ── import_reservations ────────────────────────────────
    op.create_table(
        'import_reservations',
        sa.Column('id',                 sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',          sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',         sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),
        sa.Column('catalog_item_id',    sa.UUID(),       sa.ForeignKey('import_catalog_items.id'), nullable=False, index=True),

        sa.Column('client_name',        sa.String(150),  nullable=False),
        sa.Column('client_phone',       sa.String(30),   nullable=False),
        sa.Column('client_token',       sa.UUID(),       nullable=False),

        sa.Column('quantity',           sa.Integer(),    nullable=False, server_default='1'),
        sa.Column('status',             sa.String(20),   nullable=False, server_default='pendiente'),
        sa.Column('deposit_amount',     sa.Numeric(12, 2), nullable=True),
        sa.Column('payment_reference',  sa.String(200),  nullable=True),
        sa.Column('notes',              sa.String(500),  nullable=True),

        sa.Column('expires_at',         sa.DateTime(),   nullable=False),
        sa.Column('confirmed_at',       sa.DateTime(),   nullable=True),
        sa.Column('completed_at',       sa.DateTime(),   nullable=True),

        sa.Column('created_at',         sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',         sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',          sa.Boolean(),    nullable=False, server_default='true'),
    )
    op.create_index('ix_import_reservations_client_token', 'import_reservations', ['client_token'], unique=True)
    op.create_index('ix_import_reservations_tenant_status', 'import_reservations', ['tenant_id', 'status'])
    _enable_rls('import_reservations')


def downgrade() -> None:
    op.drop_index('ix_import_reservations_tenant_status', table_name='import_reservations')
    op.drop_index('ix_import_reservations_client_token', table_name='import_reservations')
    op.drop_table('import_reservations')
    op.drop_index('ix_import_catalog_items_tenant_pub', table_name='import_catalog_items')
    op.drop_table('import_catalog_items')
    op.drop_index('ix_import_catalog_settings_token', table_name='import_catalog_settings')
    op.drop_table('import_catalog_settings')
