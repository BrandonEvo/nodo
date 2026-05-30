import uuid
from decimal import Decimal
from datetime import datetime, timezone, date
from enum import Enum
from typing import Optional, List
from sqlalchemy import Column, Numeric, UniqueConstraint, Enum as SAEnum, String
from sqlmodel import Field, Relationship
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
