"""add import_cotizaciones table

Revision ID: t1p2q3r4s5t6
Revises: s0o1p2q3r4s5
Create Date: 2026-05-26 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 't1p2q3r4s5t6'
down_revision: Union[str, Sequence[str], None] = 's0o1p2q3r4s5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'import_cotizaciones',
        sa.Column('id',                 sa.UUID(),          nullable=False),
        sa.Column('tenant_id',          sa.UUID(),          nullable=False),
        sa.Column('product_name',       sa.String(500),     nullable=False, server_default='Producto'),
        sa.Column('amazon_asin',        sa.String(20),      nullable=True),
        sa.Column('inputs_snapshot',    sa.JSON(),          nullable=False),
        sa.Column('config_snapshot',    sa.JSON(),          nullable=False),
        sa.Column('result_snapshot',    sa.JSON(),          nullable=False),
        sa.Column('status',             sa.String(20),      nullable=False, server_default='pendiente'),
        sa.Column('expires_at',         sa.DateTime(),      nullable=False),
        sa.Column('tracking_number',    sa.String(100),     nullable=True),
        sa.Column('estimated_delivery', sa.Date(),          nullable=True),
        sa.Column('notes',              sa.String(1000),    nullable=True),
        sa.Column('comprado_at',        sa.DateTime(),      nullable=True),
        sa.Column('en_transito_at',     sa.DateTime(),      nullable=True),
        sa.Column('entregado_at',       sa.DateTime(),      nullable=True),
        sa.Column('pagado_at',          sa.DateTime(),      nullable=True),
        sa.Column('created_at',         sa.DateTime(),      nullable=False),
        sa.Column('updated_at',         sa.DateTime(),      nullable=False),
        sa.Column('created_by',         sa.UUID(),          nullable=True),
        sa.Column('is_active',          sa.Boolean(),       nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['tenant_id'],   ['tenants.id']),
        sa.ForeignKeyConstraint(['created_by'],  ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_import_cotizaciones_tenant_id', 'import_cotizaciones', ['tenant_id'])

    op.execute("ALTER TABLE import_cotizaciones ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY import_cotizaciones_tenant_select ON import_cotizaciones FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_cotizaciones_tenant_insert ON import_cotizaciones FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_cotizaciones_tenant_update ON import_cotizaciones FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_cotizaciones_tenant_delete ON import_cotizaciones FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON import_cotizaciones TO nodo_app")


def downgrade() -> None:
    op.drop_index('ix_import_cotizaciones_tenant_id', table_name='import_cotizaciones')
    op.drop_table('import_cotizaciones')
