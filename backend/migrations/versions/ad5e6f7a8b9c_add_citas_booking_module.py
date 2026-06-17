"""add citas booking module (agenda publica con confirmacion)

Revision ID: ad5e6f7a8b9c
Revises: ac4d5e6f7a8b
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'ad5e6f7a8b9c'
down_revision: Union[str, Sequence[str], None] = 'ac4d5e6f7a8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = 'CITAS'
MODULE_NAME  = 'Citas'
MODULE_DESC  = 'Agenda en línea: catálogo de servicios, calendario público y confirmación de reservas'
MODULE_ROUTE = 'citas'
MODULE_ICON  = 'calendar'

TABLES = ['booking_settings', 'booking_services', 'booking_hours', 'booking_exceptions', 'booking_appointments']


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
        'booking_settings',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('public_token', sa.UUID(),    nullable=False),
        sa.Column('is_open',      sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('confirmation_mode',        sa.String(10), nullable=False, server_default='manual'),
        sa.Column('slot_granularity_minutes', sa.Integer(),  nullable=False, server_default='30'),
        sa.Column('min_notice_hours',         sa.Integer(),  nullable=False, server_default='2'),
        sa.Column('max_days_ahead',           sa.Integer(),  nullable=False, server_default='30'),
        sa.Column('timezone',                 sa.String(50), nullable=False, server_default='America/Guatemala'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('uq_booking_settings_tenant', 'booking_settings', ['tenant_id'], unique=True)
    op.create_index('uq_booking_settings_token',  'booking_settings', ['public_token'], unique=True)

    op.create_table(
        'booking_services',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('name',             sa.String(150),    nullable=False),
        sa.Column('description',      sa.String(500),    nullable=True),
        sa.Column('price',            sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('duration_minutes', sa.Integer(),      nullable=False, server_default='30'),
        sa.Column('is_published',     sa.Boolean(),      nullable=False, server_default='true'),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )

    op.create_table(
        'booking_hours',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('weekday',      sa.Integer(), nullable=False),
        sa.Column('start_time',   sa.Time(),    nullable=False),
        sa.Column('end_time',     sa.Time(),    nullable=False),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('ix_booking_hours_tenant_weekday', 'booking_hours', ['tenant_id', 'weekday'])

    op.create_table(
        'booking_exceptions',
        sa.Column('id',           sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',    sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',   sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('date',         sa.Date(),      nullable=False),
        sa.Column('is_closed',    sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('start_time',   sa.Time(),      nullable=True),
        sa.Column('end_time',     sa.Time(),      nullable=True),
        sa.Column('note',         sa.String(200), nullable=True),

        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',   sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',    sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('uq_booking_exceptions_tenant_date', 'booking_exceptions', ['tenant_id', 'date'], unique=True)

    op.create_table(
        'booking_appointments',
        sa.Column('id',            sa.UUID(),   primary_key=True, nullable=False),
        sa.Column('tenant_id',     sa.UUID(),   sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',    sa.UUID(),   sa.ForeignKey('users.id'), nullable=True),

        sa.Column('public_token',  sa.UUID(),      nullable=False),
        sa.Column('short_code',    sa.String(8),   nullable=False),
        sa.Column('customer_name', sa.String(150), nullable=False),
        sa.Column('customer_phone', sa.String(30), nullable=False),
        sa.Column('customer_note', sa.String(300), nullable=True),

        sa.Column('service_id',       sa.UUID(),         sa.ForeignKey('booking_services.id'), nullable=False, index=True),
        sa.Column('service_name',     sa.String(150),    nullable=False),
        sa.Column('service_price',    sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('duration_minutes', sa.Integer(),      nullable=False, server_default='30'),

        sa.Column('starts_at',     sa.DateTime(), nullable=False),
        sa.Column('ends_at',       sa.DateTime(), nullable=False),

        sa.Column('status',        sa.String(20), nullable=False, server_default='pendiente'),
        sa.Column('confirmed_at',  sa.DateTime(), nullable=True),
        sa.Column('cancelled_at',  sa.DateTime(), nullable=True),
        sa.Column('cancelled_by',  sa.String(10), nullable=True),

        sa.Column('created_at',    sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',    sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',     sa.Boolean(),  nullable=False, server_default='true'),
    )
    op.create_index('uq_booking_appointments_token',  'booking_appointments', ['public_token'], unique=True)
    op.create_index('ix_booking_appointments_tenant_starts', 'booking_appointments', ['tenant_id', 'starts_at'])
    op.create_index('ix_booking_appointments_tenant_status', 'booking_appointments', ['tenant_id', 'status'])
    op.create_index('ix_booking_appointments_tenant_phone',  'booking_appointments', ['tenant_id', 'customer_phone'])
    op.create_index('ix_booking_appointments_tenant_code',   'booking_appointments', ['tenant_id', 'short_code'])

    for table in TABLES:
        _enable_rls(table)

    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route, icon,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', false, true, '{MODULE_ROUTE}', '{MODULE_ICON}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)

    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(),
               t.id,
               m.id,
               'active',
               NOW(), true, NOW(), NOW()
        FROM tenants t, modules m
        WHERE m.code = '{MODULE_CODE}'
          AND NOT EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.tenant_id = t.id AND s.module_id = m.id
          )
    """)


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM subscriptions
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
    op.execute(f"DELETE FROM modules WHERE code = '{MODULE_CODE}'")

    for table in reversed(TABLES):
        op.execute(f"REVOKE ALL ON {table} FROM nodo_app")
        op.drop_table(table)
