"""add citas offers (ofertas por dias especificos)

Revision ID: be1f2a3b4c5d
Revises: ad5e6f7a8b9c
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'be1f2a3b4c5d'
down_revision: Union[str, Sequence[str], None] = 'ad5e6f7a8b9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ['booking_offers']


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
        'booking_offers',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('title',        sa.String(120),    nullable=False),
        sa.Column('description',  sa.String(300),    nullable=True),
        sa.Column('offer_type',   sa.String(12),     nullable=False),
        sa.Column('value',        sa.Numeric(12, 2), nullable=True),
        sa.Column('service_id',   sa.UUID(),         sa.ForeignKey('booking_services.id'), nullable=True, index=True),

        sa.Column('starts_on',    sa.Date(), nullable=False),
        sa.Column('ends_on',      sa.Date(), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='true'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('ix_booking_offers_tenant_range', 'booking_offers', ['tenant_id', 'starts_on', 'ends_on'])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"REVOKE ALL ON {table} FROM nodo_app")
        op.drop_table(table)
