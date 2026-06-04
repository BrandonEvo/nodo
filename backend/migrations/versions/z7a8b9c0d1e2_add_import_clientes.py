"""add import_clientes + cliente_id/confirmado/metricas en cotizaciones

Revision ID: z7a8b9c0d1e2
Revises: y6z7a8b9c0d1
Create Date: 2026-06-03 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op


revision: str = 'z7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'y6z7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Tabla de clientes reutilizables ──────────────────────────────────────
    op.create_table(
        'import_clientes',
        sa.Column('id',         sa.UUID(),       nullable=False),
        sa.Column('tenant_id',  sa.UUID(),       nullable=False),
        sa.Column('name',       sa.String(150),  nullable=False),
        sa.Column('phone',      sa.String(30),   nullable=True),
        sa.Column('email',      sa.String(200),  nullable=True),
        sa.Column('notes',      sa.String(1000), nullable=True),
        sa.Column('created_at', sa.DateTime(),   nullable=False),
        sa.Column('updated_at', sa.DateTime(),   nullable=False),
        sa.Column('created_by', sa.UUID(),       nullable=True),
        sa.Column('is_active',  sa.Boolean(),    nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['tenant_id'],  ['tenants.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_import_clientes_tenant_id', 'import_clientes', ['tenant_id'])
    op.create_index('ix_import_clientes_name', 'import_clientes', ['tenant_id', 'name'])

    op.execute("ALTER TABLE import_clientes ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY import_clientes_tenant_select ON import_clientes FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_clientes_tenant_insert ON import_clientes FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_clientes_tenant_update ON import_clientes FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY import_clientes_tenant_delete ON import_clientes FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON import_clientes TO nodo_app")

    # ── 2. Columnas nuevas en import_cotizaciones ───────────────────────────────
    op.add_column('import_cotizaciones', sa.Column('cliente_id', sa.UUID(), nullable=True))
    op.add_column('import_cotizaciones', sa.Column('confirmado_at', sa.DateTime(), nullable=True))
    op.add_column('import_cotizaciones', sa.Column('sale_price_gtq', sa.Numeric(12, 2), nullable=True))
    op.add_column('import_cotizaciones', sa.Column('landed_cost_gtq', sa.Numeric(12, 2), nullable=True))
    op.create_foreign_key(
        'fk_import_cotizaciones_cliente', 'import_cotizaciones', 'import_clientes',
        ['cliente_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_import_cotizaciones_cliente_id', 'import_cotizaciones', ['cliente_id'])

    # ── 3. Backfill de métricas desde result_snapshot (JSON) ─────────────────────
    op.execute("""
        UPDATE import_cotizaciones
        SET sale_price_gtq  = NULLIF(result_snapshot->>'salePriceGTQ', '')::numeric,
            landed_cost_gtq = NULLIF(result_snapshot->>'totalLandedCostGTQ', '')::numeric
        WHERE result_snapshot IS NOT NULL
    """)

    # ── 4. Migrar estado: pendiente → cotizado ──────────────────────────────────
    op.execute("UPDATE import_cotizaciones SET status = 'cotizado' WHERE status = 'pendiente'")
    op.alter_column('import_cotizaciones', 'status', server_default='cotizado')


def downgrade() -> None:
    op.execute("UPDATE import_cotizaciones SET status = 'pendiente' WHERE status = 'cotizado'")
    op.alter_column('import_cotizaciones', 'status', server_default='pendiente')
    op.execute("UPDATE import_cotizaciones SET status = 'comprado' WHERE status = 'confirmado'")

    op.drop_index('ix_import_cotizaciones_cliente_id', table_name='import_cotizaciones')
    op.drop_constraint('fk_import_cotizaciones_cliente', 'import_cotizaciones', type_='foreignkey')
    op.drop_column('import_cotizaciones', 'landed_cost_gtq')
    op.drop_column('import_cotizaciones', 'sale_price_gtq')
    op.drop_column('import_cotizaciones', 'confirmado_at')
    op.drop_column('import_cotizaciones', 'cliente_id')

    op.drop_index('ix_import_clientes_name', table_name='import_clientes')
    op.drop_index('ix_import_clientes_tenant_id', table_name='import_clientes')
    op.drop_table('import_clientes')
