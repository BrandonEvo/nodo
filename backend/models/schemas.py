import uuid
from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel
from fastapi_users import schemas

# ==========================================
# USERS (Identidad Global)
# ==========================================
class UserRead(schemas.BaseUser[uuid.UUID]):
    is_superuser: bool = False
    full_name: Optional[str] = None
    picture: Optional[str] = None
    onboarding_completed: bool = False

class UserCreate(schemas.BaseUserCreate):
    pass 

class UserUpdate(schemas.BaseUserUpdate):
    pass

# ==========================================
# SESSION (Payload enriquecido post-login)
# ==========================================
class PendingInvitationRead(BaseModel):
    id: uuid.UUID
    tenant_name: str
    member_type: str = "employee"
    email: str

class SessionRead(BaseModel):
    """Payload enriquecido que combina datos de User + TenantMember + Invitations."""
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    picture: Optional[str] = None
    is_superuser: bool = False
    is_verified: bool = False
    onboarding_completed: bool = False
    # Datos M:N del tenant activo
    tenant_id: Optional[uuid.UUID] = None
    tenant_name: Optional[str] = None
    tenant_logo_url: Optional[str] = None
    tenant_theme_color: Optional[str] = None
    member_type: Optional[str] = None
    is_tenant_admin: bool = False
    # Invitaciones pendientes
    has_pending_invites: bool = False
    pending_invitations: List[PendingInvitationRead] = []

# ==========================================
# ONBOARDING
# ==========================================
class OnboardingUpdate(BaseModel):
    company_name: str

# ==========================================
# INVITATIONS (Gestión de Equipo)
# ==========================================
class InvitationCreate(BaseModel):
    email: str
    member_type: str = "employee"

class InvitationRead(BaseModel):
    id: uuid.UUID
    email: str
    tenant_id: uuid.UUID
    member_type: str
    status: str
    token: str
    expires_at: datetime
    created_at: datetime
    # Campos enriquecidos (vienen de JOINs)
    tenant_name: Optional[str] = None

class InvitationRespond(BaseModel):
    action: Literal["accept", "reject"]

# ==========================================
# TENANTS (Facturación y Espacios)
# ==========================================
class TenantRead(BaseModel):
    id: uuid.UUID
    name: str
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    stripe_customer_id: Optional[str]
    billing_status: str
    plan_id: Optional[uuid.UUID] = None
    is_active: bool
    created_at: datetime

class TenantCreate(BaseModel):
    name: str

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    is_active: Optional[bool] = None

# ==========================================
# MODULES (Catálogo Global Unificado)
# ==========================================
class ModuleRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    is_premium: bool
    is_active: bool
    frontend_route: Optional[str] = None

class ModuleCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    is_premium: bool = False
    frontend_route: Optional[str] = None

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_premium: Optional[bool] = None
    frontend_route: Optional[str] = None



# ==========================================
# IAM: TENANT MEMBERS (Membresías M:N)
# ==========================================
class TenantMemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    member_type: str
    is_active: bool
    assigned_at: datetime

class TenantMemberCreate(BaseModel):
    user_id: uuid.UUID
    member_type: str = "employee"

# ==========================================
# IAM: TENANT MEMBER MODULE ACCESS (Permisos)
# ==========================================
class TenantMemberModuleAccessRead(BaseModel):
    id: uuid.UUID
    tenant_member_id: uuid.UUID
    module_id: uuid.UUID

# ==========================================
# SUBSCRIPTION PLANS (Planes de Suscripción)
# ==========================================
class SubscriptionPlanRead(BaseModel):
    id: uuid.UUID
    name: str
    price: float
    currency: str
    is_active: bool
    module_ids: List[uuid.UUID] = []

class SubscriptionPlanCreate(BaseModel):
    name: str
    price: float = 0.0
    currency: str = "GTQ"
    module_ids: List[uuid.UUID] = []

class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    module_ids: Optional[List[uuid.UUID]] = None

# ==========================================
# PLATFORM CONFIG (Configuración Global)
# ==========================================
class PlatformConfigRead(BaseModel):
    key: str
    value: str
    description: str

class PlatformConfigUpdate(BaseModel):
    value: str