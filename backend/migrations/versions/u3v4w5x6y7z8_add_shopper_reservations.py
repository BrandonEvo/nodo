"""add stock_reserved to catalog_items and create shopper_reservations table

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-06-21 00:02:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'u3v4w5x6y7z8'
down_revision: Union[str, Sequence[str], None] = 't2u3v4w5x6y7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Agregar stock_reserved a shopper_catalog_items ─────
    op.add_column(
        'shopper_catalog_items',
        sa.Column('stock_reserved', sa.Integer(), nullable=False, server_default='0'),
    )

    # ── shopper_reservations ───────────────────────────────
    op.create_table(
        'shopper_reservations',
        sa.Column('id',                 sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',          sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',         sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),
        sa.Column('catalog_item_id',    sa.UUID(),       sa.ForeignKey('shopper_catalog_items.id'), nullable=False, index=True),

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
    op.create_index('ix_shopper_reservations_client_token',
                    'shopper_reservations', ['client_token'], unique=True)
    op.create_index('ix_shopper_reservations_tenant_status',
                    'shopper_reservations', ['tenant_id', 'status'])

    op.execute('ALTER TABLE shopper_reservations ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY shopper_reservations_tenant_select ON shopper_reservations FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_reservations_tenant_insert ON shopper_reservations FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_reservations_tenant_update ON shopper_reservations FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_reservations_tenant_delete ON shopper_reservations FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON shopper_reservations TO nodo_app')


def downgrade() -> None:
    op.drop_index('ix_shopper_reservations_tenant_status', table_name='shopper_reservations')
    op.drop_index('ix_shopper_reservations_client_token', table_name='shopper_reservations')
    op.drop_table('shopper_reservations')
    op.drop_column('shopper_catalog_items', 'stock_reserved')
