import uuid
from typing import Optional, List, Literal
from datetime import datetime, date
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