"""
MÓDULO: IMPORT CATALOG — Catálogo público de Importaciones
Adaptado de api/routers/shopper_catalog.py (mismo patrón de stock y reservas),
nativo del módulo importaciones.

Autenticado:
  GET    /api/import-catalog/settings                       → Leer/crear ajustes
  PATCH  /api/import-catalog/settings                       → Actualizar negocio/whatsapp/entrega
  GET    /api/import-catalog/                               → Listar ítems
  POST   /api/import-catalog/                               → Crear ítem manual / amazon
  POST   /api/import-catalog/from-cotizacion/{cotizacion_id} → Publicar una cotización guardada
  PATCH  /api/import-catalog/{id}                           → Actualizar ítem
  DELETE /api/import-catalog/{id}                           → Soft-delete
  GET    /api/import-catalog/reservations                   → Bandeja de reservas del tenant
  PATCH  /api/import-catalog/reservations/{id}              → Actualizar estado de reserva

Público (sin auth):
  GET    /api/import-catalog/public/{token}                 → Catálogo visible al cliente
  POST   /api/import-catalog/public/{token}/reserve/{iid}   → Crear reserva (acumula pedido)
  GET    /api/import-catalog/public/reservation/{ctok}      → Vista del cliente de su reserva
  GET    /api/import-catalog/public/order/{order_token}     → Pedido acumulado del cliente
"""
import json
import os
import secrets
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import distinct, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from core.limiter import limiter
from api.services.push_service import send_push_to_tenant
from models.import_catalog import (
    ImportCatalogSettings, ImportCatalogItem, ImportReservation,
    STATUS_FLOW, OFF_RAMP, VALID_TRANSITIONS, STATUS_TS_FIELD,
)
from models.importaciones import ImportCotizacion, ImportCliente
from models.tenants import Tenant
from models.schemas import (
    ImportCatalogSettingsRead, ImportCatalogSettingsUpdate,
    ImportCatalogItemCreate, ImportCatalogItemUpdate, ImportCatalogItemRead,
    PublicImportCatalog, PublicImportCatalogItem, PublicPayInfo,
    ImportReservationCreate, ImportReservationUpdate, ImportReservationRead,
    PublicImportReservationRead, PublicImportOrder, PublicImportOrderLine,
    PublicOrderLineUpdate, OrderLookupBody,
)

# Estados "vivos" del pedido para totales y pill del cliente (excluye las salidas).
ACTIVE_STATUSES = ("pendiente", "confirmada", "comprada", "en_camino", "entregada")

# Subconjunto "en vuelo": lo que todavía viaja en el lote actual. Excluye `entregada`
# para que el momentum del catálogo público refleje el viaje en curso y no la suma
# histórica de todo lo que el negocio entregó alguna vez.
IN_FLIGHT_STATUSES = ("pendiente", "confirmada", "comprada", "en_camino")

# Tope de unidades por línea en un ítem por encargo. No hay inventario que agotar,
# pero sin tope un cliente podría apartar 500 unidades de un tirón por accidente.
MADE_TO_ORDER_MAX_QTY = 10

_STOPWORDS = {
    "de", "la", "el", "los", "las", "con", "para", "por", "y", "o", "un", "una",
    "the", "for", "with", "a", "an", "of", "en", "del", "al",
}

router = APIRouter(tags=["Import Catalog"])

RESERVATION_EXPIRY_HOURS = 2
# Ventana para agrupar reservas del mismo teléfono en un pedido acumulado.
ORDER_GROUPING_DAYS = 7


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _physical_available(i: ImportCatalogItem) -> int:
    """Unidades físicas libres. Sólo tiene sentido si el ítem NO es por encargo."""
    return max(0, i.stock_total - i.stock_reserved - i.stock_sold)


def _max_qty(i: ImportCatalogItem, current: int = 0) -> int:
    """Cuántas unidades puede llevarse el cliente de este ítem.

    `current` son las que esta misma línea ya tiene tomadas (al editar el pedido
    hay que devolvérselas al tope, si no el cliente no podría ni mantener su
    cantidad actual).
    """
    if i.is_made_to_order:
        return MADE_TO_ORDER_MAX_QTY
    return _physical_available(i) + current


def _is_available(i: ImportCatalogItem) -> bool:
    """Un ítem por encargo nunca se agota: se compra cuando el cliente aparta."""
    return i.is_made_to_order or _physical_available(i) > 0


def _phone_digits(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _gen_pin() -> str:
    """PIN de 4 dígitos para recuperar el pedido con WhatsApp + PIN."""
    return f"{secrets.randbelow(10000):04d}"


def _gt_phone_verified(phone: str) -> bool:
    """MVP de verificación: formato de teléfono guatemalteco válido.
    Acepta con o sin código 502. Local de 8 dígitos que inicia en 2-7.
    (La verificación real ocurre cuando el cliente escribe por WhatsApp.)
    """
    d = _phone_digits(phone)
    if d.startswith("502") and len(d) == 11:
        d = d[3:]
    return len(d) == 8 and d[0] in "234567"


def _tokens(text: str | None) -> set[str]:
    """Tokeniza un título para medir solape: minúsculas, sin acentos, sin stopwords."""
    if not text:
        return set()
    norm = unicodedata.normalize("NFKD", text.lower())
    norm = "".join(c for c in norm if not unicodedata.combining(c))
    words, cur = set(), []
    for ch in norm:
        if ch.isalnum():
            cur.append(ch)
        elif cur:
            w = "".join(cur); cur = []
            if len(w) > 2 and w not in _STOPWORDS:
                words.add(w)
    if cur:
        w = "".join(cur)
        if len(w) > 2 and w not in _STOPWORDS:
            words.add(w)
    return words


async def _similar_items(
    tenant_id: uuid.UUID, original: ImportCatalogItem, session: AsyncSession,
    limit: int = 4, exclude_ids: set[uuid.UUID] | None = None,
) -> list[ImportCatalogItem]:
    """Reemplazos "parecidos" 100% determinista (sin IA): banda de precio +
    solape de título + misma categoría/fuente + oferta. Sólo ítems publicados,
    activos y con stock. Siempre devuelve algo si hay candidatos."""
    exclude = set(exclude_ids or ())
    exclude.add(original.id)
    result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.tenant_id == tenant_id,
            ImportCatalogItem.is_published == True,
            ImportCatalogItem.is_active == True,
        )
    )
    p = float(original.price_gtq) if original.price_gtq is not None else None
    orig_tokens = _tokens(original.title)
    scored: list[tuple[float, datetime, ImportCatalogItem]] = []
    for c in result.scalars().all():
        if c.id in exclude:
            continue
        if not _is_available(c):
            continue
        score = 0.0
        cp = float(c.price_gtq) if c.price_gtq is not None else None
        if p and cp is not None and p > 0:
            score += 0.6 * max(0.0, 1 - min(1.0, abs(cp - p) / p))
        if orig_tokens:
            overlap = len(_tokens(c.title) & orig_tokens) / max(1, len(orig_tokens))
            score += 0.3 * overlap
        if original.category and c.category and original.category == c.category:
            score += 0.2
        if c.source == original.source:
            score += 0.1
        if c.is_offer:
            score += 0.05
        scored.append((score, c.published_at or c.created_at, c))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [c for _, _, c in scored[:limit]]


def _apply_stock_transition(item: ImportCatalogItem, old: str, new: str, qty: int) -> None:
    """Contabilidad de stock por transición (tabla determinista). Generaliza lo
    que ya hacía update_reservation: entrega mueve reservado→vendido; salir del
    flujo libera reservado; reabrir/reactivar lo vuelve a tomar."""
    committed = {"pendiente", "confirmada", "comprada", "en_camino"}
    if new == "entregada" and old != "entregada":
        item.stock_reserved = max(0, item.stock_reserved - qty)
        item.stock_sold = item.stock_sold + qty
    elif old == "entregada" and new != "entregada":
        item.stock_sold = max(0, item.stock_sold - qty)
        item.stock_reserved = item.stock_reserved + qty
    elif old in committed and new in OFF_RAMP:
        item.stock_reserved = max(0, item.stock_reserved - qty)
    elif old in OFF_RAMP and new in committed:
        item.stock_reserved = item.stock_reserved + qty


def _apply_status_timestamps(res: ImportReservation, old: str, new: str, now: datetime) -> None:
    """Sella el timestamp del estado al entrar (sin pisarlo si ya existe) y limpia
    los de estados que se dejan al retroceder — mismo criterio que importaciones.py."""
    ts_new = STATUS_TS_FIELD.get(new)
    if ts_new and getattr(res, ts_new) is None:
        setattr(res, ts_new, now)
    # Retroceso dentro del flujo feliz: limpiar ts de los estados abandonados.
    if old in STATUS_FLOW and new in STATUS_FLOW and STATUS_FLOW.index(new) < STATUS_FLOW.index(old):
        for s in STATUS_FLOW[STATUS_FLOW.index(new) + 1: STATUS_FLOW.index(old) + 1]:
            f = STATUS_TS_FIELD.get(s)
            if f:
                setattr(res, f, None)
    # Reabrir desde una salida: limpiar su rastro para volver al tracking normal.
    if old == "no_disponible" and new not in OFF_RAMP:
        res.no_disponible_at = None
        res.resolution = None
        res.resolution_note = None
        res.suggested_item_id = None
        res.client_notified_at = None
    if old == "cancelada" and new not in OFF_RAMP:
        res.cancelada_at = None
        res.resolution = None


async def _has_active_substitute(reservation_id: uuid.UUID, session: AsyncSession) -> bool:
    """True si una línea no_disponible ya fue resuelta con una reserva sustituta activa."""
    result = await session.execute(
        select(ImportReservation.id).where(
            ImportReservation.replaces_reservation_id == reservation_id,
            ImportReservation.is_active == True,
            ImportReservation.status != "cancelada",
        )
    )
    return result.first() is not None


async def _upsert_cliente_from_reservation(
    tenant_id: uuid.UUID, name: str, phone: str, source: str,
    attribution: str | None, session: AsyncSession,
) -> uuid.UUID | None:
    """Ficha al cliente que aparta: upsert por (tenant, teléfono) en import_clientes.
    Así la pestaña Clientes refleja a todos los que apartan del catálogo.
    """
    digits = _phone_digits(phone)
    if not digits:
        return None
    result = await session.execute(
        select(ImportCliente).where(
            ImportCliente.tenant_id == tenant_id,
            ImportCliente.is_active == True,
        )
    )
    verified = _gt_phone_verified(phone)
    for cli in result.scalars().all():
        if _phone_digits(cli.phone or "") == digits:
            # Ficha existente: completa datos que falten sin pisar lo cargado a mano.
            if verified and not cli.phone_verified:
                cli.phone_verified = True
                cli.phone_verified_at = _now()
            if not cli.attribution and attribution:
                cli.attribution = attribution
            cli.updated_at = _now()
            session.add(cli)
            return cli.id
    cli = ImportCliente(
        tenant_id=tenant_id,
        name=name.strip() or "Cliente",
        phone=phone.strip(),
        source=source,
        attribution=attribution,
        phone_verified=verified,
        phone_verified_at=_now() if verified else None,
    )
    session.add(cli)
    await session.flush()
    return cli.id


async def _resolve_order_token(
    tenant_id: uuid.UUID,
    client_phone: str,
    session: AsyncSession,
    claimed_token: uuid.UUID | None = None,
) -> tuple[uuid.UUID, str]:
    """Reusa (order_token, order_pin) del pedido que el cliente YA tiene abierto, o
    crea uno nuevo. El PIN se comparte entre todas las reservas del pedido.

    Sólo se reusa si el cliente presenta su `order_token` y el teléfono coincide.
    Agrupar sólo por teléfono entregaba el pedido (y el PIN) de otra persona a
    quien supiera su número. Ver el gemelo en shopper_catalog.py.
    """
    if claimed_token is None:
        return uuid.uuid4(), _gen_pin()

    since = _now() - timedelta(days=ORDER_GROUPING_DAYS)
    result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.order_token == claimed_token,
            ImportReservation.is_active == True,
            ImportReservation.created_at >= since,
        ).order_by(ImportReservation.created_at.desc())
    )
    digits = _phone_digits(client_phone)
    for prev in result.scalars().all():
        if _phone_digits(prev.client_phone) == digits:
            pin = prev.order_pin or _gen_pin()
            if not prev.order_pin:
                prev.order_pin = pin
                session.add(prev)
            return claimed_token, pin
    return uuid.uuid4(), _gen_pin()


def _item_read(i: ImportCatalogItem) -> ImportCatalogItemRead:
    available = _physical_available(i)
    return ImportCatalogItemRead(
        id=i.id,
        tenant_id=i.tenant_id,
        source=i.source,
        cotizacion_id=i.cotizacion_id,
        title=i.title,
        hook=i.hook,
        description=i.description,
        category=i.category,
        price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        is_offer=i.is_offer,
        compare_at_price_gtq=float(i.compare_at_price_gtq) if i.compare_at_price_gtq is not None else None,
        offer_ends_at=i.offer_ends_at,
        is_made_to_order=i.is_made_to_order,
        stock_total=i.stock_total,
        stock_sold=i.stock_sold,
        stock_available=available,
        is_published=i.is_published,
        published_at=i.published_at,
        last_reserved_at=i.last_reserved_at,
        amazon_url=i.amazon_url,
        amazon_asin=i.amazon_asin,
        image_url=i.image_url,
        notes=i.notes,
        is_active=i.is_active,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


def _reservation_read(
    r: ImportReservation, item: ImportCatalogItem | None, resolved_by_substitute: bool = False,
) -> ImportReservationRead:
    return ImportReservationRead(
        id=r.id,
        tenant_id=r.tenant_id,
        catalog_item_id=r.catalog_item_id,
        order_token=r.order_token,
        client_name=r.client_name,
        client_phone=r.client_phone,
        client_token=r.client_token,
        quantity=r.quantity,
        status=r.status,
        deposit_amount=float(r.deposit_amount) if r.deposit_amount is not None else None,
        payment_reference=r.payment_reference,
        notes=r.notes,
        expires_at=r.expires_at,
        confirmed_at=r.confirmed_at,
        comprada_at=r.comprada_at,
        en_camino_at=r.en_camino_at,
        completed_at=r.completed_at,
        no_disponible_at=r.no_disponible_at,
        cancelada_at=r.cancelada_at,
        resolution=r.resolution,
        resolution_note=r.resolution_note,
        suggested_item_id=r.suggested_item_id,
        replaces_reservation_id=r.replaces_reservation_id,
        client_notified_at=r.client_notified_at,
        resolved_by_substitute=resolved_by_substitute,
        is_active=r.is_active,
        created_at=r.created_at,
        updated_at=r.updated_at,
        item_title=item.title if item else None,
        item_image_url=item.image_url if item else None,
        item_price_gtq=float(item.price_gtq) if item and item.price_gtq is not None else None,
        item_amazon_url=item.amazon_url if item else None,
    )


async def _expire_pending_reservations(item: ImportCatalogItem, session: AsyncSession) -> None:
    """Lazy expiry: cancela reservas vencidas y libera stock_reserved."""
    now = _now()
    expired_result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.catalog_item_id == item.id,
            ImportReservation.status == "pendiente",
            ImportReservation.expires_at <= now,
            ImportReservation.is_active == True,
        )
    )
    expired = expired_result.scalars().all()
    if not expired:
        return
    total_released = sum(r.quantity for r in expired)
    for r in expired:
        r.status = "cancelada"
        r.resolution = "expiro"
        r.cancelada_at = now
        r.updated_at = now
        session.add(r)
    item.stock_reserved = max(0, item.stock_reserved - total_released)
    item.updated_at = now
    session.add(item)
    await session.commit()


async def _get_or_create_settings(
    tenant_id: uuid.UUID, session: AsyncSession
) -> ImportCatalogSettings:
    result = await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.tenant_id == tenant_id,
            ImportCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ImportCatalogSettings(tenant_id=tenant_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=ImportCatalogSettingsRead)
async def get_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create_settings(tenant_id, session)


@router.patch("/settings", response_model=ImportCatalogSettingsRead)
async def update_settings(
    body: ImportCatalogSettingsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(tenant_id, session)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    settings.updated_at = _now()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


# ── Catálogo autenticado ───────────────────────────────────────────────────────

@router.get("/", response_model=list[ImportCatalogItemRead])
async def list_catalog(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.tenant_id == tenant_id,
            ImportCatalogItem.is_active == True,
        ).order_by(ImportCatalogItem.created_at.desc())
    )
    return [_item_read(i) for i in result.scalars().all()]


@router.post("/", response_model=ImportCatalogItemRead, status_code=status.HTTP_201_CREATED)
async def create_catalog_item(
    body: ImportCatalogItemCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="El título es requerido.")
    item = ImportCatalogItem(
        tenant_id=tenant_id,
        source=body.source,
        title=body.title.strip(),
        hook=body.hook.strip() if body.hook else None,
        description=body.description,
        category=body.category.strip() if body.category else None,
        price_gtq=Decimal(str(body.price_gtq)) if body.price_gtq is not None else None,
        is_offer=body.is_offer,
        compare_at_price_gtq=Decimal(str(body.compare_at_price_gtq)) if body.compare_at_price_gtq is not None else None,
        offer_ends_at=body.offer_ends_at,
        is_made_to_order=body.is_made_to_order,
        stock_total=max(1, body.stock_total),
        is_published=body.is_published,
        published_at=_now() if body.is_published else None,
        amazon_url=body.amazon_url,
        amazon_asin=body.amazon_asin,
        image_url=body.image_url,
        notes=body.notes,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.post("/from-cotizacion/{cotizacion_id}", response_model=ImportCatalogItemRead,
             status_code=status.HTTP_201_CREATED)
async def publish_from_cotizacion(
    cotizacion_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Publica una cotización guardada como ítem del catálogo (precio de venta calculado)."""
    result = await session.execute(
        select(ImportCotizacion).where(
            ImportCotizacion.id == cotizacion_id,
            ImportCotizacion.tenant_id == tenant_id,
            ImportCotizacion.is_active == True,
        )
    )
    cotizacion = result.scalar_one_or_none()
    if not cotizacion:
        raise HTTPException(status_code=404, detail="Cotización no encontrada.")

    dup = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.cotizacion_id == cotizacion_id,
            ImportCatalogItem.tenant_id == tenant_id,
            ImportCatalogItem.is_active == True,
        )
    )
    existing = dup.scalar_one_or_none()
    if existing:
        return _item_read(existing)

    item = ImportCatalogItem(
        tenant_id=tenant_id,
        source="cotizacion",
        cotizacion_id=cotizacion_id,
        title=cotizacion.product_name,
        price_gtq=cotizacion.sale_price_gtq,
        amazon_asin=cotizacion.amazon_asin,
        stock_total=1,
        is_published=True,
        published_at=_now(),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.patch("/{item_id}", response_model=ImportCatalogItemRead)
async def update_catalog_item(
    item_id: uuid.UUID,
    body: ImportCatalogItemUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.id == item_id,
            ImportCatalogItem.tenant_id == tenant_id,
            ImportCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    changes = body.model_dump(exclude_unset=True)
    was_published = item.is_published
    _decimal_fields = ("price_gtq", "compare_at_price_gtq")
    for field, value in changes.items():
        if field in _decimal_fields and value is not None:
            setattr(item, field, Decimal(str(value)))
        else:
            setattr(item, field, value)

    if changes.get("is_published") and not was_published:
        item.published_at = _now()
    elif changes.get("is_published") is False:
        item.published_at = None

    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_item(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.id == item_id,
            ImportCatalogItem.tenant_id == tenant_id,
            ImportCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    item.is_active = False
    item.updated_at = _now()
    session.add(item)
    await session.commit()


# ── Reservas — autenticado (vendor) ───────────────────────────────────────────

@router.get("/reservations", response_model=list[ImportReservationRead])
async def list_reservations(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Bandeja de reservas del tenant con el título del ítem desnormalizado."""
    result = await session.execute(
        select(ImportReservation, ImportCatalogItem).join(
            ImportCatalogItem, ImportReservation.catalog_item_id == ImportCatalogItem.id
        ).where(
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.is_active == True,
        ).order_by(ImportReservation.created_at.desc())
    )
    rows = result.all()
    # Ids de líneas no_disponible que ya fueron resueltas con una sustituta activa.
    resolved = {
        r.replaces_reservation_id for r, _ in rows
        if r.replaces_reservation_id and r.status != "cancelada"
    }
    return [_reservation_read(r, i, r.id in resolved) for r, i in rows]


@router.patch("/reservations/{reservation_id}", response_model=ImportReservationRead)
async def update_reservation(
    reservation_id: uuid.UUID,
    body: ImportReservationUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """
    Vendor mueve la reserva por la máquina de estados (avanzar, retroceder o salir
    del flujo). Impone VALID_TRANSITIONS, ajusta stock por transición y sella/limpia
    los timestamps de cada estado. `no_disponible` acepta resolution + note + sugerido.
    """
    res_result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.id == reservation_id,
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    item_result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.id == reservation.catalog_item_id,
            ImportCatalogItem.is_active == True,
        )
    )
    item = item_result.scalar_one_or_none()

    now = _now()
    new_status = body.status

    if new_status and new_status != reservation.status:
        old_status = reservation.status
        if new_status not in VALID_TRANSITIONS.get(old_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"No se puede pasar de «{old_status}» a «{new_status}».",
            )
        # No reabrir un no_disponible que el cliente ya resolvió con un reemplazo.
        if old_status == "no_disponible" and new_status not in OFF_RAMP \
                and await _has_active_substitute(reservation.id, session):
            raise HTTPException(
                status_code=409,
                detail="Esta línea ya fue resuelta con un reemplazo; gestioná la sustituta.",
            )

        reservation.status = new_status
        if item:
            _apply_stock_transition(item, old_status, new_status, reservation.quantity)
            item.updated_at = now
            session.add(item)
        _apply_status_timestamps(reservation, old_status, new_status, now)

        # Motivo por defecto al salir del flujo sin especificar uno.
        if new_status == "no_disponible" and not reservation.resolution:
            reservation.resolution = "no_encontrado"
        elif new_status == "cancelada" and not reservation.resolution:
            reservation.resolution = "vendedor_cancelo"

    if body.resolution is not None:
        reservation.resolution = body.resolution or None
    if body.resolution_note is not None:
        reservation.resolution_note = body.resolution_note or None
    if body.suggested_item_id is not None:
        reservation.suggested_item_id = body.suggested_item_id
    if body.payment_reference is not None:
        reservation.payment_reference = body.payment_reference
    if body.notes is not None:
        reservation.notes = body.notes

    reservation.updated_at = now
    session.add(reservation)
    await session.commit()
    await session.refresh(reservation)

    resolved = await _has_active_substitute(reservation.id, session)
    return _reservation_read(reservation, item, resolved)


@router.get("/reservations/{reservation_id}/suggestions", response_model=list[ImportCatalogItemRead])
async def reservation_suggestions(
    reservation_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Alternativas parecidas al ítem de la reserva, para el picker de «no disponible»."""
    res_result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.id == reservation_id,
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    item = await session.get(ImportCatalogItem, reservation.catalog_item_id)
    if not item:
        return []
    sims = await _similar_items(tenant_id, item, session, limit=6)
    return [_item_read(s) for s in sims]


@router.post("/reservations/{reservation_id}/mark-notified", response_model=ImportReservationRead)
async def mark_reservation_notified(
    reservation_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Marca que ya se avisó al cliente (usado tras abrir el WhatsApp de aviso)."""
    res_result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.id == reservation_id,
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    reservation.client_notified_at = _now()
    reservation.updated_at = _now()
    session.add(reservation)
    await session.commit()
    await session.refresh(reservation)
    item = await session.get(ImportCatalogItem, reservation.catalog_item_id)
    resolved = await _has_active_substitute(reservation.id, session)
    return _reservation_read(reservation, item, resolved)


# ── IA (Fase 2) — generación de copy al publicar ──────────────────────────────
# Apagada por defecto. Requiere: ai_copy_enabled del tenant + ANTHROPIC_API_KEY en
# el servidor + el SDK `anthropic` instalado. Si falta cualquiera, responde con un
# error claro y NO consume nada. Modelo por defecto: Haiku 4.5 (barato y rápido),
# configurable con IMPORT_AI_COPY_MODEL. Ver [[pref-no-paid-services]].
AI_COPY_MODEL = os.environ.get("IMPORT_AI_COPY_MODEL", "claude-haiku-4-5")

_AI_COPY_SYSTEM = (
    "Eres un redactor de ventas para un catálogo de importaciones en Guatemala. "
    "Dado un producto, devuelve un gancho y una descripción que enamoren al cliente, "
    "en español neutro, cálidos y centrados en el beneficio real. Nunca inventes datos, "
    "precios ni promesas médicas. Responde SOLO con un objeto JSON válido con exactamente "
    'estas claves: {"hook": "<gancho de máx. 80 caracteres, 1 línea>", '
    '"description": "<descripción de máx. 400 caracteres, 2-3 frases>"}. Sin texto extra.'
)


class GenerateCopyBody(BaseModel):
    title: str
    category: str | None = None
    notes: str | None = None


class GeneratedCopy(BaseModel):
    hook: str
    description: str


def _parse_copy_json(text: str) -> GeneratedCopy:
    """Extrae {hook, description} del texto del modelo, tolerante a ```json fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned.strip("`")
        cleaned = cleaned[4:].strip() if cleaned.lower().startswith("json") else cleaned.strip()
    try:
        data = json.loads(cleaned)
        hook = str(data.get("hook", "")).strip()[:80]
        desc = str(data.get("description", "")).strip()[:400]
    except (ValueError, AttributeError):
        hook, desc = "", cleaned[:400]
    return GeneratedCopy(hook=hook, description=desc)


@router.post("/ai/generate-copy", response_model=GeneratedCopy)
@limiter.limit("15/minute")
async def generate_copy(
    request: Request,
    body: GenerateCopyBody,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Genera gancho + descripción con IA (Fase 2, opt-in por tenant)."""
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="El título es obligatorio.")

    settings_result = await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.tenant_id == tenant_id,
            ImportCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()
    if not settings or not settings.ai_copy_enabled:
        raise HTTPException(status_code=403, detail="La generación con IA está desactivada.")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="La IA no está configurada en el servidor.")
    try:
        import anthropic  # import perezoso: sin dependencia dura del backend
    except ImportError:
        raise HTTPException(status_code=503, detail="La IA no está disponible en el servidor.")

    prompt = f"Producto: {title}"
    if body.category and body.category.strip():
        prompt += f"\nCategoría: {body.category.strip()}"
    if body.notes and body.notes.strip():
        prompt += f"\nNotas del vendedor: {body.notes.strip()[:300]}"

    try:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=AI_COPY_MODEL,
            max_tokens=600,
            system=_AI_COPY_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:
        # No filtrar detalles del proveedor al cliente.
        raise HTTPException(status_code=502, detail="No se pudo generar el texto. Inténtalo de nuevo.")

    text = "".join(b.text for b in message.content if getattr(b, "type", None) == "text")
    return _parse_copy_json(text)


# ── Endpoints públicos ─────────────────────────────────────────────────────────

@router.get("/public/{public_token}", response_model=PublicImportCatalog)
@limiter.limit("60/minute")
async def get_public_catalog(
    request: Request,
    response: Response,
    public_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.public_token == public_token,
            ImportCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
    response.headers["X-Content-Type-Options"] = "nosniff"

    items_result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.tenant_id == settings.tenant_id,
            ImportCatalogItem.is_published == True,
            ImportCatalogItem.is_active == True,
        ).order_by(ImportCatalogItem.published_at.desc())
    )
    items = items_result.scalars().all()

    tenant = await session.get(Tenant, settings.tenant_id)
    categories = sorted({i.category for i in items if i.category})

    # "Frecuentemente juntos": solo sugerimos ítems que el cliente pueda apartar.
    in_stock_ids = {i.id for i in items if _is_available(i)}
    cooc = await _cooccurrence_map(settings.tenant_id, in_stock_ids, session)

    # Momentum del lote en vuelo: cuánta gente apartó y cuántas unidades llevan.
    # Una sola query agregada sobre índices existentes (tenant_id, status).
    momentum = await session.execute(
        select(
            func.count(distinct(ImportReservation.order_token)),
            func.coalesce(func.sum(ImportReservation.quantity), 0),
        ).where(
            ImportReservation.tenant_id == settings.tenant_id,
            ImportReservation.is_active == True,
            ImportReservation.status.in_(IN_FLIGHT_STATUSES),
        )
    )
    reserved_people, reserved_units = momentum.one()

    return PublicImportCatalog(
        business_name=settings.business_name,
        whatsapp_number=settings.whatsapp_number,
        logo_url=tenant.logo_url if tenant else None,
        theme_color=tenant.theme_color if tenant else None,
        delivery_days_min=settings.delivery_days_min,
        delivery_days_max=settings.delivery_days_max,
        trip_name=settings.trip_name,
        trip_close_at=settings.trip_close_at,
        trip_label=settings.trip_label,
        origin_label=settings.origin_label,
        categories=categories,
        reserved_people=int(reserved_people or 0),
        reserved_units=int(reserved_units or 0),
        pay_info=_pay_info(settings),
        items=[_public_item(i, cooc.get(i.id)) for i in items],
    )


def _pay_info(settings: ImportCatalogSettings) -> PublicPayInfo | None:
    """Datos de pago sólo si hay algo cargado (banco o número)."""
    if not (settings.bank_name or settings.bank_account_number):
        return None
    return PublicPayInfo(
        bank_name=settings.bank_name,
        bank_account_holder=settings.bank_account_holder,
        bank_account_number=settings.bank_account_number,
        bank_account_type=settings.bank_account_type,
    )


def _public_item(
    i: ImportCatalogItem, bought_with: list[uuid.UUID] | None = None
) -> PublicImportCatalogItem:
    # Oferta efectiva: vencida (offer_ends_at pasado) ya no cuenta como oferta.
    offer_live = bool(
        i.is_offer and (i.offer_ends_at is None or i.offer_ends_at > _now())
    )
    return PublicImportCatalogItem(
        id=i.id,
        title=i.title,
        hook=i.hook,
        description=i.description,
        category=i.category,
        price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        is_offer=offer_live,
        compare_at_price_gtq=(
            float(i.compare_at_price_gtq)
            if offer_live and i.compare_at_price_gtq is not None else None
        ),
        offer_ends_at=i.offer_ends_at if offer_live else None,
        is_made_to_order=i.is_made_to_order,
        stock_available=_max_qty(i),
        reserved_count=i.stock_reserved + i.stock_sold,
        image_url=i.image_url,
        last_reserved_at=i.last_reserved_at,
        bought_with=bought_with or [],
    )


async def _cooccurrence_map(
    tenant_id: uuid.UUID,
    in_stock_ids: set[uuid.UUID],
    session: AsyncSession,
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """'Frecuentemente juntos' — recomendador por comportamiento real, sin IA.

    Cuenta pares de ítems que un mismo cliente apartó en el mismo pedido
    (order_token) y devuelve, por ítem, los IDs más co-ocurrentes que aún están
    publicados y con stock (`in_stock_ids`). No expone datos personales: solo IDs
    de catálogo. Una sola query en la carga del catálogo público.
    """
    if len(in_stock_ids) < 2:
        return {}
    rows = await session.execute(
        select(ImportReservation.order_token, ImportReservation.catalog_item_id)
        .where(
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.order_token.is_not(None),
            ImportReservation.status.in_(ACTIVE_STATUSES),
        )
    )
    # order_token → ítems (en stock) apartados juntos
    orders: dict[uuid.UUID, set[uuid.UUID]] = {}
    for token, iid in rows.all():
        if iid in in_stock_ids:
            orders.setdefault(token, set()).add(iid)

    counts: dict[uuid.UUID, dict[uuid.UUID, int]] = {}
    for members in orders.values():
        if len(members) < 2:
            continue
        for a in members:
            for b in members:
                if a != b:
                    counts.setdefault(a, {})[b] = counts.setdefault(a, {}).get(b, 0) + 1

    return {
        a: [b for b, _ in sorted(others.items(), key=lambda kv: kv[1], reverse=True)[:4]]
        for a, others in counts.items()
    }


@router.post(
    "/public/{public_token}/reserve/{item_id}",
    response_model=PublicImportReservationRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def create_reservation(
    request: Request,
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    body: ImportReservationCreate,
    src: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint público — el cliente aparta un producto sin iniciar sesión.

    `src` (querystring) es la atribución de campaña del enlace/QR (ej. ?src=insta).
    Al apartar se ficha al cliente (upsert por teléfono) en import_clientes.
    """
    if not body.client_name.strip() or not body.client_phone.strip():
        raise HTTPException(status_code=400, detail="Nombre y teléfono son requeridos.")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")

    settings_result = await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.public_token == public_token,
            ImportCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    item_result = await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.id == item_id,
            ImportCatalogItem.tenant_id == settings.tenant_id,
            ImportCatalogItem.is_published == True,
            ImportCatalogItem.is_active == True,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    await _expire_pending_reservations(item, session)
    await session.refresh(item)

    available = _max_qty(item)
    if available < body.quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Solo hay {available} unidad(es) disponible(s).",
        )

    now = _now()
    order_token, order_pin = await _resolve_order_token(
        settings.tenant_id, body.client_phone, session, body.order_token
    )
    cliente_id = await _upsert_cliente_from_reservation(
        tenant_id=settings.tenant_id,
        name=body.client_name,
        phone=body.client_phone,
        source="qr" if src else "catalogo",
        attribution=(src.strip()[:120] if src else None),
        session=session,
    )
    reservation = ImportReservation(
        tenant_id=settings.tenant_id,
        catalog_item_id=item_id,
        cliente_id=cliente_id,
        client_name=body.client_name.strip(),
        client_phone=body.client_phone.strip(),
        client_token=uuid.uuid4(),
        order_token=order_token,
        order_pin=order_pin,
        quantity=body.quantity,
        status="pendiente",
        deposit_amount=Decimal(str(body.deposit_amount)) if body.deposit_amount else None,
        notes=body.notes,
        expires_at=now + timedelta(hours=RESERVATION_EXPIRY_HOURS),
    )
    session.add(reservation)

    item.stock_reserved = item.stock_reserved + body.quantity
    item.last_reserved_at = now
    item.updated_at = now
    session.add(item)

    await session.commit()
    await session.refresh(reservation)

    # Avisar al vendedor para que dé seguimiento (mejora sobre shopper).
    await send_push_to_tenant(
        session=session,
        tenant_id=settings.tenant_id,
        title="🛍️ Nueva reserva",
        body=f"{reservation.client_name} apartó {item.title}",
        data={"module": "importaciones", "view": "catalog", "reservation_id": str(reservation.id)},
    )

    return PublicImportReservationRead(
        id=reservation.id,
        client_token=reservation.client_token,
        order_token=reservation.order_token,
        order_pin=reservation.order_pin,
        client_name=reservation.client_name,
        quantity=reservation.quantity,
        status=reservation.status,
        deposit_amount=float(reservation.deposit_amount) if reservation.deposit_amount is not None else None,
        expires_at=reservation.expires_at,
        item_title=item.title,
        item_price_gtq=float(item.price_gtq) if item.price_gtq is not None else None,
        whatsapp_number=settings.whatsapp_number,
        created_at=reservation.created_at,
    )


async def _build_order(order_token: uuid.UUID, session: AsyncSession) -> PublicImportOrder | None:
    """Arma el pedido acumulado del cliente (con lazy-expiry). None si no existe."""
    result = await session.execute(
        select(ImportReservation, ImportCatalogItem).join(
            ImportCatalogItem, ImportReservation.catalog_item_id == ImportCatalogItem.id
        ).where(
            ImportReservation.order_token == order_token,
            ImportReservation.is_active == True,
        ).order_by(ImportReservation.created_at.desc())
    )
    rows = result.all()
    if not rows:
        return None

    tenant_id = rows[0][0].tenant_id
    settings_result = await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.tenant_id == tenant_id,
            ImportCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()

    # Lazy expiry de las pendientes vencidas del pedido.
    now = _now()
    dirty = False
    for reservation, item in rows:
        if reservation.status == "pendiente" and reservation.expires_at <= now:
            reservation.status = "cancelada"
            reservation.resolution = "expiro"
            reservation.cancelada_at = now
            reservation.updated_at = now
            session.add(reservation)
            item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
            item.updated_at = now
            session.add(item)
            dirty = True
    if dirty:
        await session.commit()

    tenant = await session.get(Tenant, tenant_id)
    order_item_ids = {i.id for _, i in rows}
    resolved_ids = {
        r.replaces_reservation_id for r, _ in rows
        if r.replaces_reservation_id and r.status != "cancelada"
    }

    lines: list[PublicImportOrderLine] = []
    for r, i in rows:
        suggestions: list[PublicImportCatalogItem] = []
        # Sólo un no_disponible AÚN sin resolver ofrece reemplazos al cliente.
        if r.status == "no_disponible" and r.id not in resolved_ids:
            seen: set[uuid.UUID] = set(order_item_ids)
            if r.suggested_item_id:
                pinned = await session.get(ImportCatalogItem, r.suggested_item_id)
                if pinned and pinned.is_published and pinned.is_active \
                        and _is_available(pinned):
                    suggestions.append(_public_item(pinned))
                    seen.add(pinned.id)
            for s in await _similar_items(tenant_id, i, session, limit=4, exclude_ids=seen):
                if len(suggestions) >= 4:
                    break
                suggestions.append(_public_item(s))
        lines.append(PublicImportOrderLine(
            id=r.id,
            item_id=i.id,
            item_title=i.title,
            item_image_url=i.image_url,
            item_price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
            quantity=r.quantity,
            status=r.status,
            # El cliente puede editar/quitar mientras no se confirme (solo pendiente).
            editable=(r.status == "pendiente" and r.expires_at > now),
            # Tope al que puede subir: lo disponible + lo que ya tiene tomado.
            stock_available=_max_qty(i, r.quantity),
            expires_at=r.expires_at,
            created_at=r.created_at,
            resolution=r.resolution,
            resolution_note=r.resolution_note,
            suggested_items=suggestions,
            resolved_by_substitute=(r.id in resolved_ids),
        ))
    # Totales sólo sobre líneas vivas (excluye no_disponible y cancelada).
    active = [l for l in lines if l.status in ACTIVE_STATUSES]
    return PublicImportOrder(
        order_token=order_token,
        order_pin=rows[0][0].order_pin,
        catalog_token=settings.public_token if settings else None,
        client_name=rows[0][0].client_name,
        business_name=settings.business_name if settings else None,
        whatsapp_number=settings.whatsapp_number if settings else None,
        logo_url=tenant.logo_url if tenant else None,
        theme_color=tenant.theme_color if tenant else None,
        trip_name=settings.trip_name if settings else None,
        trip_close_at=settings.trip_close_at if settings else None,
        trip_label=settings.trip_label if settings else None,
        origin_label=settings.origin_label if settings else None,
        delivery_days_min=settings.delivery_days_min if settings else 5,
        delivery_days_max=settings.delivery_days_max if settings else 7,
        pay_info=_pay_info(settings) if settings else None,
        lines=lines,
        total_gtq=sum((l.item_price_gtq or 0) * l.quantity for l in active),
        total_items=sum(l.quantity for l in active),
    )


async def _load_editable_line(
    order_token: uuid.UUID, reservation_id: uuid.UUID, session: AsyncSession,
) -> tuple[ImportReservation, ImportCatalogItem]:
    """Carga una línea del pedido validando que siga editable (pendiente, no vencida)."""
    result = await session.execute(
        select(ImportReservation, ImportCatalogItem).join(
            ImportCatalogItem, ImportReservation.catalog_item_id == ImportCatalogItem.id
        ).where(
            ImportReservation.id == reservation_id,
            ImportReservation.order_token == order_token,
            ImportReservation.is_active == True,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Producto no encontrado en tu pedido.")
    reservation, item = row
    if reservation.status != "pendiente" or reservation.expires_at <= _now():
        raise HTTPException(
            status_code=409,
            detail="Ya no se puede cambiar: este producto ya fue confirmado o venció.",
        )
    return reservation, item


@router.get("/public/order/{order_token}", response_model=PublicImportOrder)
@limiter.limit("60/minute")
async def get_client_order(
    request: Request,
    response: Response,
    order_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint público — pedido acumulado del cliente (todas sus reservas)."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.post("/public/order/lookup", response_model=PublicImportOrder)
@limiter.limit("10/minute")
async def lookup_order(
    request: Request,
    response: Response,
    body: OrderLookupBody,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente recupera su pedido con su WhatsApp + PIN de 4 dígitos,
    sin necesitar el link directo. Rate-limitado para acotar el brute-force del PIN."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    digits = _phone_digits(body.phone)
    pin = body.pin.strip()
    if len(digits) < 8 or len(pin) != 4 or not pin.isdigit():
        # Mensaje genérico — no revelar qué parte falló.
        raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")

    catalog = (await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.public_token == body.catalog_token,
            ImportCatalogSettings.is_active == True,
        )
    )).scalar_one_or_none()
    if not catalog:
        raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")

    result = await session.execute(
        select(ImportReservation).where(
            ImportReservation.tenant_id == catalog.tenant_id,
            ImportReservation.order_pin == pin,
            ImportReservation.is_active == True,
            ImportReservation.order_token.is_not(None),
        ).order_by(ImportReservation.created_at.desc())
    )
    for r in result.scalars().all():
        if _phone_digits(r.client_phone) == digits and r.order_token:
            order = await _build_order(r.order_token, session)
            if order is not None:
                return order
    raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")


@router.patch("/public/order/{order_token}/line/{reservation_id}", response_model=PublicImportOrder)
@limiter.limit("30/minute")
async def update_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    body: PublicOrderLineUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente cambia la cantidad de una línea pendiente de su pedido."""
    reservation, item = await _load_editable_line(order_token, reservation_id, session)

    new_qty = body.quantity
    if new_qty < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")
    # Tope: lo disponible ahora + lo que esta línea ya tiene tomado.
    max_qty = _max_qty(item, reservation.quantity)
    if new_qty > max_qty:
        raise HTTPException(status_code=409, detail=f"Solo hay {max_qty} unidad(es) disponible(s).")

    now = _now()
    delta = new_qty - reservation.quantity
    reservation.quantity = new_qty
    reservation.updated_at = now
    session.add(reservation)
    item.stock_reserved = max(0, item.stock_reserved + delta)
    item.updated_at = now
    session.add(item)
    await session.commit()

    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.delete("/public/order/{order_token}/line/{reservation_id}", response_model=PublicImportOrder)
@limiter.limit("30/minute")
async def delete_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente quita una línea pendiente de su pedido (libera stock)."""
    reservation, item = await _load_editable_line(order_token, reservation_id, session)

    now = _now()
    reservation.status = "cancelada"
    reservation.resolution = "cliente_quito"
    reservation.cancelada_at = now
    reservation.updated_at = now
    session.add(reservation)
    item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
    item.updated_at = now
    session.add(item)
    await session.commit()

    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.post("/public/order/{order_token}/line/{reservation_id}/swap/{new_item_id}",
             response_model=PublicImportOrder)
@limiter.limit("20/minute")
async def swap_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    new_item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente acepta un reemplazo de una línea no_disponible.
    Crea una reserva sustituta bajo el mismo pedido, ligada a la original."""
    row = await session.execute(
        select(ImportReservation).where(
            ImportReservation.id == reservation_id,
            ImportReservation.order_token == order_token,
            ImportReservation.is_active == True,
        )
    )
    original = row.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Producto no encontrado en tu pedido.")
    if original.status != "no_disponible":
        raise HTTPException(status_code=409, detail="Este producto no está disponible para cambio.")
    if await _has_active_substitute(original.id, session):
        raise HTTPException(status_code=409, detail="Ya cambiaste este producto por otro.")

    new_item = await session.get(ImportCatalogItem, new_item_id)
    if not new_item or new_item.tenant_id != original.tenant_id \
            or not new_item.is_published or not new_item.is_active:
        raise HTTPException(status_code=404, detail="Ese producto ya no está disponible.")

    await _expire_pending_reservations(new_item, session)
    await session.refresh(new_item)
    available = _max_qty(new_item)
    if available < 1:
        raise HTTPException(status_code=409, detail="Ese producto ya no tiene disponibilidad.")

    now = _now()
    qty = max(1, min(original.quantity, available))
    substitute = ImportReservation(
        tenant_id=original.tenant_id,
        catalog_item_id=new_item.id,
        cliente_id=original.cliente_id,
        client_name=original.client_name,
        client_phone=original.client_phone,
        client_token=uuid.uuid4(),
        order_token=order_token,
        quantity=qty,
        status="pendiente",
        expires_at=now + timedelta(hours=RESERVATION_EXPIRY_HOURS),
        replaces_reservation_id=original.id,
    )
    session.add(substitute)
    new_item.stock_reserved = new_item.stock_reserved + qty
    new_item.last_reserved_at = now
    new_item.updated_at = now
    session.add(new_item)
    original.updated_at = now
    session.add(original)
    await session.commit()

    await send_push_to_tenant(
        session=session,
        tenant_id=original.tenant_id,
        title="🔁 Cambio aceptado",
        body=f"{original.client_name} aceptó {new_item.title} como reemplazo",
        data={"module": "importaciones", "view": "catalog", "reservation_id": str(substitute.id)},
    )

    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.post("/public/order/{order_token}/line/{reservation_id}/dismiss",
             response_model=PublicImportOrder)
@limiter.limit("30/minute")
async def dismiss_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente quita del pedido una línea ya cerrada (no_disponible/cancelada).
    Soft-hide: no cambia el estado, sólo la saca de su vista (is_active=false)."""
    row = await session.execute(
        select(ImportReservation).where(
            ImportReservation.id == reservation_id,
            ImportReservation.order_token == order_token,
            ImportReservation.is_active == True,
        )
    )
    reservation = row.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Producto no encontrado en tu pedido.")
    if reservation.status not in ("no_disponible", "cancelada"):
        raise HTTPException(status_code=409, detail="Este producto no se puede quitar así.")
    reservation.is_active = False
    reservation.updated_at = _now()
    session.add(reservation)
    await session.commit()

    order = await _build_order(order_token, session)
    if order is None:
        # Era la última línea visible del pedido.
        return PublicImportOrder(order_token=order_token, client_name=reservation.client_name, lines=[])
    return order


@router.get("/public/reservation/{client_token}", response_model=PublicImportReservationRead)
@limiter.limit("60/minute")
async def get_client_reservation(
    request: Request,
    client_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint público — el cliente ve el estado de su reserva."""
    result = await session.execute(
        select(ImportReservation, ImportCatalogItem, ImportCatalogSettings).join(
            ImportCatalogItem, ImportReservation.catalog_item_id == ImportCatalogItem.id
        ).join(
            ImportCatalogSettings, ImportCatalogSettings.tenant_id == ImportReservation.tenant_id
        ).where(
            ImportReservation.client_token == client_token,
            ImportReservation.is_active == True,
            ImportCatalogSettings.is_active == True,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    reservation, item, settings = row

    now = _now()
    if reservation.status == "pendiente" and reservation.expires_at <= now:
        reservation.status = "cancelada"
        reservation.resolution = "expiro"
        reservation.cancelada_at = now
        reservation.updated_at = now
        session.add(reservation)
        item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
        item.updated_at = now
        session.add(item)
        await session.commit()

    return PublicImportReservationRead(
        id=reservation.id,
        client_token=reservation.client_token,
        order_token=reservation.order_token,
        order_pin=reservation.order_pin,
        client_name=reservation.client_name,
        quantity=reservation.quantity,
        status=reservation.status,
        deposit_amount=float(reservation.deposit_amount) if reservation.deposit_amount is not None else None,
        expires_at=reservation.expires_at,
        item_title=item.title,
        item_price_gtq=float(item.price_gtq) if item.price_gtq is not None else None,
        whatsapp_number=settings.whatsapp_number,
        created_at=reservation.created_at,
    )
