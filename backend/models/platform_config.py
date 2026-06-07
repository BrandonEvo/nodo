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
