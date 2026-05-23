"""enable RLS on tenant tables

Revision ID: q8m9n0o1p2q3
Revises: p7l8m9n0o1p2
Create Date: 2026-05-22 00:00:00.000000
"""
from alembic import op

revision = 'q8m9n0o1p2q3'
down_revision = 'p7l8m9n0o1p2'
branch_labels = None
depends_on = None

TENANT_TABLES = [
    'audit_logs',
    'expense_lines',
    'inventory_items',
    'inventory_price_history',
    'invitations',
    'production_orders',
    'recipe_constants',
    'recipe_ingredients',
    'recipes',
    'sale_items',
    'sales',
    'shift_registers',
    'shopper_orders',
    'stock_movements',
    'subscriptions',
    'tenant_members',
    'waste_logs',
]


def upgrade() -> None:
    # 1. Crear rol nodo_app si no existe
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nodo_app') THEN
                CREATE ROLE nodo_app NOINHERIT;
            END IF;
        END
        $$
    """)

    # 2. Permisos de schema y tablas
    op.execute("GRANT USAGE ON SCHEMA public TO nodo_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nodo_app")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nodo_app")

    # 3. RLS + políticas por tabla
    for table in TENANT_TABLES:
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


def downgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_select ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_insert ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_update ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_delete ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nodo_app")
    op.execute("DROP ROLE IF EXISTS nodo_app")
