import uuid
from datetime import datetime, timezone, date
from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


VALID_TRANSITIONS: dict[str, list[str]] = {
    "pendiente":   ["comprado", "cancelado"],
    "comprado":    ["en_transito", "cancelado"],
    "en_transito": ["entregado", "cancelado"],
    "entregado":   ["pagado"],
}

STATUS_TS_FIELD: dict[str, str] = {
    "comprado":    "comprado_at",
    "en_transito": "en_transito_at",
    "entregado":   "entregado_at",
    "pagado":      "pagado_at",
}


class ImportCotizacion(SQLModel, table=True):
    __tablename__ = "import_cotizaciones"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    product_name: str = Field(max_length=500, default="Producto")
    amazon_asin: Optional[str] = Field(default=None, max_length=20)

    inputs_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))
    config_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))
    result_snapshot: dict = Field(sa_column=Column(JSON, nullable=False))

    share_token: uuid.UUID = Field(default_factory=uuid.uuid4, index=True)

    status: str = Field(default="pendiente", max_length=20)
    expires_at: datetime

    tracking_number: Optional[str] = Field(default=None, max_length=100)
    estimated_delivery: Optional[date] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=1000)

    comprado_at: Optional[datetime] = Field(default=None)
    en_transito_at: Optional[datetime] = Field(default=None)
    entregado_at: Optional[datetime] = Field(default=None)
    pagado_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    is_active: bool = Field(default=True)
