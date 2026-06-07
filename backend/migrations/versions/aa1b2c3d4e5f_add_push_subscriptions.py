"""add push_subscriptions table

Revision ID: aa1b2c3d4e5f
Revises: z7a8b9c0d1e2
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'aa1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = 'z7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id',         sa.UUID(),    primary_key=True, nullable=False,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id',    sa.UUID(),    sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('tenant_id',  sa.UUID(),    sa.ForeignKey('tenants.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        # Campos de la Web Push Subscription
        sa.Column('endpoint',   sa.Text(),    nullable=False),
        sa.Column('p256dh',     sa.Text(),    nullable=False),
        sa.Column('auth',       sa.Text(),    nullable=False),
        # Metadatos
        sa.Column('user_agent', sa.String(300), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
    )

    # Un endpoint es único por usuario — evita duplicados al re-subscribir
    op.create_index(
        'uq_push_subscriptions_user_endpoint',
        'push_subscriptions',
        ['user_id', 'endpoint'],
        unique=True,
    )

    # RLS — obligatorio para tablas con tenant_id
    op.execute("ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY push_subscriptions_tenant_select ON push_subscriptions FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY push_subscriptions_tenant_insert ON push_subscriptions FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY push_subscriptions_tenant_update ON push_subscriptions FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY push_subscriptions_tenant_delete ON push_subscriptions FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO nodo_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON push_subscriptions FROM nodo_app")
    op.drop_index('uq_push_subscriptions_user_endpoint', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
