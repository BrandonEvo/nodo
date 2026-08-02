# Tabla: PLATFORM_CONFIG (Configuración Global del Súper Admin)
import uuid as _uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class PlatformConfig(SQLModel, table=True):
    __tablename__ = "platform_config"

    key: str = Field(max_length=100, primary_key=True)
    value: str = Field(max_length=500)
    description: str = Field(default="", max_length=1000)


class ErrorEvent(SQLModel, table=True):
    """Un 500 no manejado, agrupado por firma. Tabla de PLATAFORMA, no de tenant: la
    ve el súper admin, no el dueño del negocio — por eso no lleva RLS y `tenant_id`
    es sólo contexto (quién lo sufrió), no aislamiento.

    Se agrupa por `fingerprint` a propósito: un error en un endpoint que se pollea
    genera miles de filas idénticas por hora y ahoga la tabla y al que la lee. Una
    fila por firma, con contador y primera/última vez."""
    __tablename__ = "error_events"

    id: _uuid.UUID = Field(default_factory=_uuid.uuid4, primary_key=True)
    fingerprint: str = Field(max_length=64, index=True, unique=True)
    exc_type: str = Field(max_length=200)
    message: str = Field(max_length=2000)
    method: str = Field(max_length=10)
    path: str = Field(max_length=500)
    traceback: str = Field(default="", max_length=20000)
    tenant_id: Optional[_uuid.UUID] = Field(default=None)
    user_email: Optional[str] = Field(default=None, max_length=320)
    count: int = Field(default=1)
    first_seen_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    # Reaparecer después de resuelto vuelve a alertar: si se creyó arreglado y volvió,
    # es noticia otra vez.
    resolved_at: Optional[datetime] = Field(default=None)
    notified_at: Optional[datetime] = Field(default=None)


class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscriptions"

    id: _uuid.UUID = Field(default_factory=_uuid.uuid4, primary_key=True)
    user_id: _uuid.UUID = Field(foreign_key="users.id")
    tenant_id: _uuid.UUID = Field(foreign_key="tenants.id")
    endpoint: str
    p256dh: str
    auth: str
    user_agent: Optional[str] = Field(default=None, max_length=300)
    created_at: datetime = Field(default_factory=datetime.utcnow)
