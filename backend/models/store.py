# Tablas: MÓDULO VENTAS (catálogo público con flujo de stock)
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import Column, Numeric, Text
from sqlmodel import Field, Relationship
from .mixins import AuditBase


class StoreSettings(AuditBase, table=True):
    __tablename__ = "store_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", unique=True, index=True)

    # Token público del catálogo — el link /tienda/{token} que comparte la empresa
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    is_open: bool = Field(default=True)
    reservation_ttl_minutes: int = Field(default=30)


class StoreProduct(AuditBase, table=True):
    __tablename__ = "store_products"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    price: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))
    cost: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    # Gancho de venta (pricing psicológico):
    # compare_at_price = "antes" tachado mostrado junto al precio actual.
    # badge = etiqueta llamativa ("¡MÁS VENDIDO!", "OFERTA", "ÚLTIMAS UNIDADES"...).
    compare_at_price: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    badge: Optional[str] = Field(default=None, max_length=40)

    # Disponible = stock_qty - reserved_qty
    stock_qty: int = Field(default=0)
    reserved_qty: int = Field(default=0)
    is_published: bool = Field(default=True)


class StoreOrder(AuditBase, table=True):
    __tablename__ = "store_orders"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # Token público del seguimiento — el link /pedido/{token} del cliente
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    short_code: str = Field(max_length=8, index=True)

    customer_name: Optional[str] = Field(default=None, max_length=150)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    channel: str = Field(default="catalogo", max_length=20)     # catalogo | mostrador
    # solicitado | apartado | entregado | rechazado | expirado | cancelado
    status: str = Field(default="solicitado", max_length=20, index=True)

    # Solo aplica en 'solicitado': vencido el plazo la reserva se libera sola
    expires_at: Optional[datetime] = Field(default=None)
    delivered_at: Optional[datetime] = Field(default=None)

    # Pago ortogonal al estado: puede llegar antes o después de entregar
    paid_at: Optional[datetime] = Field(default=None)
    payment_method: Optional[str] = Field(default=None, max_length=30)    # simulado | efectivo
    payment_provider: Optional[str] = Field(default=None, max_length=50)
    payment_ref: Optional[str] = Field(default=None, max_length=255)

    total: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))

    items: List["StoreOrderItem"] = Relationship(back_populates="order")


class StoreOrderItem(AuditBase, table=True):
    __tablename__ = "store_order_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    order_id: uuid.UUID = Field(foreign_key="store_orders.id", index=True)
    product_id: uuid.UUID = Field(foreign_key="store_products.id", index=True)

    # Snapshot de nombre, precio y costo — el catálogo puede cambiar después
    product_name: str = Field(max_length=150)
    qty: int = Field(default=1)
    unit_price: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))
    unit_cost: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))

    order: StoreOrder = Relationship(back_populates="items")


class StoreStockMove(AuditBase, table=True):
    __tablename__ = "store_stock_moves"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    product_id: uuid.UUID = Field(foreign_key="store_products.id", index=True)

    qty: int = Field(default=0)                                  # negativo = salida de stock
    move_type: str = Field(default="merma", max_length=20)       # merma | ajuste
    reason: Optional[str] = Field(default=None, max_length=30)   # se_arruino | perdida | correccion
    note: Optional[str] = Field(default=None, max_length=300)


class StorePromotion(AuditBase, table=True):
    """
    Promoción / gancho de venta por rango de fechas. Puede aplicar a un producto
    (product_id) o a toda la tienda (product_id = None, banner de catálogo).
    """
    __tablename__ = "store_promotions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # null = aplica al catálogo entero (banner). Si apunta a un producto, es su gancho.
    product_id: Optional[uuid.UUID] = Field(default=None, foreign_key="store_products.id", index=True)

    title: str = Field(max_length=80)
    # percent | two_for_one | compare_at | bundle | badge
    promo_type: str = Field(default="percent", max_length=20)
    # % de descuento (percent), precio de combo (bundle), etc. Opcional según tipo.
    value: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    description: Optional[str] = Field(default=None, max_length=200)
    urgency_text: Optional[str] = Field(default=None, max_length=80)

    # Vigencia: null en ambos = sin límite de fechas. Solo aplica si hoy ∈ [starts_on, ends_on].
    starts_on: Optional[date] = Field(default=None)
    ends_on: Optional[date] = Field(default=None)
    is_published: bool = Field(default=True)
