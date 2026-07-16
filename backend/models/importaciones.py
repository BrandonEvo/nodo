import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import Column, JSON, Numeric
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Orden del flujo "feliz" del pedido. Sirve para detectar avance vs. retroceso
# y para limpiar timestamps de estados futuros al retroceder.
STATUS_FLOW: list[str] = [
    "cotizado", "confirmado", "comprado", "en_transito", "entregado", "pagado",
]

# Transiciones permitidas. Cada estado puede avanzar al siguiente, retroceder al
# anterior y (salvo cierre) cancelarse. 'cancelado' puede reactivarse a 'cotizado'.
VALID_TRANSITIONS: dict[str, list[str]] = {
    "cotizado":    ["confirmado", "cancelado"],
    "confirmado":  ["comprado", "cotizado", "cancelado"],
    "comprado":    ["en_transito", "confirmado", "cancelado"],
    "en_transito": ["entregado", "comprado", "cancelado"],
    "entregado":   ["pagado", "en_transito"],
    "pagado":      ["entregado"],
    "cancelado":   ["cotizado"],
}

STATUS_TS_FIELD: dict[str, str] = {
    "confirmado":  "confirmado_at",
    "comprado":    "comprado_at",
    "en_transito": "en_transito_at",
    "entregado":   "entregado_at",
    "pagado":      "pagado_at",
}


class ImportCliente(SQLModel, table=True):
    __tablename__ = "import_clientes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    name: str = Field(max_length=150)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)

    # Origen de la ficha: manual (cargado por el dueño) | catalogo (apartó del link) |
    # qr (entró por un código de campaña). attribution guarda el ?src= del enlace.
    source: str = Field(default="manual", max_length=20)
    attribution: Optional[str] = Field(default=None, max_length=120)
    # Verificación del teléfono. MVP: formato 502 válido. La verificación "real"
    # ocurre cuando el cliente escribe por WhatsApp desde su propio número.
    phone_verified: bool = Field(default=False)
    phone_verified_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)


class ImportPaquete(SQLModel, table=True):
    """
    Paquete: agrupa varias cotizaciones de un cliente en un solo envío con
    tracking unificado. Estado/tracking/entrega se manejan a nivel paquete y
    se cascadean a las cotizaciones miembro (ver router).
    """
    __tablename__ = "import_paquetes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    cliente_id: Optional[uuid.UUID] = Field(default=None, foreign_key="import_clientes.id", index=True)

    name: str = Field(max_length=150, default="Paquete")
    status: str = Field(default="cotizado", max_length=20)

    tracking_number: Optional[str] = Field(default=None, max_length=100)
    estimated_delivery: Optional[date] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=1000)

    confirmado_at: Optional[datetime] = Field(default=None)
    comprado_at: Optional[datetime] = Field(default=None)
    en_transito_at: Optional[datetime] = Field(default=None)
    entregado_at: Optional[datetime] = Field(default=None)
    pagado_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)


class ImportCotizacion(SQLModel, table=True):
    __tablename__ = "import_cotizaciones"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    cliente_id: Optional[uuid.UUID] = Field(default=None, foreign_key="import_clientes.id", index=True)
    paquete_id: Optional[uuid.UUID] = Field(default=None, foreign_key="import_paquetes.id", index=True)

    product_name: str = Field(max_length=500, default="Producto")
    amazon_asin: Optional[str] = Field(default=None, max_length=20)

    inputs_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))
    config_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))
    result_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))

    sale_price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    landed_cost_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    share_token: uuid.UUID = Field(default_factory=uuid.uuid4, index=True)

    status: str = Field(default="cotizado", max_length=20)
    expires_at: datetime

    tracking_number: Optional[str] = Field(default=None, max_length=100)
    estimated_delivery: Optional[date] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=1000)

    confirmado_at: Optional[datetime] = Field(default=None)
    comprado_at: Optional[datetime] = Field(default=None)
    en_transito_at: Optional[datetime] = Field(default=None)
    entregado_at: Optional[datetime] = Field(default=None)
    pagado_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)
