import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import Column, JSON, Numeric
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


VALID_TRANSITIONS: dict[str, list[str]] = {
    "cotizado":    ["confirmado", "cancelado"],
    "confirmado":  ["comprado", "cancelado"],
    "comprado":    ["en_transito", "cancelado"],
    "en_transito": ["entregado", "cancelado"],
    "entregado":   ["pagado"],
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

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)


class ImportCotizacion(SQLModel, table=True):
    __tablename__ = "import_cotizaciones"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    cliente_id: Optional[uuid.UUID] = Field(default=None, foreign_key="import_clientes.id", index=True)

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
