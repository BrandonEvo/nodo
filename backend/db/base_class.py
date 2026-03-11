import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field

class AuditBase(SQLModel):
    """Modelo base con campos de auditoría para heredar en todas las tablas."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Eliminación lógica
    is_active: bool = Field(default=True)
    
    # Trazabilidad de seguridad
    created_by: Optional[uuid.UUID] = Field(default=None)
    last_ip: Optional[str] = Field(default=None, max_length=45)
    device_info: Optional[str] = Field(default=None, max_length=255)