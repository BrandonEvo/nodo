# Tablas: TENANT_MEMBERS, ROLES, ROLE_MODULE_ACCESS
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel
from .mixins import AuditBase

class Role(AuditBase, table=True):
    __tablename__ = "roles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tenants.id", index=True)
    name: str = Field(max_length=100, index=True)
    is_custom: bool = Field(default=False)

    tenant: Optional["Tenant"] = Relationship(back_populates="roles")
    members: List["TenantMember"] = Relationship(back_populates="role")
    module_access: List["RoleModuleAccess"] = Relationship(back_populates="role")

class TenantMember(AuditBase, table=True):
    __tablename__ = "tenant_members"
    
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_user_tenant_membership"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    role_id: uuid.UUID = Field(foreign_key="roles.id", index=True)
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    
    # Relaciones completas e intactas
    user: "User" = Relationship(
        back_populates="tenant_memberships",
        sa_relationship_kwargs={
            "primaryjoin": "TenantMember.user_id == User.id"
        }
    )
    tenant: "Tenant" = Relationship(back_populates="members")
    role: "Role" = Relationship(back_populates="members")

class RoleModuleAccess(AuditBase, table=True):
    __tablename__ = "role_module_access"
    
    __table_args__ = (UniqueConstraint("role_id", "module_id", name="uq_role_module"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    role_id: uuid.UUID = Field(foreign_key="roles.id", index=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id", index=True)
    
    can_read: bool = Field(default=True)
    can_write: bool = Field(default=False)
    can_delete: bool = Field(default=False)

    role: Role = Relationship(back_populates="module_access")