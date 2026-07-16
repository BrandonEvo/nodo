"""cartuchera: tablas de backup (plataforma, SIN RLS a propósito)

Revision ID: f1a2b3c4d5e6
Revises: e3f4a5b6c7d8
Create Date: 2026-07-08 00:00:00.000000

Estas tablas son datos de PLATAFORMA (solo Súper Admin), no de tenant. Por eso
NO llevan RLS ni GRANT a nodo_app: solo se acceden vía nodo_admin (superuser)
desde endpoints superadmin, y nodo_app nunca las toca. La columna que referencia
al tenant se llama `subject_tenant_id` (no `tenant_id`) justamente para no caer
en la regla "tenant_id ⇒ RLS + 4 políticas + GRANT", que aquí sería incorrecta.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backup_settings',
        sa.Column('id',               sa.Uuid(),      primary_key=True, nullable=False),
        sa.Column('enabled',          sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('keep_daily',       sa.Integer(),   nullable=False, server_default='7'),
        sa.Column('keep_weekly',      sa.Integer(),   nullable=False, server_default='4'),
        sa.Column('keep_monthly',     sa.Integer(),   nullable=False, server_default='12'),
        sa.Column('scope',            sa.String(20),  nullable=False, server_default='all_tenants'),
        sa.Column('selected_tenants', sa.JSON(),      nullable=True),
        sa.Column('storage_driver',   sa.String(20),  nullable=False, server_default='local'),
        sa.Column('storage_config',   sa.JSON(),      nullable=True),
        sa.Column('last_run_at',      sa.DateTime(),  nullable=True),
        sa.Column('next_run_at',      sa.DateTime(),  nullable=True),
        sa.Column('created_by',       sa.Uuid(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',        sa.Boolean(),   nullable=False, server_default='true'),
    )

    op.create_table(
        'backup_records',
        sa.Column('id',                sa.Uuid(),      primary_key=True, nullable=False),
        sa.Column('subject_tenant_id', sa.Uuid(),      sa.ForeignKey('tenants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind',              sa.String(20),  nullable=False, server_default='tenant'),
        sa.Column('gfs_tier',          sa.String(20),  nullable=False, server_default='manual'),
        sa.Column('trigger',           sa.String(20),  nullable=False, server_default='manual'),
        sa.Column('schema_revision',   sa.String(64),  nullable=True),
        sa.Column('format_version',    sa.Integer(),   nullable=False, server_default='1'),
        sa.Column('filename',          sa.String(255), nullable=False),
        sa.Column('storage_driver',    sa.String(20),  nullable=False, server_default='local'),
        sa.Column('storage_key',       sa.Text(),      nullable=False),
        sa.Column('size_bytes',        sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('checksum_sha256',   sa.String(64),  nullable=True),
        sa.Column('table_counts',      sa.JSON(),      nullable=True),
        sa.Column('status',            sa.String(20),  nullable=False, server_default='completed'),
        sa.Column('error',             sa.Text(),      nullable=True),
        sa.Column('expires_at',        sa.DateTime(),  nullable=True),
        sa.Column('created_by',        sa.Uuid(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',         sa.Boolean(),   nullable=False, server_default='true'),
    )
    op.create_index('ix_backup_records_subject_tenant', 'backup_records', ['subject_tenant_id'])
    op.create_index('ix_backup_records_created_at', 'backup_records', ['created_at'])

    op.create_table(
        'backup_restore_logs',
        sa.Column('id',                sa.Uuid(),      primary_key=True, nullable=False),
        sa.Column('backup_record_id',  sa.Uuid(),      sa.ForeignKey('backup_records.id', ondelete='SET NULL'), nullable=True),
        sa.Column('subject_tenant_id', sa.Uuid(),      sa.ForeignKey('tenants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('mode',              sa.String(20),  nullable=False, server_default='replace'),
        sa.Column('status',            sa.String(20),  nullable=False, server_default='completed'),
        sa.Column('counts_before',     sa.JSON(),      nullable=True),
        sa.Column('counts_after',      sa.JSON(),      nullable=True),
        sa.Column('error',             sa.Text(),      nullable=True),
        sa.Column('created_by',        sa.Uuid(),      sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',        sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',         sa.Boolean(),   nullable=False, server_default='true'),
    )
    op.create_index('ix_backup_restore_logs_subject_tenant', 'backup_restore_logs', ['subject_tenant_id'])

    # NOTA DELIBERADA: sin ENABLE ROW LEVEL SECURITY ni GRANT a nodo_app.
    # Son tablas de plataforma; solo nodo_admin (superuser) las usa. Ver el
    # docstring de este archivo y models/backup.py.
    #
    # PERO: la DB tiene ALTER DEFAULT PRIVILEGES que concede DML a nodo_app en
    # CADA tabla nueva creada por nodo_admin. Sin RLS, eso dejaría estas tablas
    # legibles/escribibles por el rol de negocio (y backup_settings.storage_config
    # guardará secretos de S3/R2). Revocamos explícitamente para cerrar el boquete.
    for _table in ("backup_settings", "backup_records", "backup_restore_logs"):
        op.execute(f"REVOKE ALL ON {_table} FROM nodo_app")


def downgrade() -> None:
    op.drop_index('ix_backup_restore_logs_subject_tenant', table_name='backup_restore_logs')
    op.drop_table('backup_restore_logs')
    op.drop_index('ix_backup_records_created_at', table_name='backup_records')
    op.drop_index('ix_backup_records_subject_tenant', table_name='backup_records')
    op.drop_table('backup_records')
    op.drop_table('backup_settings')
