# Tabla: INVITATIONS
import uuid
from datetime import datetime, timezone
from sqlmodel import Field, Relationship
from .mixins import AuditBase

class Invitation(AuditBase, table=True):
    __tablename__ = "invitations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    email: str = Field(max_length=255, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    
    member_type: str = Field(default="employee", max_length=50) # owner, admin, employee
    
    # Token temporal único para validar/compartir la invitación
    token: str = Field(max_length=255, unique=True, index=True)
    
    # Status workflow: pending → accepted | rejected | revoked
    status: str = Field(default="pending", max_length=20, index=True)
    
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    
    # Relaciones (navegación)
    tenant: "Tenant" = Relationship()
