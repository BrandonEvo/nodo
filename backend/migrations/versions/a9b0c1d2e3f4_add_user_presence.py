"""presencia de usuarios conectados (heartbeat) con RLS

Revision ID: a9b0c1d2e3f4
Revises: z8a9b0c1d2e3
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, Sequence[str], None] = 'z8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_presence',
        sa.Column('id',         sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('user_id',    sa.UUID(),      sa.ForeignKey('users.id'), nullable=False),
        sa.Column('tenant_id',  sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=True),
        sa.Column('created_by', sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('app_key',    sa.String(50),  nullable=True),
        sa.Column('last_seen',  sa.DateTime(),  nullable=False),
        sa.Column('created_at', sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',  sa.Boolean(),   nullable=False, server_default='true'),
        sa.UniqueConstraint('user_id', name='uq_user_presence_user'),
    )
    op.create_index('ix_user_presence_user', 'user_presence', ['user_id'], unique=True)
    op.create_index('ix_user_presence_tenant', 'user_presence', ['tenant_id'])
    op.create_index('ix_user_presence_last_seen', 'user_presence', ['last_seen'])

    # RLS obligatorio en tablas con tenant_id. Los endpoints de presencia operan
    # vía nodo_admin (heartbeat de infraestructura + lectura superadmin), pero la
    # tabla queda blindada ante cualquier acceso futuro con el rol nodo_app.
    op.execute('ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY user_presence_tenant_select ON user_presence FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY user_presence_tenant_insert ON user_presence FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY user_presence_tenant_update ON user_presence FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY user_presence_tenant_delete ON user_presence FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON user_presence TO nodo_app')


def downgrade() -> None:
    op.drop_index('ix_user_presence_last_seen', table_name='user_presence')
    op.drop_index('ix_user_presence_tenant', table_name='user_presence')
    op.drop_index('ix_user_presence_user', table_name='user_presence')
    op.drop_table('user_presence')
