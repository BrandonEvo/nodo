"""add shopper_trips and shopper_trip_items tables

Revision ID: s1t2u3v4w5x6
Revises: fc3d4e5f6a7b
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 's1t2u3v4w5x6'
down_revision: Union[str, Sequence[str], None] = 'fc3d4e5f6a7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── shopper_trips ──────────────────────────────────────
    op.create_table(
        'shopper_trips',
        sa.Column('id',         sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('tenant_id',  sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by', sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),

        sa.Column('store_name', sa.String(150), nullable=False),
        sa.Column('notes',      sa.String(500), nullable=True),
        sa.Column('started_at', sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('ended_at',   sa.DateTime(),  nullable=True),

        sa.Column('created_at', sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',  sa.Boolean(),   nullable=False, server_default='true'),
    )
    op.create_index('ix_shopper_trips_tenant_active', 'shopper_trips', ['tenant_id', 'is_active'])

    op.execute('ALTER TABLE shopper_trips ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY shopper_trips_tenant_select ON shopper_trips FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trips_tenant_insert ON shopper_trips FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trips_tenant_update ON shopper_trips FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trips_tenant_delete ON shopper_trips FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON shopper_trips TO nodo_app')

    # ── shopper_trip_items ─────────────────────────────────
    op.create_table(
        'shopper_trip_items',
        sa.Column('id',          sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',   sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',  sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),
        sa.Column('trip_id',     sa.UUID(),       sa.ForeignKey('shopper_trips.id'), nullable=False, index=True),

        sa.Column('title',       sa.String(200),  nullable=False),
        sa.Column('description', sa.String(500),  nullable=True),
        sa.Column('price_gtq',   sa.Numeric(12, 2), nullable=True),
        sa.Column('stock',       sa.Integer(),    nullable=False, server_default='1'),
        sa.Column('notes',       sa.String(500),  nullable=True),

        sa.Column('created_at',  sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',   sa.Boolean(),    nullable=False, server_default='true'),
    )
    op.create_index('ix_shopper_trip_items_trip', 'shopper_trip_items', ['trip_id'])

    op.execute('ALTER TABLE shopper_trip_items ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY shopper_trip_items_tenant_select ON shopper_trip_items FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trip_items_tenant_insert ON shopper_trip_items FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trip_items_tenant_update ON shopper_trip_items FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY shopper_trip_items_tenant_delete ON shopper_trip_items FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON shopper_trip_items TO nodo_app')


def downgrade() -> None:
    op.drop_index('ix_shopper_trip_items_trip', table_name='shopper_trip_items')
    op.drop_table('shopper_trip_items')
    op.drop_index('ix_shopper_trips_tenant_active', table_name='shopper_trips')
    op.drop_table('shopper_trips')
