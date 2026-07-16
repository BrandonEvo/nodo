"""add import_paquetes (agrupacion de pedidos) + paquete_id en cotizaciones

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-06-28 01:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'x6y7z8a9b0c1'
down_revision: Union[str, Sequence[str], None] = 'w5x6y7z8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'import_paquetes',
        sa.Column('id',                 sa.UUID(),       primary_key=True, nullable=False),
        sa.Column('tenant_id',          sa.UUID(),       sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('cliente_id',         sa.UUID(),       sa.ForeignKey('import_clientes.id'), nullable=True, index=True),
        sa.Column('created_by',         sa.UUID(),       sa.ForeignKey('users.id'), nullable=True),

        sa.Column('name',               sa.String(150),  nullable=False, server_default='Paquete'),
        sa.Column('status',             sa.String(20),   nullable=False, server_default='cotizado'),

        sa.Column('tracking_number',    sa.String(100),  nullable=True),
        sa.Column('estimated_delivery', sa.Date(),       nullable=True),
        sa.Column('notes',              sa.String(1000), nullable=True),

        sa.Column('confirmado_at',      sa.DateTime(),   nullable=True),
        sa.Column('comprado_at',        sa.DateTime(),   nullable=True),
        sa.Column('en_transito_at',     sa.DateTime(),   nullable=True),
        sa.Column('entregado_at',       sa.DateTime(),   nullable=True),
        sa.Column('pagado_at',          sa.DateTime(),   nullable=True),

        sa.Column('created_at',         sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',         sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',          sa.Boolean(),    nullable=False, server_default='true'),
    )
    op.create_index('ix_import_paquetes_tenant_cliente', 'import_paquetes', ['tenant_id', 'cliente_id'])

    op.execute('ALTER TABLE import_paquetes ENABLE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY import_paquetes_tenant_select ON import_paquetes FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_paquetes_tenant_insert ON import_paquetes FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_paquetes_tenant_update ON import_paquetes FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_paquetes_tenant_delete ON import_paquetes FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON import_paquetes TO nodo_app')

    # FK desde cotizaciones hacia el paquete (nullable = suelta).
    op.add_column('import_cotizaciones', sa.Column('paquete_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_import_cotizaciones_paquete', 'import_cotizaciones', 'import_paquetes',
        ['paquete_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_import_cotizaciones_paquete', 'import_cotizaciones', ['paquete_id'])


def downgrade() -> None:
    op.drop_index('ix_import_cotizaciones_paquete', table_name='import_cotizaciones')
    op.drop_constraint('fk_import_cotizaciones_paquete', 'import_cotizaciones', type_='foreignkey')
    op.drop_column('import_cotizaciones', 'paquete_id')
    op.drop_index('ix_import_paquetes_tenant_cliente', table_name='import_paquetes')
    op.drop_table('import_paquetes')
