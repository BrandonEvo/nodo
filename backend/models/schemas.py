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


# ══════════════════════════════════════════
# MÓDULO 1: BODEGA
# ══════════════════════════════════════════

class InventoryItemCreate(BaseModel):
    name: str
    unit: str = "kg"
    current_stock: float = 0.0
    minimum_stock: float = 0.0
    category: Optional[str] = None

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    minimum_stock: Optional[float] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

class InventoryItemRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    unit: str
    current_stock: float
    minimum_stock: float
    category: Optional[str]
    is_active: bool
    created_at: datetime

class StockAdjust(BaseModel):
    quantity: float
    adjust_type: Literal["entrada", "ajuste"]  # entrada = sumar, ajuste = restar


# ══════════════════════════════════════════
# MÓDULO 2: RECETAS
# ══════════════════════════════════════════

class RecipeCreate(BaseModel):
    name: str
    base_unit: str = "unidades"
    estimated_yield: int = 1
    estimated_cost: float = 0.0
    sell_price: float = 0.0

class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    base_unit: Optional[str] = None
    estimated_yield: Optional[int] = None
    estimated_cost: Optional[float] = None
    sell_price: Optional[float] = None
    is_active: Optional[bool] = None

class RecipeIngredientCreate(BaseModel):
    inventory_item_id: uuid.UUID
    quantity: float

class RecipeIngredientRead(BaseModel):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    item_name: str
    item_unit: str
    quantity: float

class RecipeRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    base_unit: str
    estimated_yield: int
    estimated_cost: float
    sell_price: float
    is_active: bool
    created_at: datetime

class RecipeWithIngredients(RecipeRead):
    ingredients: List[RecipeIngredientRead] = []


# ══════════════════════════════════════════
# MÓDULO 3: COCINA
# ══════════════════════════════════════════

class ProductionOrderCreate(BaseModel):
    recipe_id: uuid.UUID
    quantity: int

class ProductionOrderRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    recipe_id: uuid.UUID
    recipe_name: str
    quantity: int
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

class WasteLogCreate(BaseModel):
    quantity: float
    reason: Optional[str] = None

class WasteLogRead(BaseModel):
    id: uuid.UUID
    production_order_id: uuid.UUID
    quantity: float
    reason: Optional[str]
    created_at: datetime


# ══════════════════════════════════════════
# MÓDULO 4: MOSTRADOR (POS)
# ══════════════════════════════════════════

class SaleItemCreate(BaseModel):
    recipe_id: uuid.UUID
    quantity: int
    price: float
    freshness_tag: str = "fresco"

class SaleCreate(BaseModel):
    payment_method: str = "efectivo"
    items: List[SaleItemCreate]

class SaleItemRead(BaseModel):
    id: uuid.UUID
    recipe_id: uuid.UUID
    recipe_name: str
    quantity: int
    price: float
    freshness_tag: str

class SaleRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    total: float
    payment_method: str
    created_at: datetime
    items: List[SaleItemRead] = []


# ══════════════════════════════════════════
# MÓDULO 5: CIERRE
# ══════════════════════════════════════════

class ShiftSummary(BaseModel):
    efectivo: float
    tarjeta: float
    total: float
    tickets: int
    promedio: float

class ShiftClose(BaseModel):
    actual_cash: float
    notes: Optional[str] = None

class ShiftRegisterRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    expected_cash: float
    actual_cash: float
    difference: float
    card_total: float
    total_sales: float
    ticket_count: int
    notes: Optional[str]
    closed_at: Optional[datetime]
    created_at: datetime


# ══════════════════════════════════════════
# MÓDULO: AUTOS (Importación de Vehículos)
# ══════════════════════════════════════════

class AutosCalculoInput(BaseModel):
    costo_real_usd: float
    state_code: str
    vehicle_size: Literal["normal", "mediano", "grande"] = "normal"
    # Reparaciones en GTQ (opcionales)
    rep_llave:     float = 0.0
    rep_repuestos: float = 0.0
    rep_pintura:   float = 0.0
    rep_mano_obra: float = 0.0
    rep_otros:     float = 0.0
    # Precio de venta (para calcular utilidad)
    precio_venta_gtq: float = 0.0
    # Variables configurables — None usa los defaults del servidor
    tipo_cambio:          Optional[float] = None
    tramite_aduanero_gtq: Optional[float] = None
    porcentaje_sat:       Optional[float] = None

class AutosCostoVehiculo(BaseModel):
    costo_real_usd:        float
    costo_real_gtq:        float
    comision_bancaria_usd: float
    comision_bancaria_gtq: float
    total_usd:             float
    total_gtq:             float

class AutosCostoImportacion(BaseModel):
    grua_usd:                        float
    grua_gtq:                        float
    comision_grua_usd:               float
    comision_grua_gtq:               float
    barco_usd:                       float
    barco_gtq:                       float
    comision_barco_usd:              float
    comision_barco_gtq:              float
    storage_usd:                     float
    storage_gtq:                     float
    comision_bancaria_logistica_usd: float
    comision_bancaria_logistica_gtq: float
    total_usd:                       float
    total_gtq:                       float
    puerto:                          str

class AutosImpuestosGT(BaseModel):
    impuestos_sat_gtq:            float
    tramite_aduanero_gtq:         float
    tacuacina_gtq:                float
    primeras_placas_gtq:          float
    calcomania_gtq:               float
    facturacion_legalizacion_gtq: float
    insumos_gasolina_gtq:         float
    contador_gtq:                 float
    grua_local_gtq:               float
    total_gtq:                    float

class AutosCostoReparacion(BaseModel):
    llave_gtq:     float
    repuestos_gtq: float
    pintura_gtq:   float
    mano_obra_gtq: float
    otros_gtq:     float
    total_gtq:     float

class AutosCalculoResult(BaseModel):
    state_label:          str
    puerto:               str
    tipo_cambio:          float
    tramite_aduanero_gtq: float
    porcentaje_sat:       float
    costo_vehiculo:       AutosCostoVehiculo
    costo_importacion:    AutosCostoImportacion
    impuestos_guatemala:  AutosImpuestosGT
    costo_reparacion:     AutosCostoReparacion
    costo_final_gtq:      float
    precio_venta_gtq:     float
    utilidad_gtq:         float