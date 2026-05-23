# Tablas: TENANT_MEMBERS, TENANT_MEMBER_MODULE_ACCESS, REFRESH_TOKENS
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel
from .mixins import AuditBase

class TenantMember(AuditBase, table=True):
    __tablename__ = "tenant_members"
    
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_user_tenant_membership"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    
    member_type: str = Field(default="employee", max_length=50, index=True) # owner, admin, employee
    
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    
    # Relaciones completas e intactas
    user: "User" = Relationship(
        back_populates="tenant_memberships",
        sa_relationship_kwargs={
            "primaryjoin": "TenantMember.user_id == User.id"
        }
    )
    tenant: "Tenant" = Relationship(back_populates="members")
    module_accesses: List["TenantMemberModuleAccess"] = Relationship(
        back_populates="tenant_member",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class TenantMemberModuleAccess(AuditBase, table=True):
    __tablename__ = "tenant_member_module_access"
    
    __table_args__ = (UniqueConstraint("tenant_member_id", "module_id", name="uq_tenant_member_module"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_member_id: uuid.UUID = Field(foreign_key="tenant_members.id", index=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id", index=True)

    tenant_member: TenantMember = Relationship(back_populates="module_accesses")
    # No agregamos back_populates a Module para mantenerlo simple, la relación va de TenantMember -> Module


class RefreshToken(SQLModel, table=True):
    """Token opaco de 7 días que permite renovar el JWT de 2h sin re-login."""
    __tablename__ = "refresh_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(max_length=64, index=True, unique=True)  # SHA-256 del token
    expires_at: datetime = Field()
    revoked: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))