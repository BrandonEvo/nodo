"""add ventas store module (catalogo publico con stock)

Revision ID: ab2c3d4e5f6a
Revises: aa1b2c3d4e5f
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'ab2c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = 'aa1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = 'VENTAS'
MODULE_NAME  = 'Ventas'
MODULE_DESC  = 'Catálogo público con pedidos, apartado de stock y monitor de entregas'
MODULE_ROUTE = 'ventas'
MODULE_ICON  = 'shopping-cart'

TABLES = ['store_settings', 'store_products', 'store_orders', 'store_order_items', 'store_stock_moves']


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
    op.create_table(
        'store_settings',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('public_token', sa.UUID(),   nullable=False),
        sa.Column('is_open',      sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('reservation_ttl_minutes', sa.Integer(), nullable=False, server_default='30'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('uq_store_settings_tenant', 'store_settings', ['tenant_id'], unique=True)
    op.create_index('uq_store_settings_token',  'store_settings', ['public_token'], unique=True)

    op.create_table(
        'store_products',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('name',         sa.String(150),    nullable=False),
        sa.Column('description',  sa.String(500),    nullable=True),
        sa.Column('price',        sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('image_url',    sa.Text(),         nullable=True),
        sa.Column('stock_qty',    sa.Integer(),      nullable=False, server_default='0'),
        sa.Column('reserved_qty', sa.Integer(),      nullable=False, server_default='0'),
        sa.Column('is_published', sa.Boolean(),      nullable=False, server_default='true'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )

    op.create_table(
        'store_orders',
        sa.Column('id',            sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',     sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',    sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('public_token',  sa.UUID(),      nullable=False),
        sa.Column('short_code',    sa.String(8),   nullable=False),
        sa.Column('customer_name', sa.String(150), nullable=True),
        sa.Column('customer_phone', sa.String(30), nullable=True),
        sa.Column('channel',       sa.String(20),  nullable=False, server_default='catalogo'),
        sa.Column('status',        sa.String(20),  nullable=False, server_default='solicitado'),

        sa.Column('expires_at',    sa.DateTime(), nullable=True),
        sa.Column('delivered_at',  sa.DateTime(), nullable=True),
        sa.Column('paid_at',       sa.DateTime(), nullable=True),
        sa.Column('payment_method',   sa.String(30),  nullable=True),
        sa.Column('payment_provider', sa.String(50),  nullable=True),
        sa.Column('payment_ref',      sa.String(255), nullable=True),
        sa.Column('total',         sa.Numeric(12, 2), nullable=False, server_default='0'),

        sa.Column('created_at',    sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',    sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',     sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('uq_store_orders_token', 'store_orders', ['public_token'], unique=True)
    op.create_index('ix_store_orders_tenant_status', 'store_orders', ['tenant_id', 'status'])
    op.create_index('ix_store_orders_tenant_code', 'store_orders', ['tenant_id', 'short_code'])

    op.create_table(
        'store_order_items',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('order_id',     sa.UUID(),   sa.ForeignKey('store_orders.id'), nullable=False, index=True),
        sa.Column('product_id',   sa.UUID(),   sa.ForeignKey('store_products.id'), nullable=False, index=True),
        sa.Column('product_name', sa.String(150),    nullable=False),
        sa.Column('qty',          sa.Integer(),      nullable=False, server_default='1'),
        sa.Column('unit_price',   sa.Numeric(12, 2), nullable=False, server_default='0'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )

    op.create_table(
        'store_stock_moves',
        sa.Column('id',          sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',   sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',  sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('product_id',  sa.UUID(),   sa.ForeignKey('store_products.id'), nullable=False, index=True),
        sa.Column('qty',         sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('move_type',   sa.String(20),  nullable=False, server_default='merma'),
        sa.Column('reason',      sa.String(30),  nullable=True),
        sa.Column('note',        sa.String(300), nullable=True),

        sa.Column('created_at',  sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',   sa.Boolean(),  nullable=False, server_default='true'),
    )

    for table in TABLES:
        _enable_rls(table)

    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route, icon,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', false, true, '{MODULE_ROUTE}', '{MODULE_ICON}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)

    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(),
               t.id,
               m.id,
               'active',
               NOW(), true, NOW(), NOW()
        FROM tenants t, modules m
        WHERE m.code = '{MODULE_CODE}'
          AND NOT EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.tenant_id = t.id AND s.module_id = m.id
          )
    """)


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM subscriptions
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
    op.execute(f"DELETE FROM modules WHERE code = '{MODULE_CODE}'")

    for table in reversed(TABLES):
        op.execute(f"REVOKE ALL ON {table} FROM nodo_app")
        op.drop_table(table)
