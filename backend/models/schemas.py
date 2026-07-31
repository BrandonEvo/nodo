import uuid
from typing import Optional, List, Literal
from datetime import datetime, date, time
from pydantic import BaseModel
from fastapi_users import schemas
from models.bakery import ExpenseCategory

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

class TenantSummary(BaseModel):
    tenant_id: str
    tenant_name: str
    member_type: str
    is_active: bool

class SessionRead(BaseModel):
    """Payload enriquecido que combina datos de User + TenantMember + Invitations."""
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    picture: Optional[str] = None
    is_superuser: bool = False
    is_verified: bool = False
    onboarding_completed: bool = False
    is_google_user: bool = False
    # Datos M:N del tenant activo
    tenant_id: Optional[uuid.UUID] = None
    tenant_name: Optional[str] = None
    tenant_logo_url: Optional[str] = None
    tenant_theme_color: Optional[str] = None
    member_type: Optional[str] = None
    is_tenant_admin: bool = False
    # Facturación / trial (gancho de venta + enforcement)
    billing_status: Optional[str] = None
    access_state: Optional[str] = None  # active | trialing | grace | locked
    trial_ends_at: Optional[datetime] = None
    trial_days_remaining: Optional[int] = None
    grace_days_remaining: Optional[int] = None
    # Multi-tenant switcher
    available_tenants: List[TenantSummary] = []
    # Invitaciones pendientes
    has_pending_invites: bool = False
    pending_invitations: List[PendingInvitationRead] = []

# ==========================================
# ONBOARDING
# ==========================================
class OnboardingUpdate(BaseModel):
    company_name: Optional[str] = None   # None = conservar el nombre ya seteado en registro
    module_codes: List[str] = []         # Códigos de módulos a activar (ej: ["bodega","recetas"])

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

class InvitationPreview(BaseModel):
    """Información pública de una invitación — no requiere autenticación."""
    id: uuid.UUID
    tenant_name: str
    member_type: str
    email: str
    expires_at: datetime

class MemberRegisterRequest(BaseModel):
    """Registro de un empleado/miembro via token de invitación."""
    invite_token: str
    email: str
    password: str
    full_name: str | None = None

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
    is_system: bool = False
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
    icon: Optional[str] = None

class ModuleCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    is_premium: bool = False
    frontend_route: Optional[str] = None
    icon: Optional[str] = None

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_premium: Optional[bool] = None
    frontend_route: Optional[str] = None
    icon: Optional[str] = None



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
    # Copy de marketing (lo consume la landing vía /api/public/plans)
    tagline: Optional[str] = None
    description: Optional[str] = None
    features: List[str] = []
    badge_label: Optional[str] = None
    cta_label: Optional[str] = None
    is_featured: bool = False
    billing_period: str = "month"
    sort_order: int = 0
    is_public: bool = False

class SubscriptionPlanCreate(BaseModel):
    name: str
    price: float = 0.0
    currency: str = "GTQ"
    module_ids: List[uuid.UUID] = []
    tagline: Optional[str] = None
    description: Optional[str] = None
    features: List[str] = []
    badge_label: Optional[str] = None
    cta_label: Optional[str] = None
    is_featured: bool = False
    billing_period: str = "month"
    sort_order: int = 0
    is_public: bool = False

class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    module_ids: Optional[List[uuid.UUID]] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    features: Optional[List[str]] = None
    badge_label: Optional[str] = None
    cta_label: Optional[str] = None
    is_featured: Optional[bool] = None
    billing_period: Optional[str] = None
    sort_order: Optional[int] = None
    is_public: Optional[bool] = None

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
    last_unit_cost: float
    category: Optional[str]
    is_active: bool
    created_at: datetime

class StockAdjust(BaseModel):
    quantity: float
    adjust_type: Literal["entrada", "ajuste"]  # entrada = sumar, ajuste = restar
    unit_cost: Optional[float] = None  # precio por unidad, solo aplica en "entrada"

class PriceHistoryRead(BaseModel):
    id: uuid.UUID
    unit_cost: float
    recorded_at: datetime


class StockMovementRead(BaseModel):
    id: uuid.UUID
    move_type: str
    quantity: float
    unit_cost: Optional[float] = None
    stock_after: float
    recorded_at: datetime


# ══════════════════════════════════════════
# CONSTANTES GLOBALES DE SISTEMA
# ══════════════════════════════════════════

class RecipeCalculationOutputs(BaseModel):
    recipe_id: uuid.UUID
    recipe_name: str
    base_harina_lbs: float
    # Ingredientes
    lbs_per_ingredient: dict[str, float]
    costo_per_ingredient: dict[str, float]
    total_masa_lbs: float
    total_costo_ingredientes: float
    # Producción
    panes_de_1oz: int
    filas_de_8_unidades: int
    panes_por_quintal: int
    # Costos operativos (escalados al base_harina_lbs)
    labor_with_benefits_per_qq: float
    gas_cost_per_qq: float
    costo_mano_obra: float
    costo_gas: float
    costo_formulacion_qq: float
    # Precio por unidad
    costo_por_pan: float
    # Rentabilidad
    sell_price_per_unit: float
    venta_total_qq: float
    utilidad_total_qq: float
    utilidad_por_unidad: float
    markup_ratio: float  # utilidad / costo (ej: 1.0173 = +1.73% sobre costo)


class RecipeConstantRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    constant_key: str
    value: float
    description: Optional[str]
    effective_from: date
    effective_to: Optional[date]
    is_active: bool

class RecipeConstantUpdate(BaseModel):
    value: float
    description: Optional[str] = None
    effective_from: Optional[date] = None  # defaults to today if omitted


# ══════════════════════════════════════════
# MÓDULO 2: RECETAS
# ══════════════════════════════════════════

class RecipeCreate(BaseModel):
    name: str
    base_unit: str = "unidades"
    estimated_yield: float = 1.0
    sell_price: float = 0.0
    description: Optional[str] = None
    instructions: Optional[str] = None
    bake_temp: Optional[float] = None
    bake_time: Optional[int] = None
    difficulty: Optional[str] = None
    panes_por_libra_harina: Optional[int] = None
    icon: Optional[str] = None

class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    base_unit: Optional[str] = None
    estimated_yield: Optional[float] = None
    sell_price: Optional[float] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    bake_temp: Optional[float] = None
    bake_time: Optional[int] = None
    difficulty: Optional[str] = None
    panes_por_libra_harina: Optional[int] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None

class RecipeIngredientCreate(BaseModel):
    inventory_item_id: uuid.UUID
    bakers_percent: float
    unit_cost_override: Optional[float] = None

class RecipeIngredientUpdate(BaseModel):
    bakers_percent: Optional[float] = None
    unit_cost_override: Optional[float] = None

class RecipeIngredientRead(BaseModel):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    item_name: str
    item_unit: str
    bakers_percent: float
    quantity: float          # alias de bakers_percent — retrocompatibilidad frontend
    unit_cost: float
    unit_cost_override: Optional[float] = None
    subtotal: float          # costo proporcional: (bakers_percent/100) * effective_cost

class RecipeRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    base_unit: str
    estimated_yield: float
    estimated_cost: float
    sell_price: float
    description: Optional[str] = None
    instructions: Optional[str] = None
    bake_temp: Optional[float] = None
    bake_time: Optional[int] = None
    difficulty: Optional[str] = None
    panes_por_libra_harina: Optional[int] = None
    icon: Optional[str] = None
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

class ProductionOrderComplete(BaseModel):
    actual_units: Optional[int] = None

class ProductionOrderRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    recipe_id: uuid.UUID
    recipe_name: str
    quantity: int
    actual_units: Optional[int]
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    harina_lbs: Optional[float] = None
    costo_produccion: Optional[float] = None
    venta_esperada: Optional[float] = None
    utilidad_diaria: Optional[float] = None
    production_date: Optional[date] = None


class DailySummaryRead(BaseModel):
    date: date
    orders_count: int
    harina_total_lbs: float
    costo_total: float
    venta_total: float
    utilidad_total: float

class OrderPreviewIngredient(BaseModel):
    name: str
    unit: str
    required: float
    available: float
    sufficient: bool

class OrderPreview(BaseModel):
    recipe_id: uuid.UUID
    recipe_name: str
    estimated_yield: float
    total_units: float
    estimated_cost: float
    ingredients: List[OrderPreviewIngredient]

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
    recipe_icon: Optional[str] = None
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


# ══════════════════════════════════════════
# MÓDULO 6: GASTOS GENERALES (OPEX)
# ══════════════════════════════════════════

class ExpenseLineCreate(BaseModel):
    category: ExpenseCategory
    cost_center: Optional[str] = None
    concept: str
    qty: float = 1.0
    unit_cost: float
    month: date
    notes: Optional[str] = None

class ExpenseLineUpdate(BaseModel):
    category: Optional[ExpenseCategory] = None
    cost_center: Optional[str] = None
    concept: Optional[str] = None
    qty: Optional[float] = None
    unit_cost: Optional[float] = None
    month: Optional[date] = None
    notes: Optional[str] = None

class ExpenseLineRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    category: ExpenseCategory
    cost_center: Optional[str]
    concept: str
    qty: float
    unit_cost: float
    total: float          # computed: qty × unit_cost
    month: date
    notes: Optional[str]
    is_active: bool
    created_at: datetime

class ExpenseCategoryTotals(BaseModel):
    operating_expense: float = 0.0
    owner_drawing: float = 0.0
    financing_cost: float = 0.0
    total: float = 0.0

class ExpenseSummary(BaseModel):
    month: date
    expenses: dict[str, List[ExpenseLineRead]]
    totals: ExpenseCategoryTotals


# ══════════════════════════════════════════
# MÓDULO 7: REPORTES (P&L Mensual)
# ══════════════════════════════════════════

class MonthlyProductRow(BaseModel):
    recipe_id: str
    recipe_name: str
    harina_total_lbs: float
    costo_total: float
    venta_total: float
    merma_al_costo: float
    utilidad_producto: float
    participacion_pct: float

class MonthlyTotals(BaseModel):
    harina_total_qq: float
    costo_total: float
    venta_total: float
    merma_total: float
    utilidad_operativa: float
    opex_operativo: float
    owner_drawing: float
    financing_cost: float
    opex_total: float
    utilidad_neta: float

class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    products: List[MonthlyProductRow]
    totals: MonthlyTotals


# ══════════════════════════════════════════
# MÓDULO 3: COCINA — Matriz Mensual
# ══════════════════════════════════════════

class DayCell(BaseModel):
    harina_lbs: float
    costo: float
    venta: float
    utilidad: float

class MatrixRecipeRow(BaseModel):
    recipe_id: str
    recipe_name: str
    sell_price: float
    days: dict[str, DayCell]      # key = str(day_number)
    totals: DayCell

class MatrixResponse(BaseModel):
    year: int
    month: int
    days: List[int]               # días con al menos una orden
    recipes: List[MatrixRecipeRow]
    daily_totals: dict[str, DayCell]
    grand_totals: DayCell


# ==========================================
# PERSONAL SHOPPER
# ==========================================

class ShopperCalcSnapshot(BaseModel):
    """Snapshot de la calculadora; se adjunta al crear una cotización."""
    product_price_usd: float
    tax_usd: float
    shipping_usd: float
    total_cost_usd: float
    total_cost_gtq: float
    profit_gtq: float
    margin_pct: float
    exchange_rate: float
    tax_rate: float
    weight_lbs: float
    cost_per_lb: float


class ShopperOrderCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = None
    product_description: str
    quantity: float = 1.0
    unit: str = "unidades"
    delivery_date: Optional[date] = None
    status: str = "pendiente"
    quoted_price: Optional[float] = None
    notes: Optional[str] = None
    calc: Optional[ShopperCalcSnapshot] = None


class ShopperOrderUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    product_description: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    delivery_date: Optional[date] = None
    status: Optional[str] = None
    quoted_price: Optional[float] = None
    notes: Optional[str] = None
    tracking_status: Optional[str] = None
    tracking_note: Optional[str] = None


class ShopperOrderRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    client_name: str
    client_phone: Optional[str] = None
    product_description: str
    quantity: float
    unit: str
    delivery_date: Optional[date] = None
    status: str
    quoted_price: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Snapshot de calculadora (puede ser None si se creó manualmente)
    calc_product_price_usd: Optional[float] = None
    calc_tax_usd:           Optional[float] = None
    calc_shipping_usd:      Optional[float] = None
    calc_total_cost_usd:    Optional[float] = None
    calc_total_cost_gtq:    Optional[float] = None
    calc_profit_gtq:        Optional[float] = None
    calc_margin_pct:        Optional[float] = None
    calc_exchange_rate:     Optional[float] = None
    calc_tax_rate:          Optional[float] = None
    calc_weight_lbs:        Optional[float] = None
    calc_cost_per_lb:       Optional[float] = None
    tracking_token:         Optional[uuid.UUID] = None
    tracking_status:        Optional[str] = None
    tracking_note:          Optional[str] = None
    tracking_updated_at:    Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# SHOPPER TRIPS (Modo Viaje de Compras)
# ==========================================

class ShopperTripCreate(BaseModel):
    store_name: str
    notes: Optional[str] = None


class ShopperTripUpdate(BaseModel):
    store_name: Optional[str] = None
    notes: Optional[str] = None
    ended_at: Optional[datetime] = None


class ShopperTripRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    store_name: str
    notes: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShopperTripItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price_gtq: Optional[float] = None
    stock: int = 1
    notes: Optional[str] = None


class ShopperTripItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price_gtq: Optional[float] = None
    stock: Optional[int] = None
    notes: Optional[str] = None


class ShopperTripItemRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    trip_id: uuid.UUID
    title: str
    description: Optional[str] = None
    price_gtq: Optional[float] = None
    stock: int
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# SHOPPER CATALOG — "La Maleta" (catálogo-juego del personal shopper)
# Paridad con ImportCatalog*, pero con calculadora maleta/caja propia.
# ==========================================

class ShopperCatalogSettingsRead(BaseModel):
    public_token: uuid.UUID
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None
    ai_copy_enabled: bool = False
    # Venta en vivo — visible sólo al dueño.
    store_status: str = "closed"          # closed | live
    store_name: Optional[str] = None
    store_opened_at: Optional[datetime] = None
    store_closes_at: Optional[datetime] = None
    store_banner_url: Optional[str] = None

    class Config:
        from_attributes = True


class ShopperStoreOpen(BaseModel):
    """Abre la venta en vivo. Duración por minutos o fecha exacta; sin ninguna
    de las dos = venta a mano (sin countdown, se cierra manualmente)."""
    store_name: Optional[str] = None
    minutes: Optional[int] = None
    closes_at: Optional[datetime] = None
    # Foto de fondo del banner (data URI redimensionado). Omitir = conserva la
    # anterior; "" = quitarla.
    banner_url: Optional[str] = None


class ShopperCatalogSettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    delivery_days_min: Optional[int] = None
    delivery_days_max: Optional[int] = None
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None
    ai_copy_enabled: Optional[bool] = None
    store_banner_url: Optional[str] = None


# ── Config PRIVADA de la calculadora (nunca pública) ──────────────────────────

class ShopperCalcSettingsRead(BaseModel):
    freight_mode: str = "maleta"          # maleta | caja
    exchange_rate: float = 7.75
    tax_rate: float = 7.0
    default_markup_pct: float = 30.0
    suitcase_cost_usd: Optional[float] = None
    suitcase_capacity_lbs: Optional[float] = None
    box_cost_usd: Optional[float] = None
    box_length_in: Optional[float] = None
    box_width_in: Optional[float] = None
    box_height_in: Optional[float] = None
    dim_unit: str = "in"                  # in | cm

    class Config:
        from_attributes = True


class ShopperCalcSettingsUpdate(BaseModel):
    freight_mode: Optional[str] = None
    exchange_rate: Optional[float] = None
    tax_rate: Optional[float] = None
    default_markup_pct: Optional[float] = None
    suitcase_cost_usd: Optional[float] = None
    suitcase_capacity_lbs: Optional[float] = None
    box_cost_usd: Optional[float] = None
    box_length_in: Optional[float] = None
    box_width_in: Optional[float] = None
    box_height_in: Optional[float] = None
    dim_unit: Optional[str] = None


# ── Snapshot de cálculo congelado al publicar un ítem ─────────────────────────

class ShopperItemCalcSnapshot(BaseModel):
    calc_mode: Optional[str] = None       # maleta | caja
    weight_lbs: Optional[float] = None
    volume_in3: Optional[float] = None
    cost_per_lb: Optional[float] = None
    cost_per_in3: Optional[float] = None
    tax_rate: Optional[float] = None
    exchange_rate: Optional[float] = None
    shipping_usd: Optional[float] = None
    tax_usd: Optional[float] = None
    total_cost_gtq: Optional[float] = None


class ShopperCatalogItemCreate(BaseModel):
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    price_usd: Optional[float] = None
    is_made_to_order: bool = True
    stock_total: int = 1
    is_published: bool = False
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    source: str = "manual"                # manual | trip | amazon | foto
    # Canal: 'live' (exige tienda abierta, se publica ya y se sella a la sesión) o
    # 'catalog' (Amazon/evergreen, disponible hasta expires_at).
    listing: str = "catalog"              # live | catalog
    expires_at: Optional[datetime] = None
    cost_gtq: Optional[float] = None      # costo manual (lo que te costó) → calc_total_cost_gtq
    calc: Optional[ShopperItemCalcSnapshot] = None


class ShopperCatalogItemUpdate(BaseModel):
    title: Optional[str] = None
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    price_usd: Optional[float] = None
    is_made_to_order: Optional[bool] = None
    stock_total: Optional[int] = None
    stock_sold: Optional[int] = None
    is_published: Optional[bool] = None
    is_offer: Optional[bool] = None
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    cost_gtq: Optional[float] = None      # costo manual → calc_total_cost_gtq
    calc: Optional[ShopperItemCalcSnapshot] = None


class ShopperCatalogItemRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    source: str
    trip_item_id: Optional[uuid.UUID] = None
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    price_usd: Optional[float] = None
    is_made_to_order: bool = True
    stock_total: int
    stock_sold: int
    stock_available: int
    listing: str = "catalog"              # live | catalog
    expires_at: Optional[datetime] = None
    is_published: bool
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    last_reserved_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    # Snapshot de cálculo (visible sólo al dueño; la lectura va por tenant).
    calc_mode: Optional[str] = None
    calc_weight_lbs: Optional[float] = None
    calc_volume_in3: Optional[float] = None
    calc_total_cost_gtq: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShopperPayInfo(BaseModel):
    """Datos de pago que ve el cliente (nunca datos internos del tenant)."""
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None


class PublicShopperCatalogItem(BaseModel):
    id: uuid.UUID
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    is_made_to_order: bool = True
    stock_available: int
    reserved_count: int = 0
    # Escasez honesta: 'remaining' = unidades reales que quedan cuando el shopper
    # las trae en mano (null si es por encargo, no hay número honesto). 'closed' =
    # el ítem ya no se puede apartar (tienda cerrada / vencido / agotado).
    remaining: Optional[int] = None
    closed: bool = False
    listing: str = "catalog"              # live | catalog
    expires_at: Optional[datetime] = None
    # price_usd / costos / calc_* / capacidad NUNCA se exponen al cliente.
    image_url: Optional[str] = None
    last_reserved_at: Optional[datetime] = None
    bought_with: list[uuid.UUID] = []


class PublicShopperCatalog(BaseModel):
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    # Venta en vivo: status EFECTIVO (ya considera el reloj), nombre y cierre.
    store_status: str = "closed"          # closed | live
    store_name: Optional[str] = None
    store_closes_at: Optional[datetime] = None
    # Foto del banner. Es una imagen que el dueño eligió mostrar al cliente, así que
    # exponerla es el punto; no revela costos ni capacidad.
    store_banner_url: Optional[str] = None
    categories: list[str] = []
    reserved_people: int = 0
    reserved_units: int = 0
    pay_info: Optional[ShopperPayInfo] = None
    items: list[PublicShopperCatalogItem]
    # Stamp de versión del catálogo — el cliente lo compara contra el pulso para
    # saber si hay que refrescar. No es sensible (mismo dato que reserved_*).
    v: str = ""


class PublicShopperPulse(BaseModel):
    """Latido barato del catálogo público: el cliente lo pollea seguido y solo
    refetchea el catálogo completo cuando `v` cambia. Nunca expone costos ni PII."""
    v: str
    live: bool = False
    closes_at: Optional[datetime] = None


# ── Reservas ──────────────────────────────

class ShopperReservationCreate(BaseModel):
    client_name: str
    client_phone: str
    quantity: int = 1
    deposit_amount: Optional[float] = None
    notes: Optional[str] = None


class ShopperManualSaleCreate(BaseModel):
    """El dueño registra a mano una venta que llegó por otro medio (WhatsApp, en
    persona, teléfono). Va por get_current_tenant_id, no por el token público, y a
    diferencia del apartado del cliente puede nacer en cualquier estado del flujo:
    lo que ya se entregó se registra como entregado, no como apartado."""
    catalog_item_id: uuid.UUID
    client_name: str
    client_phone: str
    quantity: int = 1
    status: str = "confirmada"
    notes: Optional[str] = None


class ShopperReservationUpdate(BaseModel):
    # status: cualquiera de SHOPPER_STATUS_FLOW / SHOPPER_OFF_RAMP.
    # La validez de la transición la impone SHOPPER_VALID_TRANSITIONS en el router.
    status: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_item_id: Optional[uuid.UUID] = None


class ShopperReservationRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    catalog_item_id: uuid.UUID
    order_token: Optional[uuid.UUID] = None
    client_name: str
    client_phone: str
    client_token: uuid.UUID
    quantity: int
    status: str
    deposit_amount: Optional[float] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    expires_at: datetime
    confirmed_at: Optional[datetime] = None
    comprada_at: Optional[datetime] = None
    en_camino_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    no_disponible_at: Optional[datetime] = None
    cancelada_at: Optional[datetime] = None
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_item_id: Optional[uuid.UUID] = None
    replaces_reservation_id: Optional[uuid.UUID] = None
    client_notified_at: Optional[datetime] = None
    resolved_by_substitute: bool = False
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Desnormalizado para el dueño (esta lectura va por get_current_tenant_id).
    item_title: Optional[str] = None
    item_image_url: Optional[str] = None
    item_price_gtq: Optional[float] = None
    item_amazon_url: Optional[str] = None

    class Config:
        from_attributes = True


class PublicShopperReservationRead(BaseModel):
    id: uuid.UUID
    client_token: uuid.UUID
    order_token: Optional[uuid.UUID] = None
    order_pin: Optional[str] = None
    client_name: str
    quantity: int
    status: str
    deposit_amount: Optional[float] = None
    expires_at: datetime
    item_title: str
    item_price_gtq: Optional[float] = None
    whatsapp_number: Optional[str] = None
    created_at: datetime


class PublicShopperOrderLine(BaseModel):
    """Una reserva dentro del pedido acumulado ('En mi maleta') del cliente."""
    id: uuid.UUID
    item_id: uuid.UUID
    item_title: str
    item_image_url: Optional[str] = None
    item_price_gtq: Optional[float] = None
    quantity: int
    status: str
    editable: bool = False
    stock_available: int = 0
    expires_at: datetime
    created_at: datetime
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_items: list[PublicShopperCatalogItem] = []
    resolved_by_substitute: bool = False


class PublicShopperOrderLineUpdate(BaseModel):
    """Cliente edita la cantidad de una línea pendiente de su pedido."""
    quantity: int


class ShopperOrderLookupBody(BaseModel):
    """Cliente recupera su pedido con su WhatsApp + PIN de 4 dígitos."""
    phone: str
    pin: str
    catalog_token: uuid.UUID


class PublicShopperOrder(BaseModel):
    """Pedido acumulado: todas las reservas de un mismo cliente, sin login."""
    order_token: uuid.UUID
    order_pin: Optional[str] = None
    catalog_token: Optional[uuid.UUID] = None
    client_name: str
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    pay_info: Optional[ShopperPayInfo] = None
    lines: list[PublicShopperOrderLine]
    subtotal_gtq: float = 0            # antes del cupón (= Σ precio·qty de líneas activas)
    total_gtq: float = 0              # subtotal − descuento del cupón
    total_items: int = 0
    # Cupón aplicado al pedido (público — nunca costo/margen/redeemed_count).
    coupon_code: Optional[str] = None
    coupon_discount_gtq: float = 0
    coupon_note: Optional[str] = None      # p.ej. "Aplica desde Q200" cuando no llega al mínimo
    coupon_expires_at: Optional[datetime] = None


# ==========================================
# SHOPPER — Cupones de descuento
# ==========================================
class ShopperCouponInput(BaseModel):
    """Dueño crea/edita un cupón. `code` opcional en create → autogenerado."""
    code: Optional[str] = None
    discount_type: Literal["percent", "fixed"] = "percent"
    percent_off: Optional[float] = None
    amount_off_gtq: Optional[float] = None
    max_discount_gtq: Optional[float] = None
    min_subtotal_gtq: Optional[float] = None
    min_margin_pct: float = 0
    # Default "un solo canje total"; el dueño lo sube a N o lo pone null (ilimitado).
    max_redemptions: Optional[int] = 1
    per_customer_limit: int = 1
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    label: Optional[str] = None
    is_active: Optional[bool] = None       # solo en update (toggle on/off)


class ShopperCouponRead(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    percent_off: Optional[float] = None
    amount_off_gtq: Optional[float] = None
    max_discount_gtq: Optional[float] = None
    min_subtotal_gtq: Optional[float] = None
    min_margin_pct: float = 0
    max_redemptions: Optional[int] = None
    per_customer_limit: int = 1
    redeemed_count: int = 0
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    label: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    # Alerta de margen para el dueño (calculada en el router, solo endpoints de dueño).
    could_go_below_cost: bool = False

    class Config:
        from_attributes = True


class CouponRedemptionRead(BaseModel):
    """Auditoría de un canje (endpoint de dueño). Incluye margen — nunca público."""
    id: uuid.UUID
    order_token: uuid.UUID
    client_phone: str
    status: str
    discount_gtq: float = 0
    subtotal_gtq: float = 0
    margin_gtq: Optional[float] = None
    margin_pct: Optional[float] = None
    below_cost: bool = False
    created_at: datetime
    released_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CouponApplyBody(BaseModel):
    code: str


class CouponPreview(BaseModel):
    """Preview público: valida sin consumir. Nunca revela costo/margen/usos."""
    valid: bool
    discount_gtq: float = 0
    subtotal_gtq: float = 0
    new_total_gtq: float = 0
    coupon_code: Optional[str] = None
    coupon_expires_at: Optional[datetime] = None
    reason: Optional[str] = None           # genérico; o "Aplica desde QX" (mínimo)


class ShopperStatsBucket(BaseModel):
    """Un balde del reporte honesto. `revenue_gtq` es bruto (precio de lista × cantidad);
    `net_revenue_gtq` = bruto − cupón atribuido; `profit_gtq` = neto − costo. `cost_gtq`
    usa el costo real de la calculadora cuando existe, o precio×ratio asumido si no —
    `assumed_cost_lines` cuenta cuántas líneas caen en ese supuesto (transparencia)."""
    revenue_gtq: float = 0
    coupon_gtq: float = 0
    net_revenue_gtq: float = 0
    cost_gtq: float = 0
    profit_gtq: float = 0
    units: int = 0
    lines: int = 0
    orders: int = 0
    assumed_cost_lines: int = 0


class ShopperStatsProduct(BaseModel):
    catalog_item_id: uuid.UUID
    title: str
    image_url: Optional[str] = None
    units: int = 0
    net_revenue_gtq: float = 0
    profit_gtq: float = 0


class ShopperStatsRead(BaseModel):
    """Reporting HONESTO del Personal Shopper — reemplaza el `summary` mentiroso del
    front (mezclaba pendiente con realizado y no restaba cupones). Tres baldes por
    avance real del pedido: `potential` (pendiente, aún puede evaporarse) · `committed`
    (confirmada/comprada/en_camino, en firme) · `realized` (entregada, plata de verdad).
    Todo neteado de cupones. USD con el tipo de cambio de la calculadora."""
    period_days: int = 0                  # 0 = histórico completo
    generated_at: datetime
    exchange_rate: float

    potential: ShopperStatsBucket
    committed: ShopperStatsBucket
    realized: ShopperStatsBucket

    # Derivados del balde realizado (lo que cuenta de verdad)
    realized_profit_usd: float = 0
    avg_ticket_gtq: float = 0             # net_revenue realizado / pedidos realizados
    fulfillment_rate: float = 0          # entregadas / (entregadas + canceladas + no_disponible)

    # Fugas visibles (no escondidas)
    cancelled_lines: int = 0
    unavailable_lines: int = 0
    expired_lines: int = 0

    # Extras
    total_coupon_gtq: float = 0          # todos los cupones 'held' vivos
    unique_customers: int = 0
    recurring_customers: int = 0         # teléfonos con >1 pedido
    top_products: list[ShopperStatsProduct] = []


class ShopperStoreSessionRead(BaseModel):
    """Una venta en vivo del histórico. Las cifras NO están congeladas: se derivan de
    las reservas creadas dentro de la ventana, así que si un pedido se entrega o se
    cancela después del cierre, esta venta lo refleja. `revenue_gtq` es lo apartado
    (bruto); `delivered_*` es lo que de verdad se cobró y entregó."""
    id: uuid.UUID
    store_name: Optional[str] = None
    banner_url: Optional[str] = None
    opened_at: datetime
    closed_at: Optional[datetime] = None   # null = venta en curso
    closes_at: Optional[datetime] = None

    units: int = 0
    reservations: int = 0
    clients: int = 0
    revenue_gtq: float = 0
    delivered_units: int = 0
    delivered_revenue_gtq: float = 0
    delivered_profit_gtq: float = 0
    cancelled_lines: int = 0
    top_title: Optional[str] = None
    top_units: int = 0


# ==========================================
# IMPORTACIONES — Catálogo público
# (espejo de ShopperCatalog*, nativo del módulo importaciones)
# ==========================================

class ImportCatalogSettingsRead(BaseModel):
    public_token: uuid.UUID
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None
    ai_copy_enabled: bool = False

    class Config:
        from_attributes = True


class ImportCatalogSettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    delivery_days_min: Optional[int] = None
    delivery_days_max: Optional[int] = None
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None
    ai_copy_enabled: Optional[bool] = None


class ImportCatalogItemCreate(BaseModel):
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    is_made_to_order: bool = True
    stock_total: int = 1
    is_published: bool = False
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    source: str = "manual"


class ImportCatalogItemUpdate(BaseModel):
    title: Optional[str] = None
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    is_made_to_order: Optional[bool] = None
    stock_total: Optional[int] = None
    stock_sold: Optional[int] = None
    is_published: Optional[bool] = None
    is_offer: Optional[bool] = None
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None


class ImportCatalogItemRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    source: str
    cotizacion_id: Optional[uuid.UUID] = None
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    is_made_to_order: bool = True
    stock_total: int
    stock_sold: int
    stock_available: int
    is_published: bool
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    last_reserved_at: Optional[datetime] = None
    amazon_url: Optional[str] = None
    amazon_asin: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PublicImportCatalogItem(BaseModel):
    id: uuid.UUID
    title: str
    hook: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_gtq: Optional[float] = None
    is_offer: bool = False
    compare_at_price_gtq: Optional[float] = None
    offer_ends_at: Optional[datetime] = None
    # Por encargo: se compra cuando el cliente aparta. El front no muestra escasez.
    is_made_to_order: bool = True
    # Cuántas unidades más puede pedir el cliente. En un ítem por encargo es un tope
    # de cordura, no un inventario; en uno con stock físico son las unidades libres.
    stock_available: int
    # Unidades ya apartadas de este ítem (reservadas + vendidas). Dato real, sin
    # denominador inventado: alimenta el ranking "Los más apartados".
    reserved_count: int = 0
    # `stock_total` NO se expone: en los ítems por encargo no significa nada y en
    # los de stock físico revelaría el inventario del negocio.
    # amazon_url / asin NO se exponen: el cliente no debe poder rastrear la fuente.
    image_url: Optional[str] = None
    last_reserved_at: Optional[datetime] = None
    # "Frecuentemente juntos": IDs de ítems que otros clientes apartaron en el
    # mismo pedido que éste (co-ocurrencia real por order_token). Heurística pura,
    # sin IA ni datos personales — el front resuelve los IDs contra los ítems que
    # ya tiene y los muestra como sugerencia priorizada.
    bought_with: list[uuid.UUID] = []


class PublicPayInfo(BaseModel):
    """Datos de pago que ve el cliente (nunca datos internos del tenant)."""
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_type: Optional[str] = None


class PublicImportCatalog(BaseModel):
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    # Logo del negocio (Tenant.logo_url, data URI o URL) para brandear el
    # encabezado del catálogo público de forma profesional.
    logo_url: Optional[str] = None
    # Color de marca del negocio (Tenant.theme_color) para que la página pública
    # respete la identidad de cada empresa en vez del verde fijo de Nodo.
    theme_color: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    # Terminología configurable (null = usar default en el cliente).
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    categories: list[str] = []
    # Momentum real del lote en vuelo: cuánta gente ya apartó y cuántas unidades
    # llevan. Sustituye a la barra de "cupo apartado", que dividía entre un
    # `stock_total` inventado. Números absolutos, sin porcentaje.
    reserved_people: int = 0
    reserved_units: int = 0
    pay_info: Optional[PublicPayInfo] = None
    items: list[PublicImportCatalogItem]


class ImportReservationCreate(BaseModel):
    client_name: str
    client_phone: str
    quantity: int = 1
    deposit_amount: Optional[float] = None
    notes: Optional[str] = None


class ImportReservationUpdate(BaseModel):
    # status: cualquiera de STATUS_FLOW / OFF_RAMP (ver models.import_catalog).
    # La validez de la transición la impone VALID_TRANSITIONS en el router.
    status: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    # Sólo relevantes al salir del flujo feliz (no_disponible / cancelada).
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_item_id: Optional[uuid.UUID] = None


class ImportReservationRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    catalog_item_id: uuid.UUID
    order_token: Optional[uuid.UUID] = None
    client_name: str
    client_phone: str
    client_token: uuid.UUID
    quantity: int
    status: str
    deposit_amount: Optional[float] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    expires_at: datetime
    confirmed_at: Optional[datetime] = None
    comprada_at: Optional[datetime] = None
    en_camino_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    no_disponible_at: Optional[datetime] = None
    cancelada_at: Optional[datetime] = None
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_item_id: Optional[uuid.UUID] = None
    replaces_reservation_id: Optional[uuid.UUID] = None
    client_notified_at: Optional[datetime] = None
    resolved_by_substitute: bool = False
    is_active: bool
    created_at: datetime
    updated_at: datetime
    item_title: Optional[str] = None
    item_image_url: Optional[str] = None
    item_price_gtq: Optional[float] = None
    # Link de compra en Amazon del ítem: sólo se expone al DUEÑO (esta lectura va
    # por get_current_tenant_id), para que sepa exactamente qué comprar al confirmar.
    # NUNCA se expone en las lecturas públicas (ver _public_item / PublicImportCatalogItem).
    item_amazon_url: Optional[str] = None

    class Config:
        from_attributes = True


class PublicImportReservationRead(BaseModel):
    id: uuid.UUID
    client_token: uuid.UUID
    order_token: Optional[uuid.UUID] = None
    # PIN de 4 dígitos del pedido — el cliente lo guarda para recuperar su pedido
    # con su WhatsApp + PIN sin el link directo.
    order_pin: Optional[str] = None
    client_name: str
    quantity: int
    status: str
    deposit_amount: Optional[float] = None
    expires_at: datetime
    item_title: str
    item_price_gtq: Optional[float] = None
    whatsapp_number: Optional[str] = None
    created_at: datetime


class PublicImportOrderLine(BaseModel):
    """Una reserva dentro del pedido acumulado del cliente."""
    id: uuid.UUID
    item_id: uuid.UUID
    item_title: str
    item_image_url: Optional[str] = None
    item_price_gtq: Optional[float] = None
    quantity: int
    status: str
    # El cliente solo puede editar/quitar mientras la línea esté 'pendiente'.
    editable: bool = False
    stock_available: int = 0
    expires_at: datetime
    created_at: datetime
    # Desenlace no_disponible: mensaje cálido del vendedor + reemplazos ofrecidos
    # (el fijado por el vendedor primero, luego auto-rankeados por heurística).
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    suggested_items: list[PublicImportCatalogItem] = []
    # True si esta línea no_disponible ya fue resuelta con una sustituta activa.
    resolved_by_substitute: bool = False


class PublicOrderLineUpdate(BaseModel):
    """Cliente edita la cantidad de una línea pendiente de su pedido."""
    quantity: int


class OrderLookupBody(BaseModel):
    """Cliente recupera su pedido con su WhatsApp + PIN de 4 dígitos.

    `catalog_token` acota la búsqueda al negocio dueño de ese catálogo: sin él, un
    (teléfono, PIN) que coincidiera en dos negocios podría devolver el pedido del
    otro.
    """
    phone: str
    pin: str
    catalog_token: uuid.UUID


class PublicImportOrder(BaseModel):
    """Pedido acumulado: todas las reservas de un mismo cliente, sin login."""
    order_token: uuid.UUID
    order_pin: Optional[str] = None
    catalog_token: Optional[uuid.UUID] = None
    client_name: str
    business_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    trip_name: Optional[str] = None
    trip_close_at: Optional[datetime] = None
    trip_label: Optional[str] = None
    origin_label: Optional[str] = None
    delivery_days_min: int = 5
    delivery_days_max: int = 7
    pay_info: Optional[PublicPayInfo] = None
    lines: list[PublicImportOrderLine]
    total_gtq: float = 0
    total_items: int = 0


# ==========================================
# VENTAS (Catálogo público con stock)
# ==========================================

class StoreSettingsRead(BaseModel):
    public_token: uuid.UUID
    is_open: bool
    reservation_ttl_minutes: int


class StoreSettingsUpdate(BaseModel):
    is_open: Optional[bool] = None
    reservation_ttl_minutes: Optional[int] = None


class StoreProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    cost: float = 0
    # Gancho de venta: precio "antes" tachado + etiqueta llamativa
    compare_at_price: Optional[float] = None
    badge: Optional[str] = None
    image_url: Optional[str] = None
    stock_qty: int = 0
    is_published: bool = True


class StoreProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    compare_at_price: Optional[float] = None
    badge: Optional[str] = None
    image_url: Optional[str] = None
    stock_qty: Optional[int] = None
    is_published: Optional[bool] = None


class StoreProductRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    price: float
    cost: float
    compare_at_price: Optional[float] = None
    badge: Optional[str] = None
    image_url: Optional[str] = None
    stock_qty: int
    reserved_qty: int
    available: int
    is_published: bool


class StoreOrderItemRead(BaseModel):
    product_id: uuid.UUID
    product_name: str
    qty: int
    unit_price: float


class StoreOrderRead(BaseModel):
    id: uuid.UUID
    short_code: str
    public_token: uuid.UUID
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    channel: str
    status: str
    expires_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    total: float
    created_at: datetime
    items: List[StoreOrderItemRead]


class StoreKpis(BaseModel):
    nuevos: int
    por_entregar: int
    por_cobrar: int
    cobrado_hoy: float
    ganancia_hoy: float
    invertido: float
    stock_critico: int


class StoreMonitorRead(BaseModel):
    orders: List[StoreOrderRead]
    kpis: StoreKpis


class QuickSaleItem(BaseModel):
    product_id: uuid.UUID
    qty: int
    unit_price: Optional[float] = None   # None → usa el precio del catálogo


class QuickSaleCreate(BaseModel):
    items: List[QuickSaleItem]
    payment_method: str = "efectivo"


class WasteItemIn(BaseModel):
    product_id: uuid.UUID
    qty: int


class StoreWasteCreate(BaseModel):
    items: List[WasteItemIn]
    reason: str   # se_arruino | perdida | correccion
    note: Optional[str] = None


class StoreClientRead(BaseModel):
    customer_phone: str
    customer_name: str
    orders_count: int
    total_paid: float
    last_order_at: datetime


PromoType = Literal["percent", "two_for_one", "compare_at", "bundle", "badge"]


class StorePromotionCreate(BaseModel):
    title: str
    promo_type: PromoType = "percent"
    value: Optional[float] = None
    product_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    urgency_text: Optional[str] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_published: bool = True


class StorePromotionUpdate(BaseModel):
    title: Optional[str] = None
    promo_type: Optional[PromoType] = None
    value: Optional[float] = None
    product_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    urgency_text: Optional[str] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_published: Optional[bool] = None


class StorePromotionRead(BaseModel):
    id: uuid.UUID
    title: str
    promo_type: PromoType
    value: Optional[float] = None
    product_id: Optional[uuid.UUID] = None
    product_name: Optional[str] = None
    description: Optional[str] = None
    urgency_text: Optional[str] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_published: bool
    # Calculado: hoy ∈ [starts_on, ends_on] y is_published
    is_live: bool


# ==========================================
# CITAS (Agenda pública con confirmación)
# ==========================================

class BookingSettingsRead(BaseModel):
    public_token: uuid.UUID
    is_open: bool
    confirmation_mode: str
    slot_granularity_minutes: int
    min_notice_hours: int
    max_days_ahead: int
    timezone: str


class BookingSettingsUpdate(BaseModel):
    is_open: Optional[bool] = None
    confirmation_mode: Optional[Literal["manual", "auto"]] = None
    slot_granularity_minutes: Optional[int] = None
    min_notice_hours: Optional[int] = None
    max_days_ahead: Optional[int] = None
    timezone: Optional[str] = None


class BookingServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float = 0
    duration_minutes: int = 30
    is_published: bool = True


class BookingServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    duration_minutes: Optional[int] = None
    is_published: Optional[bool] = None


class BookingServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int
    is_published: bool


class BookingHourIn(BaseModel):
    weekday: int
    start_time: time
    end_time: time


class BookingHourRead(BaseModel):
    id: uuid.UUID
    weekday: int
    start_time: time
    end_time: time


class BookingExceptionCreate(BaseModel):
    date: date
    is_closed: bool = True
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    note: Optional[str] = None


class BookingExceptionRead(BaseModel):
    id: uuid.UUID
    date: date
    is_closed: bool
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    note: Optional[str] = None


class BookingAppointmentRead(BaseModel):
    id: uuid.UUID
    short_code: str
    public_token: uuid.UUID
    customer_name: str
    customer_phone: str
    customer_note: Optional[str] = None
    service_id: uuid.UUID
    service_name: str
    service_price: float
    duration_minutes: int
    starts_at: datetime
    ends_at: datetime
    status: str
    confirmed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    created_at: datetime


class BookingAgendaRead(BaseModel):
    appointments: List[BookingAppointmentRead]
    pending_count: int


class BookingAppointmentCreate(BaseModel):
    """Cita creada por el negocio (walk-in o por teléfono) — nace confirmada."""
    service_id: uuid.UUID
    starts_at: datetime
    customer_name: str
    customer_phone: str
    customer_note: Optional[str] = None


# ── OFERTAS (gancho por días específicos) ──

OfferType = Literal["percent", "two_for_one", "fixed"]


class BookingOfferCreate(BaseModel):
    title: str
    description: Optional[str] = None
    offer_type: OfferType
    value: Optional[float] = None          # percent: % | fixed: precio rebajado | 2x1: null
    service_id: Optional[uuid.UUID] = None  # null = todos los servicios
    starts_on: date
    ends_on: date
    is_published: bool = True


class BookingOfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    offer_type: Optional[OfferType] = None
    value: Optional[float] = None
    service_id: Optional[uuid.UUID] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_published: Optional[bool] = None


class BookingOfferRead(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    offer_type: str
    value: Optional[float] = None
    service_id: Optional[uuid.UUID] = None
    service_name: Optional[str] = None
    starts_on: date
    ends_on: date
    is_published: bool


# ── RESUMEN DE MES / PENDIENTES (calendario del dueño) ──

class BookingDaySummary(BaseModel):
    date: date
    total: int          # citas activas (pendiente + confirmada) del día
    pending: int        # de esas, cuántas están por confirmar
    has_offer: bool     # hay alguna oferta vigente ese día


class BookingMonthRead(BaseModel):
    month: str          # "YYYY-MM"
    days: List[BookingDaySummary]
    pending_total: int  # pendientes futuras del tenant (foco al abrir el módulo)


# ==========================================
# BILLING (suscripción del tenant — pago manual)
# ==========================================
class BillingPlanRead(BaseModel):
    id: uuid.UUID
    name: str
    price: float
    currency: str
    module_ids: List[uuid.UUID]


class BillingRequestCreate(BaseModel):
    plan_id: uuid.UUID
    note: Optional[str] = None


class BillingRequestRead(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: Optional[str] = None
    status: str
    note: Optional[str] = None
    created_at: datetime


class BillingMeRead(BaseModel):
    billing_status: Optional[str] = None
    access_state: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    trial_days_remaining: Optional[int] = None
    grace_days_remaining: Optional[int] = None
    current_plan_id: Optional[uuid.UUID] = None
    current_plan_name: Optional[str] = None
    pending_request: Optional[BillingRequestRead] = None


class AdminBillingRequestRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_name: Optional[str] = None
    plan_id: uuid.UUID
    plan_name: Optional[str] = None
    status: str
    note: Optional[str] = None
    created_at: datetime
