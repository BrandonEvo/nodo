import uuid
from datetime import datetime, timezone
from sqlalchemy import String
from sqlmodel import Field, Relationship, SQLModel
from .mixins import AuditBase

class Invitation(AuditBase, table=True):
    __tablename__ = "invitations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    email: str = Field(max_length=255, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    role_id: uuid.UUID = Field(foreign_key="roles.id", index=True)
    
    # Token temporal (puede ser un hash o UUID) para validar la invitación
    token: str = Field(max_length=255, unique=True, index=True)
    
    is_accepted: bool = Field(default=False)
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    
    # Relaciones (opcionales para la navegación)
    tenant: "Tenant" = Relationship()
    role: "Role" = Relationship()
