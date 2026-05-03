# Tabla: AUDIT_LOGS
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True) # Pilar para el RLS
    actor_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    
    action: str = Field(max_length=255, index=True)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    
    # Campo JSONB nativo de PostgreSQL para almacenar variaciones infinitas de datos
    details: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))