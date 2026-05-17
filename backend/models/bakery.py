import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import Field, Relationship
from .mixins import AuditBase


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
    category: Optional[str] = Field(default=None, max_length=60)

    recipe_ingredients: List["RecipeIngredient"] = Relationship(back_populates="item")


# ══════════════════════════════════════════
# MÓDULO 2: RECETAS (Base de Producción)
# ══════════════════════════════════════════

class Recipe(AuditBase, table=True):
    __tablename__ = "recipes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=100)
    base_unit: str = Field(max_length=30, default="unidades")
    estimated_yield: int = Field(default=1)
    estimated_cost: float = Field(default=0.0)
    sell_price: float = Field(default=0.0)

    ingredients: List["RecipeIngredient"] = Relationship(back_populates="recipe")
    production_orders: List["ProductionOrder"] = Relationship(back_populates="recipe")
    sale_items: List["SaleItem"] = Relationship(back_populates="recipe")


class RecipeIngredient(AuditBase, table=True):
    __tablename__ = "recipe_ingredients"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    recipe_id: uuid.UUID = Field(foreign_key="recipes.id", index=True)
    inventory_item_id: uuid.UUID = Field(foreign_key="inventory_items.id", index=True)
    quantity: float = Field(default=1.0)

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
    status: str = Field(default="pending", max_length=20)  # pending | en_proceso | completed
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)

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
