# Tabla: USERS
import uuid
from typing import List, Optional
from sqlmodel import Field, Relationship
from .mixins import AuditBase

class User(AuditBase, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    email: str = Field(max_length=255, unique=True, index=True)
    hashed_password: str = Field(max_length=1024)
    
    # OAuth Fields
    full_name: Optional[str] = Field(default=None, max_length=255)
    picture: Optional[str] = Field(default=None, max_length=1024)
    google_id: Optional[str] = Field(default=None, max_length=255, unique=True, index=True)
    
    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)
    onboarding_completed: bool = Field(default=False)
    last_active_tenant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tenants.id", index=True)

    # Relación M:N explícita evitando colisión con created_by
    tenant_memberships: List["TenantMember"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "primaryjoin": "User.id == TenantMember.user_id"
        }
    )