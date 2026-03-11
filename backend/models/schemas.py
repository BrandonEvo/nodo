import uuid
from typing import Optional
from fastapi_users import schemas

# --- Esquemas de Usuario ---
class UserRead(schemas.BaseUser[uuid.UUID]):
    tenant_id: uuid.UUID
    is_superuser: bool = False
    role_id: Optional[uuid.UUID] = None
    is_tenant_admin: bool = False

class UserCreate(schemas.BaseUserCreate):
    tenant_id: uuid.UUID

class UserUpdate(schemas.BaseUserUpdate):
    pass

# --- Esquemas de Tenant (para Panel SuperAdmin) ---
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class TenantRead(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime

class TenantCreate(BaseModel):
    name: str

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

# Crear usuario bajo un tenant (solo email + password; tenant_id lo asigna el backend)
class TenantUserCreate(BaseModel):
    email: str
    password: str

# --- Módulos (SuperAdmin asigna según pago) ---
class ModuleRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    is_active: bool

class ModuleCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# --- Roles (Admin tenant asigna a empleados) ---
class RoleRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    tenant_id: uuid.UUID
    is_active: bool

class RoleCreate(BaseModel):
    name: str
    code: str

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    is_active: Optional[bool] = None