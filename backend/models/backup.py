"""
Tablas de la Cartuchera — datos de PLATAFORMA (solo Súper Admin), NO de tenant.

Deliberadamente SIN RLS: solo se acceden vía `get_session` (rol nodo_admin, que
bypassa RLS) desde endpoints superadmin; el rol nodo_app nunca las toca. La
columna que referencia al tenant se llama `subject_tenant_id` (NO `tenant_id`) a
propósito, para no disparar la regla del repo "columna tenant_id ⇒ RLS + 4
políticas + GRANT", que aquí sería incorrecta.

FKs a `tenants.id` con ON DELETE SET NULL: borrar un tenant conserva el histórico
de sus backups en vez de bloquear el borrado o cascadear.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, ForeignKey, JSON, Text, Uuid
from sqlmodel import Field

from .mixins import AuditBase


class BackupSettings(AuditBase, table=True):
    __tablename__ = "backup_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    enabled: bool = Field(default=False)
    # Retención GFS (abuelo-padre-hijo): cuántas copias conservar por nivel.
    keep_daily: int = Field(default=7)
    keep_weekly: int = Field(default=4)
    keep_monthly: int = Field(default=12)
    # Alcance del automático por-tenant.
    scope: str = Field(default="all_tenants", max_length=20)  # all_tenants | selected
    selected_tenants: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Almacenamiento (driver enchufable; s3/r2 en fase posterior).
    storage_driver: str = Field(default="local", max_length=20)  # local | s3 | r2
    storage_config: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    last_run_at: Optional[datetime] = Field(default=None)
    next_run_at: Optional[datetime] = Field(default=None)


class BackupRecord(AuditBase, table=True):
    __tablename__ = "backup_records"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    subject_tenant_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("tenants.id", ondelete="SET NULL"),
                         nullable=True, index=True),
    )
    kind: str = Field(default="tenant", max_length=20)       # tenant | platform
    gfs_tier: str = Field(default="manual", max_length=20)   # daily|weekly|monthly|manual|safety
    trigger: str = Field(default="manual", max_length=20)    # manual|scheduled|pre_restore
    schema_revision: Optional[str] = Field(default=None, max_length=64)
    format_version: int = Field(default=1)
    filename: str = Field(max_length=255)
    storage_driver: str = Field(default="local", max_length=20)
    storage_key: str = Field(sa_column=Column(Text, nullable=False))
    size_bytes: int = Field(default=0)
    checksum_sha256: Optional[str] = Field(default=None, max_length=64)
    table_counts: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    status: str = Field(default="completed", max_length=20)  # completed|failed|running
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    expires_at: Optional[datetime] = Field(default=None)


class BackupRestoreLog(AuditBase, table=True):
    __tablename__ = "backup_restore_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    backup_record_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("backup_records.id", ondelete="SET NULL"),
                         nullable=True, index=True),
    )
    subject_tenant_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("tenants.id", ondelete="SET NULL"),
                         nullable=True, index=True),
    )
    mode: str = Field(default="replace", max_length=20)      # replace | merge
    status: str = Field(default="completed", max_length=20)
    counts_before: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    counts_after: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
