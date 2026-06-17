"""add billing_requests (solicitudes de suscripción — pago manual)

Revision ID: eb2c3d4e5f6a
Revises: da1b2c3d4e5f
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'eb2c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = 'da1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'billing_requests',
        sa.Column('id',          sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('tenant_id',   sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('plan_id',     sa.UUID(),      sa.ForeignKey('subscription_plans.id'), nullable=False, index=True),
        sa.Column('created_by',  sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),

        sa.Column('status',      sa.String(20),  nullable=False, server_default='pending'),
        sa.Column('note',        sa.String(500), nullable=True),

        sa.Column('created_at',  sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',   sa.Boolean(),   nullable=False, server_default='true'),
    )
    op.create_index('ix_billing_requests_tenant_status', 'billing_requests', ['tenant_id', 'status'])

    op.execute("ALTER TABLE billing_requests ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY billing_requests_tenant_select ON billing_requests FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY billing_requests_tenant_insert ON billing_requests FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY billing_requests_tenant_update ON billing_requests FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY billing_requests_tenant_delete ON billing_requests FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON billing_requests TO nodo_app")

    # El tenant necesita LEER el catálogo de planes para suscribirse (tablas globales).
    op.execute("GRANT SELECT ON subscription_plans TO nodo_app")
    op.execute("GRANT SELECT ON plan_modules TO nodo_app")


def downgrade() -> None:
    op.execute("REVOKE SELECT ON plan_modules FROM nodo_app")
    op.execute("REVOKE SELECT ON subscription_plans FROM nodo_app")
    op.execute("REVOKE ALL ON billing_requests FROM nodo_app")
    op.drop_table('billing_requests')
