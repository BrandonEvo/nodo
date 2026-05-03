# Contiene clase AuditBase
import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel

class AuditBase(SQLModel):
    """Mixin base inyectado en todas las tablas transaccionales."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)