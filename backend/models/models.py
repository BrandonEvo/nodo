import uuid
from typing import Optional, List
from sqlmodel import Field, Relationship, SQLModel
from db.base_class import AuditBase

# ==========================================
# MODELO NÚCLEO: TENANT
# ==========================================
class Tenant(AuditBase, table=True):
    __tablename__ = "tenants"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    name: str = Field(max_length=100, index=True)

    users: List["User"] = Relationship(back_populates="tenant")
    roles: List["Role"] = Relationship(back_populates="tenant")

# ==========================================
# MÓDULOS (SuperAdmin asigna según pago)
# ==========================================
class Module(AuditBase, table=True):
    __tablename__ = "modules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    name: str = Field(max_length=100, index=True)
    code: str = Field(max_length=50, unique=True, index=True)
    description: Optional[str] = Field(default=None, max_length=255)

# Tabla asociación tenant <-> módulos (N:M)
class TenantModuleLink(SQLModel, table=True):
    __tablename__ = "tenant_modules"

    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", primary_key=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id", primary_key=True)

# ==========================================
# ROLES (Admin de empresa asigna a empleados)
# ==========================================
class Role(AuditBase, table=True):
    __tablename__ = "roles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    name: str = Field(max_length=80, index=True)
    code: str = Field(max_length=50, index=True)  # ej: ADMIN, EMPLOYEE, VENDEDOR
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    tenant: Optional[Tenant] = Relationship(back_populates="roles")
    users: List["User"] = Relationship(back_populates="role")

# ==========================================
# MODELO OPERATIVO: USER
# ==========================================
class User(AuditBase, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    email: str = Field(max_length=255, unique=True, index=True)
    hashed_password: str = Field(max_length=1024)

    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)
    is_tenant_admin: bool = Field(default=False)  # Admin de la empresa (asigna roles)

    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    role_id: Optional[uuid.UUID] = Field(default=None, foreign_key="roles.id", index=True)

    tenant: Optional[Tenant] = Relationship(back_populates="users")
    role: Optional[Role] = Relationship(back_populates="users")