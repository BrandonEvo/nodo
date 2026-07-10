"""
Catálogo público del módulo IMPORTACIONES.
Adaptado del catálogo de Personal Shopper (models/bakery.py: ShopperCatalog*),
pero nativo de importaciones: cada módulo es dueño de sus propias tablas.

- import_catalog_settings : token público + datos del negocio por tenant
- import_catalog_items     : productos publicados (manual | cotizacion | amazon)
- import_reservations      : reservas de clientes (bandeja aparte del flujo de pedidos)
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, Numeric
from sqlmodel import Field

from .mixins import AuditBase


# Flujo "feliz" de una reserva del catálogo hasta la entrega. Sirve para detectar
# avance vs. retroceso y limpiar timestamps al retroceder — mismo patrón que
# models/importaciones.py usa para las cotizaciones.
STATUS_FLOW: list[str] = ["pendiente", "confirmada", "comprada", "en_camino", "entregada"]

# Salidas del flujo feliz. `no_disponible` es el desenlace CÁLIDO (no se pudo
# conseguir → se ofrece reemplazo similar); `cancelada` es el frío (el cliente lo
# quitó, venció el apartado, o el vendedor canceló por otro motivo).
OFF_RAMP: list[str] = ["no_disponible", "cancelada"]

# Transiciones permitidas: avanzar, retroceder al anterior y salir del flujo.
# Terminales reabribles: entregada→en_camino (deshacer), no_disponible→confirmada
# (lo consiguió), cancelada→pendiente (reactivar, igual que cotizacion cancelado→cotizado).
VALID_TRANSITIONS: dict[str, list[str]] = {
    "pendiente":     ["confirmada", "no_disponible", "cancelada"],
    "confirmada":    ["comprada", "pendiente", "no_disponible", "cancelada"],
    "comprada":      ["en_camino", "confirmada", "no_disponible", "cancelada"],
    "en_camino":     ["entregada", "comprada", "cancelada"],
    "entregada":     ["en_camino"],
    "no_disponible": ["confirmada", "cancelada"],
    "cancelada":     ["pendiente"],
}

# Timestamp que se sella al entrar a cada estado. `confirmed_at`/`completed_at`
# son columnas viejas que se reusan (completed_at = momento de la entrega).
STATUS_TS_FIELD: dict[str, str] = {
    "confirmada":    "confirmed_at",
    "comprada":      "comprada_at",
    "en_camino":     "en_camino_at",
    "entregada":     "completed_at",
    "no_disponible": "no_disponible_at",
    "cancelada":     "cancelada_at",
}

# Motivos por los que una reserva sale del flujo feliz (columna `resolution`).
RESOLUTION_REASONS: list[str] = [
    "agotado",           # no_disponible: se acabó el stock
    "no_encontrado",     # no_disponible: no se consiguió en el viaje
    "cliente_quito",     # el cliente quitó una línea pendiente
    "expiro",            # venció el apartado de 2h sin confirmar
    "vendedor_cancelo",  # el vendedor canceló por otro motivo
]


class ImportCatalogSettings(AuditBase, table=True):
    """Token público del catálogo de importaciones por tenant."""
    __tablename__ = "import_catalog_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", unique=True, index=True)
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    business_name: Optional[str] = Field(default=None, max_length=150)
    whatsapp_number: Optional[str] = Field(default=None, max_length=30)
    # Rango de entrega mostrado en el catálogo público (banner "entrega estimada").
    delivery_days_min: int = Field(default=5)
    delivery_days_max: int = Field(default=7)
    # Próximo viaje de importación: deadline REAL del lote. Alimenta el banner
    # hero con countdown del catálogo público. Null = sin viaje programado.
    trip_name: Optional[str] = Field(default=None, max_length=100)
    trip_close_at: Optional[datetime] = Field(default=None)

    # Terminología configurable del catálogo público (para negocios que NO
    # importan por avión desde USA — p. ej. pedidos locales desde Guatemala).
    # trip_label: sustituye la palabra "viaje" en banner y mensajes (default "viaje").
    # origin_label: línea de origen ("desde USA 🇺🇸"). Null = default; ""  = ocultar.
    trip_label: Optional[str] = Field(default=None, max_length=30)
    origin_label: Optional[str] = Field(default=None, max_length=60)

    # Datos de pago mostrados al cliente en el catálogo y el resumen del pedido.
    bank_name: Optional[str] = Field(default=None, max_length=80)
    bank_account_holder: Optional[str] = Field(default=None, max_length=150)
    bank_account_number: Optional[str] = Field(default=None, max_length=60)
    bank_account_type: Optional[str] = Field(default=None, max_length=20)   # monetaria | ahorro

    # Fase 2 IA (generación de copy al publicar) — apagada por defecto, se prende por tenant.
    ai_copy_enabled: bool = Field(default=False)


class ImportCatalogItem(AuditBase, table=True):
    """Producto publicado en el catálogo público de importaciones."""
    __tablename__ = "import_catalog_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    source: str = Field(default="manual", max_length=20)   # manual | cotizacion | amazon
    cotizacion_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="import_cotizaciones.id", index=True
    )

    title: str = Field(max_length=200)
    # Gancho de venta de una línea mostrado en la tarjeta del grid público
    # ("Adiós cara de desvelada"). La descripción completa vive en el detalle.
    hook: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    # Categoría del ítem para filtros del catálogo y similitud de reemplazo.
    # La fija el dueño al publicar (ej. cocina, belleza, tech). Libre, sin taxonomía rígida.
    category: Optional[str] = Field(default=None, max_length=40, index=True)
    price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    # Oferta por tiempo limitado: price_gtq es el precio de oferta; compare_at_price_gtq
    # es el precio "normal" tachado. offer_ends_at alimenta el countdown de la tarjeta.
    is_offer: bool = Field(default=False)
    compare_at_price_gtq: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    offer_ends_at: Optional[datetime] = Field(default=None)

    # Venta por encargo: no hay inventario, el producto se compra cuando el cliente
    # aparta. Es el caso normal del dropshipping y el default. Sólo cuando el
    # negocio marca que tiene unidades en la mano (`False`) el `stock_total` de
    # abajo significa algo y el catálogo público muestra escasez real.
    is_made_to_order: bool = Field(default=True)
    stock_total: int = Field(default=1)
    stock_reserved: int = Field(default=0)
    stock_sold: int = Field(default=0)

    is_published: bool = Field(default=False)
    published_at: Optional[datetime] = Field(default=None)
    # Última vez que alguien apartó este ítem — prueba social real y verificable.
    last_reserved_at: Optional[datetime] = Field(default=None)

    amazon_url: Optional[str] = Field(default=None, max_length=500)
    amazon_asin: Optional[str] = Field(default=None, max_length=20)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    notes: Optional[str] = Field(default=None, max_length=500)


class ImportReservation(AuditBase, table=True):
    """Reserva de un ítem del catálogo hecha por un cliente (sin login)."""
    __tablename__ = "import_reservations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    catalog_item_id: uuid.UUID = Field(foreign_key="import_catalog_items.id", index=True)
    # Costura de unificación: liga la reserva a la ficha del cliente (import_clientes),
    # creada/actualizada por upsert de teléfono al apartar. Así la pestaña Clientes
    # refleja a todos los que apartan del catálogo, no solo a los cargados a mano.
    cliente_id: Optional[uuid.UUID] = Field(default=None, foreign_key="import_clientes.id", index=True)

    client_name: str = Field(max_length=150)
    client_phone: str = Field(max_length=30)
    client_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    # Agrupa las reservas del mismo cliente (teléfono) en un pedido acumulado
    # consultable sin login en /mi-pedido/<order_token>.
    order_token: Optional[uuid.UUID] = Field(default=None, index=True)
    # PIN de 4 dígitos por pedido: el cliente lo usa junto con su WhatsApp para
    # recuperar su pedido sin el link (lookup público). Se comparte por order_token.
    order_pin: Optional[str] = Field(default=None, max_length=4, index=True)

    quantity: int = Field(default=1)
    status: str = Field(default="pendiente", max_length=20)   # pendiente|confirmada|completada|cancelada
    deposit_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    payment_reference: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)

    expires_at: datetime = Field()           # created_at + 2h — set in router
    confirmed_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)   # = entrega (estado "entregada")

    # Timestamps por estado del flujo nuevo (confirmed_at/completed_at ya cubren
    # confirmada/entregada). Se sellan al entrar y se limpian al retroceder.
    comprada_at: Optional[datetime] = Field(default=None)
    en_camino_at: Optional[datetime] = Field(default=None)
    no_disponible_at: Optional[datetime] = Field(default=None)
    cancelada_at: Optional[datetime] = Field(default=None)

    # Desenlace fuera del flujo feliz: motivo (ver RESOLUTION_REASONS) + mensaje
    # cálido que el dueño escribe para el cliente cuando algo sale como no_disponible.
    resolution: Optional[str] = Field(default=None, max_length=24)
    resolution_note: Optional[str] = Field(default=None, max_length=300)
    # Reemplazo que el dueño fija al marcar no_disponible. Si es null, el cliente
    # ve alternativas auto-rankeadas por heurística (banda de precio + título).
    suggested_item_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="import_catalog_items.id", index=True
    )
    # En la reserva SUSTITUTA: apunta a la línea no_disponible que reemplazó.
    # El lookup inverso dice si un no_disponible ya fue "resuelto con reemplazo".
    replaces_reservation_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="import_reservations.id", index=True
    )
    # Cuándo se avisó al cliente por WhatsApp del no_disponible (avisado / sin avisar).
    client_notified_at: Optional[datetime] = Field(default=None)
