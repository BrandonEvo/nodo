"""shopper coupons: discount codes + redemptions (RLS) + assumed_cost_ratio

Revision ID: c1o2u3p4o5n6
Revises: l1i2v3e4s5t6
Create Date: 2026-07-14 22:00:00.000000

Cupones de descuento por tenant para el catálogo Personal Shopper. Dos tablas nuevas
con tenant_id → RLS obligatoria (ENABLE + 4 políticas + GRANT nodo_app). Aditiva: no
toca datos existentes. `assumed_cost_ratio` en shopper_calc_settings (privado) alimenta
el piso de margen cuando un ítem no tiene costo real (`calc_total_cost_gtq`).
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'c1o2u3p4o5n6'
down_revision: Union[str, Sequence[str], None] = 'l1i2v3e4s5t6'
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
    # ── shopper_coupons ────────────────────────────────────────────────
    op.create_table(
        'shopper_coupons',
        sa.Column('id',                sa.UUID(),         primary_key=True, nullable=False),
        sa.Column('tenant_id',         sa.UUID(),         sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',        sa.UUID(),         sa.ForeignKey('users.id'), nullable=True),

        sa.Column('code',              sa.String(24),     nullable=False),
        sa.Column('discount_type',     sa.String(10),     nullable=False, server_default='percent'),
        sa.Column('percent_off',       sa.Numeric(5, 2),  nullable=True),
        sa.Column('amount_off_gtq',    sa.Numeric(12, 2), nullable=True),
        sa.Column('max_discount_gtq',  sa.Numeric(12, 2), nullable=True),
        sa.Column('min_subtotal_gtq',  sa.Numeric(12, 2), nullable=True),
        sa.Column('min_margin_pct',    sa.Numeric(6, 2),  nullable=False, server_default='0'),
        sa.Column('max_redemptions',   sa.Integer(),      nullable=True),
        sa.Column('per_customer_limit', sa.Integer(),     nullable=False, server_default='1'),
        sa.Column('redeemed_count',    sa.Integer(),      nullable=False, server_default='0'),
        sa.Column('starts_at',         sa.DateTime(),     nullable=True),
        sa.Column('expires_at',        sa.DateTime(),     nullable=True),
        sa.Column('label',             sa.String(60),     nullable=True),

        sa.Column('created_at',        sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',        sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',         sa.Boolean(),      nullable=False, server_default='true'),
    )
    # Código único POR tenant (el canje público se scopea al tenant del catálogo).
    op.create_index('uq_shopper_coupons_tenant_code',
                    'shopper_coupons', ['tenant_id', 'code'], unique=True)

    _enable_rls('shopper_coupons')

    # ── shopper_coupon_redemptions ─────────────────────────────────────
    op.create_table(
        'shopper_coupon_redemptions',
        sa.Column('id',                  sa.UUID(),         primary_key=True, nullable=False),
        sa.Column('tenant_id',           sa.UUID(),         sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',          sa.UUID(),         sa.ForeignKey('users.id'), nullable=True),

        sa.Column('coupon_id',           sa.UUID(),         sa.ForeignKey('shopper_coupons.id'), nullable=False, index=True),
        sa.Column('order_token',         sa.UUID(),         nullable=False, index=True),
        sa.Column('client_phone',        sa.String(30),     nullable=False),
        sa.Column('client_phone_digits', sa.String(20),     nullable=False, index=True),
        sa.Column('status',              sa.String(10),     nullable=False, server_default='held'),
        sa.Column('discount_gtq',        sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('subtotal_gtq',        sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('released_at',         sa.DateTime(),     nullable=True),

        sa.Column('created_at',          sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',          sa.DateTime(),     nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',           sa.Boolean(),      nullable=False, server_default='true'),
    )
    # Un solo cupón activo por pedido + backstop de idempotencia ante doble-submit.
    op.create_index('uq_shopper_coupon_redemptions_order_held',
                    'shopper_coupon_redemptions', ['order_token'], unique=True,
                    postgresql_where=sa.text("status = 'held'"))
    # Conteo global y por-cliente bajo el lock del cupón (ver router.apply).
    op.create_index('ix_shopper_coupon_redemptions_coupon_status',
                    'shopper_coupon_redemptions', ['coupon_id', 'status'])
    op.create_index('ix_shopper_coupon_redemptions_coupon_phone_status',
                    'shopper_coupon_redemptions', ['coupon_id', 'client_phone_digits', 'status'])

    _enable_rls('shopper_coupon_redemptions')

    # ── piso de margen para ítems sin costo real (privado) ─────────────
    op.add_column(
        'shopper_calc_settings',
        sa.Column('assumed_cost_ratio', sa.Numeric(4, 3), nullable=False, server_default='0.700'),
    )


def downgrade() -> None:
    op.drop_column('shopper_calc_settings', 'assumed_cost_ratio')

    op.execute('DROP TABLE IF EXISTS shopper_coupon_redemptions CASCADE')
    op.execute('DROP TABLE IF EXISTS shopper_coupons CASCADE')
