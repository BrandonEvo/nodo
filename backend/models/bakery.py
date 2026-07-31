import uuid
from decimal import Decimal
from datetime import datetime, timezone, date
from enum import Enum
from typing import Optional, List
from sqlalchemy import Column, Numeric, UniqueConstraint, Enum as SAEnum, String, Text
from sqlmodel import Field, Relationship, SQLModel
from .mixins import AuditBase


class ExpenseCategory(str, Enum):
    OPERATING_EXPENSE = "operating_expense"
    OWNER_DRAWING     = "owner_drawing"
    FINANCING_COST    = "financing_cost"


# ══════════════════════════════════════════
# CONSTANTES GLOBALES DE SISTEMA
# ══════════════════════════════════════════

DEFAULT_CONSTANTS = [
    {"constant_key": "labor_rate_per_qq",  "value": Decimal("65.00"),  "description": "Pago base mano de obra por quintal"},
    {"constant_key": "benefits_factor",    "value": Decimal("0.45"),   "description": "Factor prestaciones (45%)"},
    {"constant_key": "gas_price_per_unit", "value": Decimal("545.10"), "description": "Precio cilindro de gas"},
    {"constant_key": "gas_lbs_per_qq",     "value": Decimal("12.00"),  "description": "Consumo lb-gas por quintal"},
    {"constant_key": "ounces_per_unit",    "value": Decimal("0.75"),   "description": "Peso final pan (oz)"},
    {"constant_key": "gas_cylinder_lbs",   "value": Decimal("100.00"), "description": "Peso estándar del cilindro de gas en libras"},
]


class RecipeConstants(AuditBase, table=True):
    __tablename__ = "recipe_constants"
    __table_args__ = (
        UniqueConstraint("tenant_id", "constant_key", "effective_from", name="uq_recipe_constants_tenant_key_date"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    constant_key: str = Field(max_length=50, index=True)
    value: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    description: Optional[str] = Field(default=None, max_length=200)
    effective_from: date
    effective_to: Optional[date] = Field(default=None)


# ══════════════════════════════════════════
# MÓDULO 1: BODEGA (Inventario)
# ══════════════════════════════════════════

class InventoryItem(AuditBase, table=True):
    __tablename__ = "inventory_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=100)
    unit: str = Field(max_length=30, default="kg")
    current_stock: float = Field(default=0.0)
    minimum_stock: float = Field(default=0.0)
    last_unit_cost: float = Field(default=0.0)
    category: Optional[str] = Field(default=None, max_length=60)

    recipe_ingredients: List["RecipeIngredient"] = Relationship(back_populates="item")
    price_history: List["InventoryPriceHistory"] = Relationship(back_populates="item")
    stock_movements: List["StockMovement"] = Relationship(back_populates="item")


class InventoryPriceHistory(AuditBase, table=True):
    __tablename__ = "inventory_price_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    inventory_item_id: uuid.UUID = Field(foreign_key="inventory_items.id", index=True)
    unit_cost: float
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    item: InventoryItem = Relationship(back_populates="price_history")


class StockMovement(AuditBase, table=True):
    __tablename__ = "stock_movements"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    inventory_item_id: uuid.UUID = Field(foreign_key="inventory_items.id", index=True)
    move_type: str = Field(max_length=20)  # 'entrada' | 'ajuste'
    quantity: float
    unit_cost: Optional[float] = Field(default=None)
    stock_after: float
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    item: InventoryItem = Relationship(back_populates="stock_movements")


# ══════════════════════════════════════════
# MÓDULO 2: RECETAS (Base de Producción)
# ══════════════════════════════════════════

class Recipe(AuditBase, table=True):
    __tablename__ = "recipes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=100)
    base_unit: str = Field(max_length=30, default="unidades")
    estimated_yield: float = Field(default=1.0)
    estimated_cost: float = Field(default=0.0)
    sell_price: float = Field(default=0.0)
    description: Optional[str] = Field(default=None, max_length=500)
    instructions: Optional[str] = Field(default=None)
    bake_temp: Optional[float] = Field(default=None)
    bake_time: Optional[int] = Field(default=None)
    difficulty: Optional[str] = Field(default=None, max_length=20)
    # Baker's %: unidades producidas por libra de harina (ej: 36 para pan francés)
    panes_por_libra_harina: Optional[int] = Field(default=None)
    icon: Optional[str] = Field(default=None, max_length=10)

    ingredients: List["RecipeIngredient"] = Relationship(back_populates="recipe")
    production_orders: List["ProductionOrder"] = Relationship(back_populates="recipe")
    sale_items: List["SaleItem"] = Relationship(back_populates="recipe")


class RecipeIngredient(AuditBase, table=True):
    __tablename__ = "recipe_ingredients"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    recipe_id: uuid.UUID = Field(foreign_key="recipes.id", index=True)
    inventory_item_id: uuid.UUID = Field(foreign_key="inventory_items.id", index=True)
    # Baker's Percentage: 100.0 = harina base, 60.0 = 60% de la harina, etc.
    bakers_percent: Decimal = Field(
        default=Decimal("100.0"),
        sa_column=Column(Numeric(10, 4), nullable=False),
    )
    # Precio unitario específico para este ingrediente en esta receta (override de last_unit_cost)
    unit_cost_override: Optional[Decimal] = Field(
        default=None,
        sa_column=Column(Numeric(10, 4), nullable=True),
    )

    recipe: Recipe = Relationship(back_populates="ingredients")
    item: InventoryItem = Relationship(back_populates="recipe_ingredients")


# ══════════════════════════════════════════
# MÓDULO 3: COCINA (Producción)
# ══════════════════════════════════════════

class ProductionOrder(AuditBase, table=True):
    __tablename__ = "production_orders"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    recipe_id: uuid.UUID = Field(foreign_key="recipes.id", index=True)
    quantity: int = Field(default=1)
    actual_units: Optional[int] = Field(default=None)
    status: str = Field(default="pending", max_length=20)  # pending | en_proceso | completed
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    # Cálculos diarios al completar la orden
    harina_lbs: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    costo_produccion: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    venta_esperada: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    utilidad_diaria: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    production_date: Optional[date] = Field(default=None)

    recipe: Recipe = Relationship(back_populates="production_orders")
    waste_logs: List["WasteLog"] = Relationship(back_populates="order")


class WasteLog(AuditBase, table=True):
    __tablename__ = "waste_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    production_order_id: uuid.UUID = Field(foreign_key="production_orders.id", index=True)
    quantity: float = Field(default=1.0)
    reason: Optional[str] = Field(default=None, max_length=300)

    order: ProductionOrder = Relationship(back_populates="waste_logs")


# ══════════════════════════════════════════
# MÓDULO 4: MOSTRADOR (Punto de Venta)
# ══════════════════════════════════════════

class Sale(AuditBase, table=True):
    __tablename__ = "sales"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    total: float = Field(default=0.0)
    payment_method: str = Field(default="efectivo", max_length=30)

    items: List["SaleItem"] = Relationship(back_populates="sale")


class SaleItem(AuditBase, table=True):
    __tablename__ = "sale_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    sale_id: uuid.UUID = Field(foreign_key="sales.id", index=True)
    recipe_id: uuid.UUID = Field(foreign_key="recipes.id", index=True)
    quantity: int = Field(default=1)
    price: float = Field(default=0.0)
    freshness_tag: str = Field(default="fresco", max_length=20)  # fresco | ayer

    sale: Sale = Relationship(back_populates="items")
    recipe: Recipe = Relationship(back_populates="sale_items")


# ══════════════════════════════════════════
# MÓDULO 5: CIERRE (Transición de Turno)
# ══════════════════════════════════════════

class ShiftRegister(AuditBase, table=True):
    __tablename__ = "shift_registers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    expected_cash: float = Field(default=0.0)
    actual_cash: float = Field(default=0.0)
    difference: float = Field(default=0.0)
    card_total: float = Field(default=0.0)
    total_sales: float = Field(default=0.0)
    ticket_count: int = Field(default=0)
    notes: Optional[str] = Field(default=None, max_length=500)
    closed_at: Optional[datetime] = Field(default=None)


# ══════════════════════════════════════════
# MÓDULO 6: GASTOS GENERALES (OPEX)
# ══════════════════════════════════════════

class ExpenseLine(AuditBase, table=True):
    __tablename__ = "expense_lines"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    category: str = Field(
        sa_column=Column(
            SAEnum(
                ExpenseCategory,
                name="expensecategory",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
        )
    )
    cost_center: Optional[str] = Field(default=None, max_length=50)
    concept: str = Field(max_length=200)
    qty: Decimal = Field(default=Decimal("1"), sa_column=Column(Numeric(10, 2), nullable=False))
    unit_cost: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    month: date = Field(index=True)
    notes: Optional[str] = Field(default=None, max_length=500)


# ══════════════════════════════════════════
# MÓDULO 8: PERSONAL SHOPPER
# ══════════════════════════════════════════

class ShopperOrderStatus(str, Enum):
    PENDIENTE   = "pendiente"
    COTIZADO    = "cotizado"
    APROBADO    = "aprobado"
    EN_PROCESO  = "en_proceso"
    ENTREGADO   = "entregado"
    CANCELADO   = "cancelado"


class ShopperOrder(AuditBase, table=True):
    """
    Pedido de personal shopper.
    Los campos calc_* se populan cuando el pedido viene de la calculadora.
    """
    __tablename__ = "shopper_orders"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # Datos del cliente y producto
    client_name: str = Field(max_length=150)
    client_phone: Optional[str] = Field(default=None, max_length=30)
    product_description: str = Field(max_length=500)
    quantity: float = Field(default=1.0)
    unit: str = Field(default="unidades", max_length=40)
    delivery_date: Optional[date] = Field(default=None)

    # Estado y precio cotizado (en GTQ)
    status: str = Field(
        default=ShopperOrderStatus.PENDIENTE,
        sa_column=Column(
            SAEnum(ShopperOrderStatus, name="shopperorderstatus",
                   values_callable=lambda x: [e.value for e in x]),
            nullable=False,
        ),
    )
    quoted_price: Optional[Decimal] = Field(
        default=None,
        sa_column=Column(Numeric(12, 2), nullable=True),
    )
    notes: Optional[str] = Field(default=None, max_length=1000)

    # Token público para link de tracking (sin auth)
    tracking_token: uuid.UUID = Field(default_factory=uuid.uuid4, index=True)

    # Tracking logístico del pedido
    tracking_status: Optional[str] = Field(default=None, max_length=40)
    tracking_note: Optional[str] = Field(default=None, max_length=300)
    tracking_updated_at: Optional[datetime] = Field(default=None)

    # Snapshot de la calculadora (opcionales; null si se creó manualmente)
    calc_product_price_usd: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_tax_usd:           Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_shipping_usd:      Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_total_cost_usd:    Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_total_cost_gtq:    Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_profit_gtq:        Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    calc_margin_pct:        Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(6, 2),  nullable=True))
    calc_exchange_rate:     Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 4),  nullable=True))
    calc_tax_rate:          Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(6, 2),  nullable=True))
    calc_weight_lbs:        Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 3),  nullable=True))
    calc_cost_per_lb:       Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 4),  nullable=True))


class ShopperTrip(AuditBase, table=True):
    """Sesión de compras en una tienda (viaje)."""
    __tablename__ = "shopper_trips"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    store_name: str = Field(max_length=150)
    notes: Optional[str] = Field(default=None, max_length=500)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    ended_at: Optional[datetime] = Field(default=None)


class ShopperTripItem(AuditBase, table=True):
    """Producto capturado durante un viaje de compras."""
    __tablename__ = "shopper_trip_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    trip_id: uuid.UUID = Field(foreign_key="shopper_trips.id", index=True)
    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    stock: int = Field(default=1)
    notes: Optional[str] = Field(default=None, max_length=500)


class ShopperCatalogSettings(AuditBase, table=True):
    """Token público del catálogo personal shopper por tenant."""
    __tablename__ = "shopper_catalog_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", unique=True, index=True)
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    business_name: Optional[str] = Field(default=None, max_length=150)
    whatsapp_number: Optional[str] = Field(default=None, max_length=30)

    # Rango de entrega mostrado en el catálogo público (banner "entrega estimada").
    delivery_days_min: int = Field(default=5)
    delivery_days_max: int = Field(default=7)

    # Viaje del shopper: la fecha de regreso del vuelo es el deadline REAL del lote.
    # Alimenta el banner-misión "La Maleta" con countdown. Null = sin viaje activo.
    trip_name: Optional[str] = Field(default=None, max_length=100)
    trip_close_at: Optional[datetime] = Field(default=None)

    # Terminología configurable (no quemar "viaje"/"desde USA" — a veces el shopper
    # trae de otra ciudad). trip_label reemplaza "viaje"; origin_label = línea de
    # origen ("desde USA 🇺🇸"). Null = default; "" = ocultar.
    trip_label: Optional[str] = Field(default=None, max_length=30)
    origin_label: Optional[str] = Field(default=None, max_length=60)

    # Datos de pago mostrados al cliente en el catálogo y el resumen del pedido.
    bank_name: Optional[str] = Field(default=None, max_length=80)
    bank_account_holder: Optional[str] = Field(default=None, max_length=150)
    bank_account_number: Optional[str] = Field(default=None, max_length=60)
    bank_account_type: Optional[str] = Field(default=None, max_length=20)   # monetaria | ahorro

    # Fase 2 IA (generación de copy al publicar) — apagada por defecto.
    ai_copy_enabled: bool = Field(default=False)

    # Venta en vivo: sesión temporizada tipo subasta-flash. El dueño
    # "abre tienda", publica rápido, y al cerrar (a mano o por reloj) se congela:
    # no entran más reservas y las hechas quedan firmes. store_session_id se
    # regenera en cada apertura para que una venta cerrada no reviva al reabrir.
    store_status: str = Field(default="closed", max_length=10)   # closed | live
    store_name: Optional[str] = Field(default=None, max_length=100)
    store_opened_at: Optional[datetime] = Field(default=None)
    store_closes_at: Optional[datetime] = Field(default=None)   # target del countdown; null = a mano
    store_session_id: Optional[uuid.UUID] = Field(default=None)

    # Foto de fondo del banner de la venta en vivo (la tienda donde está comprando:
    # Target, Ross…). Text, no String: es un data URI redimensionado, igual que
    # ShopperCatalogItem.image_url. Es lo único de la venta que ve el cliente antes
    # de mirar precios, así que vive en settings (actual) y se copia a la sesión.
    store_banner_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))


class ShopperStoreSession(AuditBase, table=True):
    """Histórico de cada venta en vivo. `settings.store_*` se sobrescribe en cada
    apertura, así que sin esta tabla una venta cerrada no deja rastro consultable.

    Guarda la IDENTIDAD y la VENTANA de la venta, no sus métricas: las cifras se
    derivan de las reservas creadas entre `opened_at` y `closed_at`, de modo que el
    histórico sigue diciendo la verdad cuando un pedido se entrega o se cancela
    después del cierre. Un snapshot congelado mentiría a partir del día siguiente.
    """
    __tablename__ = "shopper_store_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    # Espeja settings.store_session_id: liga los ítems publicados en esta venta.
    store_session_id: uuid.UUID = Field(index=True)

    store_name: Optional[str] = Field(default=None, max_length=100)
    # Copia de store_banner_url al abrir: la venta de la semana pasada tiene que
    # seguir mostrando SU foto aunque hoy el dueño suba otra.
    banner_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    opened_at: datetime = Field()
    closed_at: Optional[datetime] = Field(default=None)   # null = venta en curso
    closes_at: Optional[datetime] = Field(default=None)   # target del reloj; null = a mano


class ShopperCatalogItem(AuditBase, table=True):
    """Producto publicado en el catálogo público del personal shopper."""
    __tablename__ = "shopper_catalog_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    source: str = Field(default="manual", max_length=20)   # manual | trip | amazon | foto
    trip_item_id: Optional[uuid.UUID] = Field(default=None, foreign_key="shopper_trip_items.id")

    # Canal de publicación: 'live' (tienda en vivo, atado a store_session_id de la
    # sesión abierta) o 'catalog' (Amazon/evergreen, disponible hasta expires_at).
    # Default 'catalog' → no cambia el comportamiento de los ítems ya publicados.
    listing: str = Field(default="catalog", max_length=10)   # live | catalog
    store_session_id: Optional[uuid.UUID] = Field(default=None)
    expires_at: Optional[datetime] = Field(default=None)   # deadline del ítem de catálogo; null = sin vencer

    title: str = Field(max_length=200)
    # Gancho de venta de una línea mostrado en la tarjeta del grid público.
    hook: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    # Categoría libre que fija el dueño al publicar — alimenta facetas y similares.
    category: Optional[str] = Field(default=None, max_length=40, index=True)
    price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    # Oferta por tiempo limitado: price_gtq = precio oferta; compare_at = precio tachado.
    is_offer: bool = Field(default=False)
    compare_at_price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    offer_ends_at: Optional[datetime] = Field(default=None)

    # Venta por encargo (default del shopper): sin inventario, se compra al apartar.
    # Solo cuando el shopper ya trae unidades en la mano (False) el stock significa
    # algo y el catálogo público muestra escasez real.
    is_made_to_order: bool = Field(default=True)
    stock_total: int = Field(default=1)
    stock_reserved: int = Field(default=0)
    stock_sold: int = Field(default=0)

    is_published: bool = Field(default=False)
    published_at: Optional[datetime] = Field(default=None)
    # Última vez que alguien apartó — prueba social real y verificable.
    last_reserved_at: Optional[datetime] = Field(default=None)

    amazon_url: Optional[str] = Field(default=None, max_length=500)
    amazon_asin: Optional[str] = Field(default=None, max_length=20)
    # Text (no String(1000)): admite data URIs de fotos tomadas con la cámara.
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    notes: Optional[str] = Field(default=None, max_length=500)

    # Precio real pagado en USA (base del cálculo maleta/caja). Amazon lo trae.
    price_usd: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    # Snapshot de la calculadora congelado al publicar (auditable/reproducible).
    calc_mode:           Optional[str]     = Field(default=None, max_length=10)   # maleta | caja
    calc_weight_lbs:     Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 3),   nullable=True))
    calc_volume_in3:     Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2),  nullable=True))
    calc_cost_per_lb:    Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 4),   nullable=True))
    calc_cost_per_in3:   Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 6),  nullable=True))
    calc_tax_rate:       Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(6, 2),   nullable=True))
    calc_exchange_rate:  Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 4),   nullable=True))
    calc_shipping_usd:   Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2),  nullable=True))
    calc_tax_usd:        Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2),  nullable=True))
    calc_total_cost_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2),  nullable=True))


class ShopperReservation(AuditBase, table=True):
    """Reserva de un ítem del catálogo hecha por un cliente."""
    __tablename__ = "shopper_reservations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    catalog_item_id: uuid.UUID = Field(foreign_key="shopper_catalog_items.id", index=True)

    client_name: str = Field(max_length=150)
    client_phone: str = Field(max_length=30)
    client_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    # Agrupa las reservas del mismo cliente (teléfono) en un pedido acumulado
    # consultable sin login en /mi-maleta/<order_token>.
    order_token: Optional[uuid.UUID] = Field(default=None, index=True)
    # PIN de 4 dígitos por pedido: el cliente lo usa junto con su WhatsApp para
    # recuperar su pedido sin el link. Se comparte por order_token.
    order_pin: Optional[str] = Field(default=None, max_length=4, index=True)

    quantity: int = Field(default=1)
    # Flujo: pendiente→confirmada→comprada→en_camino→entregada + no_disponible|cancelada.
    status: str = Field(default="pendiente", max_length=20)
    deposit_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    payment_reference: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)

    expires_at: datetime = Field()           # created_at + 2h — set in router
    confirmed_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)   # = entrega (estado "entregada")

    # Timestamps por estado (confirmed_at/completed_at ya cubren confirmada/entregada).
    comprada_at: Optional[datetime] = Field(default=None)
    en_camino_at: Optional[datetime] = Field(default=None)
    no_disponible_at: Optional[datetime] = Field(default=None)
    cancelada_at: Optional[datetime] = Field(default=None)

    # Desenlace fuera del flujo feliz: motivo + mensaje cálido para el cliente.
    resolution: Optional[str] = Field(default=None, max_length=24)
    resolution_note: Optional[str] = Field(default=None, max_length=300)
    # Reemplazo que el dueño fija al marcar no_disponible (null → similares heurísticos).
    suggested_item_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="shopper_catalog_items.id", index=True
    )
    # En la reserva SUSTITUTA: apunta a la línea no_disponible que reemplazó.
    replaces_reservation_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="shopper_reservations.id", index=True
    )
    # Cuándo se avisó al cliente por WhatsApp del no_disponible.
    client_notified_at: Optional[datetime] = Field(default=None)


class ShopperCalcSettings(AuditBase, table=True):
    """
    Config PRIVADA de la calculadora del shopper por tenant. NUNCA se expone en
    endpoints públicos (revelaría costos/capacidad). Persiste lo que antes vivía
    hardcodeado en ShopperCalculator.tsx.
    """
    __tablename__ = "shopper_calc_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", unique=True, index=True)

    # Modo de flete activo del viaje: 'maleta' (por peso) | 'caja' (por volumen).
    freight_mode: str = Field(default="maleta", max_length=10)
    exchange_rate: Decimal = Field(default=Decimal("7.75"), sa_column=Column(Numeric(8, 4), nullable=False, server_default="7.75"))
    tax_rate: Decimal = Field(default=Decimal("7.00"), sa_column=Column(Numeric(6, 2), nullable=False, server_default="7.00"))
    default_markup_pct: Decimal = Field(default=Decimal("30.00"), sa_column=Column(Numeric(6, 2), nullable=False, server_default="30.00"))

    # Modo maleta: costo por libra = suitcase_cost_usd / suitcase_capacity_lbs.
    suitcase_cost_usd: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    suitcase_capacity_lbs: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(8, 2), nullable=True))

    # Modo caja: costo por unidad de volumen = box_cost_usd / (L*W*H).
    box_cost_usd: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    box_length_in: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(7, 2), nullable=True))
    box_width_in:  Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(7, 2), nullable=True))
    box_height_in: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(7, 2), nullable=True))
    dim_unit: str = Field(default="in", max_length=4)   # in | cm

    # Costo asumido (fracción del precio) para ítems SIN calc_total_cost_gtq, usado
    # solo por el piso de margen de los cupones. Privado — nunca se expone al público.
    assumed_cost_ratio: Decimal = Field(
        default=Decimal("0.700"),
        sa_column=Column(Numeric(4, 3), nullable=False, server_default="0.700"),
    )


class ShopperCoupon(AuditBase, table=True):
    """
    Cupón de descuento por tenant, canjeable en el flujo público del pedido.
    Código único POR tenant. El descuento se recorta para nunca dejar el pedido bajo
    el costo (`min_margin_pct`). `redeemed_count` es cache de canjes `held`; la verdad
    del cap la garantiza el UPDATE atómico del router.
    """
    __tablename__ = "shopper_coupons"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_shopper_coupons_tenant_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    code: str = Field(max_length=24)                       # UPPERCASE canónico
    discount_type: str = Field(default="percent", max_length=10)   # percent | fixed
    percent_off: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    amount_off_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    max_discount_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    min_subtotal_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    # Piso de margen: nunca dejar el total bajo costo*(1+min_margin_pct/100). 0 = nunca bajo costo.
    min_margin_pct: Decimal = Field(
        default=Decimal("0"),
        sa_column=Column(Numeric(6, 2), nullable=False, server_default="0"),
    )

    max_redemptions: Optional[int] = Field(default=None)   # null = ilimitado
    per_customer_limit: int = Field(default=1)             # por client_phone normalizado
    redeemed_count: int = Field(default=0)                 # cache de canjes held

    starts_at: Optional[datetime] = Field(default=None)
    expires_at: Optional[datetime] = Field(default=None)
    label: Optional[str] = Field(default=None, max_length=60)   # nota interna del dueño


class ShopperCouponRedemption(AuditBase, table=True):
    """
    Canje de un cupón atado a un pedido (`order_token`). La fila `held` = "este pedido
    tiene el cupón X"; el monto del descuento NO se congela (se recomputa en vivo en
    `_build_order`), estos snapshots son auditoría. Un solo `held` por `order_token`.
    """
    __tablename__ = "shopper_coupon_redemptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    coupon_id: uuid.UUID = Field(foreign_key="shopper_coupons.id", index=True)

    order_token: uuid.UUID = Field(index=True)
    client_phone: str = Field(max_length=30)
    client_phone_digits: str = Field(max_length=20, index=True)   # normalizado para límite por cliente

    status: str = Field(default="held", max_length=10)            # held | released
    discount_gtq: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False, server_default="0"))
    subtotal_gtq: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False, server_default="0"))
    released_at: Optional[datetime] = Field(default=None)


# ── Máquina de estados de reservas del shopper (espeja import_catalog) ──────────
# Mismos valores de status que importaciones para reusar la lógica; el frontend
# los relabela a la metáfora del viajero ("comprada en tienda", "en mi maleta").
SHOPPER_STATUS_FLOW: list[str] = ["pendiente", "confirmada", "comprada", "en_camino", "entregada"]
SHOPPER_OFF_RAMP: list[str] = ["no_disponible", "cancelada"]
SHOPPER_VALID_TRANSITIONS: dict[str, list[str]] = {
    "pendiente":     ["confirmada", "no_disponible", "cancelada"],
    "confirmada":    ["comprada", "pendiente", "no_disponible", "cancelada"],
    "comprada":      ["en_camino", "confirmada", "no_disponible", "cancelada"],
    "en_camino":     ["entregada", "comprada", "cancelada"],
    "entregada":     ["en_camino"],
    "no_disponible": ["confirmada", "cancelada"],
    "cancelada":     ["pendiente"],
}
SHOPPER_STATUS_TS_FIELD: dict[str, str] = {
    "confirmada":    "confirmed_at",
    "comprada":      "comprada_at",
    "en_camino":     "en_camino_at",
    "entregada":     "completed_at",
    "no_disponible": "no_disponible_at",
    "cancelada":     "cancelada_at",
}
SHOPPER_RESOLUTION_REASONS: list[str] = [
    "agotado", "no_encontrado", "cliente_quito", "expiro", "vendedor_cancelo",
]


class AmazonScrapeCache(SQLModel, table=True):
    """Cache GLOBAL (sin tenant) de scrapes de Amazon por ASIN. Los datos del producto
    son públicos → NO lleva tenant_id ni RLS. Un scrape exitoso de cualquier tenant sirve
    a todos y esquiva el 503 anti-bot (Amazon bloquea la IP del datacenter de forma
    intermitente). `updated_at` = último scrape exitoso = ancla del TTL. `hit_count` =
    veces que la cache evitó un scrape (observabilidad)."""
    __tablename__ = "amazon_scrape_cache"
    asin:        str = Field(primary_key=True, max_length=10)
    name:        Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    price_usd:   Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    image_url:   Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    product_url: str = Field(sa_column=Column(Text, nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    source:      str = Field(default="direct", max_length=10)   # relay | direct
    hit_count:   int = Field(default=0)
    created_at:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

