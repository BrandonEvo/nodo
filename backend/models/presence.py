"""
Presencia de usuarios conectados — heartbeat ligero desde el frontend.
Una fila por usuario (upsert): qué app tiene abierta y cuándo se le vio.
El panel superadmin agrega sobre last_seen (ventana de 2 min = "en línea").
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field

from .mixins import AuditBase


class UserPresence(AuditBase, table=True):
    __tablename__ = "user_presence"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    tenant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tenants.id", index=True)
    app_key: Optional[str] = Field(default=None, max_length=50)
    last_seen: datetime = Field(index=True)
