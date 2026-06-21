"""add shopper_catalog_settings and shopper_catalog_items tables

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-06-21 00:01:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 't2u3v4w5x6y7'
down_revision: Union[str, Sequence[str], None] = 's1t2u3v4w5x6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── shopper_catalog_settings ───────────────────────────
    op.create_table(
        'shopper_catalog_settings',
        sa.Column('id',               sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('tenant_id',        sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('created_by',       sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('public_token',     sa.UUID(),      nullable=False),
        sa.Column('business_name',    sa.String(150), nullable=True),
        sa.Column('whatsapp_number',  sa.String(30),  nullable=True),
        sa.Column('created_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',        sa.Boolean(),   nullable=False, server_default='true'),
        sa.UniqueConstraint('tenant_id', name='uq_shopper_catalog_settings_tenant'),
        sa.UniqueConstraint('public_token', name='uq_shopper_catalog_settings_token'),
    )
    op.create_index('ix_shopper_catalog_settings_token', 'shopper_catalog_settings', ['public_token'], unique=True)

    op.execute('ALTER TABLE shopper_catalog_settings ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY shopper_catalog_settings_tenant_select ON shopper_catalog_settings FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_settings_tenant_insert ON shopper_catalog_settings FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_settings_tenant_update ON shopper_catalog_settings FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_settings_tenant_delete ON shopper_catalog_settings FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON shopper_catalog_settings TO nodo_app')

    # ── shopper_catalog_items ──────────────────────────────
    op.create_table(
        'shopper_catalog_items',
        sa.Column('id',            sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',     sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',    sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),
        sa.Column('source',        sa.String(20),   nullable=False, server_default='manual'),
        sa.Column('trip_item_id',  sa.UUID(),       sa.ForeignKey('shopper_trip_items.id'), nullable=True),

        sa.Column('title',         sa.String(200),  nullable=False),
        sa.Column('description',   sa.String(500),  nullable=True),
        sa.Column('price_gtq',     sa.Numeric(12, 2), nullable=True),

        sa.Column('stock_total',   sa.Integer(),    nullable=False, server_default='1'),
        sa.Column('stock_sold',    sa.Integer(),    nullable=False, server_default='0'),

        sa.Column('is_published',  sa.Boolean(),    nullable=False, server_default='false'),
        sa.Column('published_at',  sa.DateTime(),   nullable=True),

        sa.Column('amazon_url',    sa.String(500),  nullable=True),
        sa.Column('notes',         sa.String(500),  nullable=True),

        sa.Column('created_at',    sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',    sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',     sa.Boolean(),    nullable=False, server_default='true'),
    )
    op.create_index('ix_shopper_catalog_items_tenant_pub',
                    'shopper_catalog_items', ['tenant_id', 'is_published'])

    op.execute('ALTER TABLE shopper_catalog_items ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY shopper_catalog_items_tenant_select ON shopper_catalog_items FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_items_tenant_insert ON shopper_catalog_items FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_items_tenant_update ON shopper_catalog_items FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_catalog_items_tenant_delete ON shopper_catalog_items FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON shopper_catalog_items TO nodo_app')


def downgrade() -> None:
    op.drop_index('ix_shopper_catalog_items_tenant_pub', table_name='shopper_catalog_items')
    op.drop_table('shopper_catalog_items')
    op.drop_index('ix_shopper_catalog_settings_token', table_name='shopper_catalog_settings')
    op.drop_table('shopper_catalog_settings')
