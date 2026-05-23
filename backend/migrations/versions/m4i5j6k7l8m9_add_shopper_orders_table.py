"""add shopper_orders table

Revision ID: m4i5j6k7l8m9
Revises: l3h4i5j6k7l8
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from alembic import op

revision: str = 'm4i5j6k7l8m9'
down_revision: Union[str, Sequence[str], None] = 'l3h4i5j6k7l8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE shopperorderstatus AS ENUM (
                'pendiente', 'cotizado', 'aprobado', 'en_proceso', 'entregado', 'cancelado'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        'shopper_orders',
        sa.Column('id',          sa.UUID(),    primary_key=True, nullable=False),
        sa.Column('tenant_id',   sa.UUID(),    sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',  sa.UUID(),    sa.ForeignKey('users.id'), nullable=True),

        # Datos del cliente y producto
        sa.Column('client_name',          sa.String(150),  nullable=False),
        sa.Column('client_phone',         sa.String(30),   nullable=True),
        sa.Column('product_description',  sa.String(500),  nullable=False),
        sa.Column('quantity',             sa.Float(),      nullable=False, server_default='1'),
        sa.Column('unit',                 sa.String(40),   nullable=False, server_default='unidades'),
        sa.Column('delivery_date',        sa.Date(),       nullable=True),

        # Estado y precio
        sa.Column('status',
                  PG_ENUM('pendiente','cotizado','aprobado','en_proceso','entregado','cancelado',
                           name='shopperorderstatus', create_type=False),
                  nullable=False, server_default='pendiente'),
        sa.Column('quoted_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('notes',        sa.String(1000),   nullable=True),

        # Snapshot calculadora
        sa.Column('calc_product_price_usd', sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_tax_usd',           sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_shipping_usd',      sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_total_cost_usd',    sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_total_cost_gtq',    sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_profit_gtq',        sa.Numeric(12, 2), nullable=True),
        sa.Column('calc_margin_pct',        sa.Numeric(6,  2), nullable=True),
        sa.Column('calc_exchange_rate',     sa.Numeric(8,  4), nullable=True),
        sa.Column('calc_tax_rate',          sa.Numeric(6,  2), nullable=True),
        sa.Column('calc_weight_lbs',        sa.Numeric(8,  3), nullable=True),
        sa.Column('calc_cost_per_lb',       sa.Numeric(8,  4), nullable=True),

        # Auditoría
        sa.Column('created_at',  sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',   sa.Boolean(),  nullable=False, server_default='true'),
    )

    op.create_index('ix_shopper_orders_tenant_status',
                    'shopper_orders', ['tenant_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_shopper_orders_tenant_status', table_name='shopper_orders')
    op.drop_table('shopper_orders')
    op.execute("DROP TYPE IF EXISTS shopperorderstatus")
