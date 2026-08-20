"""
MÓDULO: SHOPPER CATALOG — Catálogo-juego "La Maleta" del Personal Shopper.
Paridad con api/routers/import_catalog.py (máquina de estados, pedido acumulado,
PIN, ofertas, facetas), pero con calculadora maleta/caja propia y sin la ficha de
clientes de importaciones (los clientes se derivan de las reservas).

Autenticado (get_current_tenant_id → RLS):
  GET/PATCH /settings                                  → ajustes del catálogo público
  GET/PATCH /calc-settings                             → config PRIVADA de la calculadora
  GET       /                                          → listar ítems
  POST      /                                          → crear ítem (manual | amazon | foto)
  POST      /from-trip/{trip_item_id}                  → publicar desde un ítem de viaje
  PATCH     /{id}                                       → actualizar ítem
  DELETE    /{id}                                       → soft-delete
  GET       /reservations                               → bandeja de reservas
  PATCH     /reservations/{id}                          → mover por la máquina de estados
  GET       /reservations/{id}/suggestions             → similares (picker no_disponible)
  POST      /reservations/{id}/mark-notified           → marcar avisado

Público (sin auth, rate-limit propio, filtro por tenant derivado del token):
  GET  /public/{token}                                 → catálogo visible al cliente
  POST /public/{token}/reserve/{iid}                   → apartar (acumula pedido + PIN)
  GET  /public/order/{order_token}                     → pedido acumulado del cliente
  POST /public/order/lookup                            → recuperar con WhatsApp + PIN
  PATCH/DELETE /public/order/{ot}/line/{rid}           → editar/quitar línea pendiente
  POST /public/order/{ot}/line/{rid}/swap/{niid}       → aceptar reemplazo
  POST /public/order/{ot}/line/{rid}/dismiss           → ocultar línea cerrada
  GET  /public/reservation/{client_token}              → estado de una reserva
"""
import uuid
import unicodedata
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import time as _time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import distinct, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from core.limiter import limiter
from api.services.push_service import send_push_to_tenant
from models.bakery import (
    ShopperCatalogSettings, ShopperCatalogItem, ShopperReservation,
    ShopperTripItem, ShopperCalcSettings, ShopperStoreSession,
    ShopperCoupon, ShopperCouponRedemption,
    SHOPPER_STATUS_FLOW as STATUS_FLOW,
    SHOPPER_OFF_RAMP as OFF_RAMP,
    SHOPPER_VALID_TRANSITIONS as VALID_TRANSITIONS,
    SHOPPER_STATUS_TS_FIELD as STATUS_TS_FIELD,
)
from models.tenants import Tenant
from models.schemas import (
    ShopperCatalogSettingsRead, ShopperCatalogSettingsUpdate, ShopperStoreOpen,
    ShopperCalcSettingsRead, ShopperCalcSettingsUpdate,
    ShopperCatalogItemCreate, ShopperCatalogItemUpdate, ShopperCatalogItemRead,
    PublicShopperCatalog, PublicShopperCatalogItem, PublicShopperPulse,
    PublicShopperItemAvailability, ShopperPayInfo,
    ShopperReservationCreate, ShopperReservationUpdate, ShopperReservationRead,
    ShopperManualSaleCreate,
    PublicShopperReservationRead, PublicShopperOrder, PublicShopperOrderLine,
    PublicShopperOrderLineUpdate, ShopperOrderLookupBody,
    ShopperCouponInput, ShopperCouponRead, CouponRedemptionRead,
    CouponApplyBody, CouponPreview,
    ShopperStatsRead, ShopperStatsBucket, ShopperStatsProduct,
    ShopperStoreSessionRead,
)

router = APIRouter(tags=["Shopper Catalog"])

RESERVATION_EXPIRY_HOURS = 2
# Ventana anti-doble-toque: el temblor y el toque doble son la norma en móvil (y arriba
# de los 65, la regla). Dos toques daban DOS líneas de 1 con el mismo toast: el cliente
# no podía notar la diferencia y descubría el duplicado al pagar.
DOUBLE_TAP_WINDOW_SECONDS = 10
ORDER_GROUPING_DAYS = 7
MADE_TO_ORDER_MAX_QTY = 10

# Estados "vivos" del pedido para totales y momentum (excluye salidas).
ACTIVE_STATUSES = ("pendiente", "confirmada", "comprada", "en_camino", "entregada")
# "En vuelo": lo que todavía viaja en la maleta actual (excluye entregada).
IN_FLIGHT_STATUSES = ("pendiente", "confirmada", "comprada", "en_camino")

_STOPWORDS = {
    "de", "la", "el", "los", "las", "con", "para", "por", "y", "o", "un", "una",
    "the", "for", "with", "a", "an", "of", "en", "del", "al",
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(dt: datetime | None) -> datetime | None:
    """El front manda ISO con 'Z' → datetime aware; las columnas son TIMESTAMP naive
    (UTC). Convertí a UTC y soltá el tzinfo antes de persistir."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _physical_available(i: ShopperCatalogItem) -> int:
    return max(0, i.stock_total - i.stock_reserved - i.stock_sold)


def _max_qty(i: ShopperCatalogItem, current: int = 0) -> int:
    if i.is_made_to_order:
        return MADE_TO_ORDER_MAX_QTY
    return _physical_available(i) + current


def _is_available(i: ShopperCatalogItem) -> bool:
    return i.is_made_to_order or _physical_available(i) > 0


def _effective_store_live(settings: ShopperCatalogSettings | None, now: datetime) -> bool:
    """La tienda está viva SOLO si el dueño la abrió y el reloj no venció. Así el
    auto-cierre por tiempo no necesita cron: se computa al leer."""
    return bool(
        settings is not None
        and settings.store_status == "live"
        and (settings.store_closes_at is None or settings.store_closes_at > now)
    )


def _listing_open(i: ShopperCatalogItem, settings: ShopperCatalogSettings | None, now: datetime) -> bool:
    """¿La ventana de publicación del ítem está abierta? Los 'live' viven mientras
    su tienda (misma sesión) siga viva; los de catálogo, hasta expires_at."""
    if i.listing == "live":
        return (
            _effective_store_live(settings, now)
            and i.store_session_id is not None
            and settings is not None
            and i.store_session_id == settings.store_session_id
        )
    return i.expires_at is None or i.expires_at > now


def _reservable(i: ShopperCatalogItem, settings: ShopperCatalogSettings | None, now: datetime) -> bool:
    return _listing_open(i, settings, now) and _is_available(i)


def _dt_ms(dt: datetime | None) -> int:
    """Epoch en ms de un datetime naive-UTC (como los guarda _now). Determinista →
    idéntico entre el pulso y el catálogo completo, así el stamp `v` coincide."""
    if dt is None:
        return 0
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _pulse_stamp(items: list[ShopperCatalogItem], settings: ShopperCatalogSettings, now: datetime) -> str:
    """Stamp de versión del catálogo público. Rota ante: ítem nuevo/despublicado
    (count), reserva o venta (taken + max updated_at), edición/transición
    (max updated_at), y cierre por reloj (live_flag, que es time-driven y no bumpea
    ningún updated_at). Se computa igual acá y en el pulso → comparación por igualdad."""
    n = len(items)
    taken = sum((i.stock_reserved + i.stock_sold) for i in items)
    i_upd = max((_dt_ms(i.updated_at) for i in items), default=0)
    s_upd = _dt_ms(settings.updated_at)
    live = 1 if _effective_store_live(settings, now) else 0
    return f"{n}:{taken}:{i_upd}:{s_upd}:{live}"


# Micro-cache in-process del pulso (por worker, a propósito no compartido). Colapsa
# la manada de polls que se escapa del edge de Cloudflare: con TTL 3s, el origin corre
# a lo sumo ~1 aggregate cada 3s por token sin importar cuántos espectadores. Sin Redis.
_PULSE_TTL = 3.0
_pulse_cache: dict[uuid.UUID, tuple[float, "PublicShopperPulse"]] = {}


def _pulse_cache_get(token: uuid.UUID) -> "PublicShopperPulse | None":
    hit = _pulse_cache.get(token)
    if hit and hit[0] > _time.monotonic():
        return hit[1]
    return None


def _pulse_cache_set(token: uuid.UUID, payload: "PublicShopperPulse") -> None:
    if len(_pulse_cache) > 512:          # cota de seguridad; en la práctica 1 token/tenant
        _pulse_cache.clear()
    _pulse_cache[token] = (_time.monotonic() + _PULSE_TTL, payload)


def _phone_digits(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _gen_pin() -> str:
    return f"{secrets.randbelow(10000):04d}"


def _tokens(text: str | None) -> set[str]:
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
    tenant_id: uuid.UUID, original: ShopperCatalogItem, session: AsyncSession,
    limit: int = 4, exclude_ids: set[uuid.UUID] | None = None,
) -> list[ShopperCatalogItem]:
    """Reemplazos parecidos 100% deterministas (sin IA): banda de precio + solape
    de título + misma categoría/fuente + oferta. Sólo publicados, activos, con stock."""
    exclude = set(exclude_ids or ())
    exclude.add(original.id)
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        )
    )
    p = float(original.price_gtq) if original.price_gtq is not None else None
    orig_tokens = _tokens(original.title)
    scored: list[tuple[float, datetime, ShopperCatalogItem]] = []
    for c in result.scalars().all():
        # Sólo se sugieren reemplazos evergreen (catálogo): un ítem de una venta en
        # vivo puede estar cerrado o vencido y no se puede volver a apartar.
        if c.id in exclude or c.listing == "live" or not _is_available(c):
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


def _apply_stock_transition(item: ShopperCatalogItem, old: str, new: str, qty: int) -> None:
    """Contabilidad de stock por transición: entrega mueve reservado→vendido;
    salir del flujo libera reservado; reabrir lo vuelve a tomar."""
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


def _apply_status_timestamps(res: ShopperReservation, old: str, new: str, now: datetime) -> None:
    """Sella el timestamp del estado al entrar y limpia los abandonados al retroceder."""
    ts_new = STATUS_TS_FIELD.get(new)
    if ts_new and getattr(res, ts_new) is None:
        setattr(res, ts_new, now)
    if old in STATUS_FLOW and new in STATUS_FLOW and STATUS_FLOW.index(new) < STATUS_FLOW.index(old):
        for s in STATUS_FLOW[STATUS_FLOW.index(new) + 1: STATUS_FLOW.index(old) + 1]:
            f = STATUS_TS_FIELD.get(s)
            if f:
                setattr(res, f, None)
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
    result = await session.execute(
        select(ShopperReservation.id).where(
            ShopperReservation.replaces_reservation_id == reservation_id,
            ShopperReservation.is_active == True,
            ShopperReservation.status != "cancelada",
        )
    )
    return result.first() is not None


async def _resolve_order_token(
    tenant_id: uuid.UUID,
    client_phone: str,
    session: AsyncSession,
    claimed_token: uuid.UUID | None = None,
) -> tuple[uuid.UUID, str]:
    """Reusa (order_token, order_pin) del pedido que el cliente YA tiene abierto, o
    crea uno nuevo. El PIN se comparte entre todas las reservas del pedido.

    Sólo se reusa si el cliente presenta su `order_token` (lo guarda su navegador)
    y además el teléfono coincide. Agrupar sólo por teléfono era una puerta abierta:
    cualquiera que apartara poniendo el número de otra persona recibía en la
    respuesta el token y el PIN de ESE pedido — con eso veía el pedido completo del
    otro y podía borrarle líneas. Quien pierde el link se reencuentra por
    teléfono + PIN en /order/lookup, que sí exige las dos cosas.
    """
    if claimed_token is None:
        return uuid.uuid4(), _gen_pin()

    since = _now() - timedelta(days=ORDER_GROUPING_DAYS)
    result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.order_token == claimed_token,
            ShopperReservation.is_active == True,
            ShopperReservation.created_at >= since,
        ).order_by(ShopperReservation.created_at.desc())
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


def _item_read(i: ShopperCatalogItem) -> ShopperCatalogItemRead:
    return ShopperCatalogItemRead(
        id=i.id,
        tenant_id=i.tenant_id,
        source=i.source,
        trip_item_id=i.trip_item_id,
        title=i.title,
        hook=i.hook,
        description=i.description,
        category=i.category,
        price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        price_usd=float(i.price_usd) if i.price_usd is not None else None,
        is_made_to_order=i.is_made_to_order,
        stock_total=i.stock_total,
        stock_sold=i.stock_sold,
        stock_available=_physical_available(i),
        listing=i.listing,
        expires_at=i.expires_at,
        is_published=i.is_published,
        is_offer=i.is_offer,
        compare_at_price_gtq=float(i.compare_at_price_gtq) if i.compare_at_price_gtq is not None else None,
        offer_ends_at=i.offer_ends_at,
        published_at=i.published_at,
        last_reserved_at=i.last_reserved_at,
        amazon_url=i.amazon_url,
        amazon_asin=i.amazon_asin,
        image_url=i.image_url,
        notes=i.notes,
        calc_mode=i.calc_mode,
        calc_weight_lbs=float(i.calc_weight_lbs) if i.calc_weight_lbs is not None else None,
        calc_volume_in3=float(i.calc_volume_in3) if i.calc_volume_in3 is not None else None,
        calc_total_cost_gtq=float(i.calc_total_cost_gtq) if i.calc_total_cost_gtq is not None else None,
        is_active=i.is_active,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


def _reservation_read(
    r: ShopperReservation, item: ShopperCatalogItem | None, resolved_by_substitute: bool = False,
) -> ShopperReservationRead:
    return ShopperReservationRead(
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
        item_cost_gtq=(
            float(item.calc_total_cost_gtq)
            if item and item.calc_total_cost_gtq is not None else None
        ),
    )


async def _expire_pending_reservations(
    item: ShopperCatalogItem, session: AsyncSession, *, commit: bool = True,
) -> None:
    """Libera el stock de reservas vencidas del ítem. Con `commit=False` NO commitea:
    imprescindible cuando el caller sostiene un `SELECT ... FOR UPDATE` sobre el ítem
    (commitear soltaría el lock antes de reservar → reabriría la carrera de sobreventa)."""
    now = _now()
    expired_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.catalog_item_id == item.id,
            ShopperReservation.status == "pendiente",
            ShopperReservation.expires_at <= now,
            ShopperReservation.is_active == True,
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
    if commit:
        await session.commit()


async def _expire_tenant_pending_reservations(
    tenant_id: uuid.UUID, session: AsyncSession,
) -> None:
    """Libera el stock de TODAS las reservas vencidas del tenant.

    Sin esto el barrido sólo corría al reservar sobre el mismo ítem (`create_reservation`),
    y eso deja una trampa que se cierra sola: si `remaining` llega a 0 por reservas que ya
    vencieron, el ítem sale `closed` → el botón queda deshabilitado → nadie puede reservar
    → nada vuelve a barrerlo. Producto en mano, invendible para siempre. Además la escasez
    mentía hacia abajo ("¡Quedan 1!" con 3 libres), frenando ventas.

    Set-based y race-free, igual que el de `_build_order`: el UPDATE de la reserva es el
    árbitro (sólo una tx la saca de 'pendiente'), así que dos requests concurrentes no
    restan dos veces la misma expiración.
    """
    now = _now()
    # Chequeo barato primero: este es un GET público y cacheado. Sin esto abriríamos una
    # tx de escritura en cada cache-miss aunque no haya nada que barrer.
    # Usa ix_shopper_reservations_tenant_status.
    stale = await session.scalar(
        select(ShopperReservation.id)
        .where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.status == "pendiente",
            ShopperReservation.expires_at <= now,
            ShopperReservation.is_active == True,
        )
        .limit(1)
    )
    if stale is None:
        return

    # `victims` toma el lock del ÍTEM antes de tocar la reserva: el mismo orden que
    # create_reservation (ítem → reserva). Al revés — reserva primero, ítem después —
    # este barrido y una reserva en curso se bloquean cruzados y Postgres mata a una de
    # las dos por deadlock: el dueño publicando mientras un cliente aparta.
    # SKIP LOCKED además hace que nunca espere: lo que esté ocupado lo barre la pasada
    # siguiente (o el propio reserve, que corre su barrido bajo el mismo lock).
    await session.execute(
        text("""
            WITH victims AS (
                SELECT r.id
                  FROM shopper_reservations r
                  JOIN shopper_catalog_items i ON i.id = r.catalog_item_id
                 WHERE r.tenant_id=:tid AND r.status='pendiente'
                   AND r.expires_at<=:now AND r.is_active=true
                 ORDER BY r.catalog_item_id
                   FOR UPDATE OF i SKIP LOCKED
            ), expired AS (
                UPDATE shopper_reservations
                   SET status='cancelada', resolution='expiro',
                       cancelada_at=:now, updated_at=:now
                 WHERE id IN (SELECT id FROM victims) AND status='pendiente'
                RETURNING catalog_item_id, quantity
            ), agg AS (
                SELECT catalog_item_id, SUM(quantity) AS q
                  FROM expired GROUP BY catalog_item_id
            )
            UPDATE shopper_catalog_items i
               SET stock_reserved=GREATEST(0, i.stock_reserved - agg.q),
                   updated_at=:now
              FROM agg WHERE i.id=agg.catalog_item_id
        """),
        {"now": now, "tid": tenant_id},
    )
    await session.commit()


async def _get_or_create_settings(
    tenant_id: uuid.UUID, session: AsyncSession
) -> ShopperCatalogSettings:
    result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.tenant_id == tenant_id,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ShopperCatalogSettings(tenant_id=tenant_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


async def _get_or_create_calc_settings(
    tenant_id: uuid.UUID, session: AsyncSession
) -> ShopperCalcSettings:
    result = await session.execute(
        select(ShopperCalcSettings).where(
            ShopperCalcSettings.tenant_id == tenant_id,
            ShopperCalcSettings.is_active == True,
        )
    )
    calc = result.scalar_one_or_none()
    if not calc:
        calc = ShopperCalcSettings(tenant_id=tenant_id)
        session.add(calc)
        await session.commit()
        await session.refresh(calc)
    return calc


# ── Settings del catálogo público ─────────────────────────────────────────────

@router.get("/settings", response_model=ShopperCatalogSettingsRead)
async def get_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create_settings(tenant_id, session)


@router.patch("/settings", response_model=ShopperCatalogSettingsRead)
async def update_settings(
    body: ShopperCatalogSettingsUpdate,
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


# ── Venta en vivo ─────────────────────────────────────────────────────────────

@router.post("/store/open", response_model=ShopperCatalogSettingsRead)
async def open_store(
    body: ShopperStoreOpen,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Abre la venta en vivo: arranca el reloj y una sesión nueva. Los ítems que
    se publiquen mientras esté viva quedan sellados a esta sesión."""
    settings = await _get_or_create_settings(tenant_id, session)
    now = _now()

    # Abrir con una venta ya viva (doble toque, dos pestañas) dejaría la sesión anterior
    # abierta para siempre: settings.store_session_id se pisa y nadie la cierra nunca.
    if _effective_store_live(settings, now):
        await _close_open_sessions(tenant_id, session, now)

    settings.store_status = "live"
    settings.store_name = body.store_name.strip() if body.store_name else None
    settings.store_opened_at = now
    settings.store_session_id = uuid.uuid4()
    # Omitir la foto conserva la anterior (reabrir en Target no obliga a re-subirla);
    # "" la quita.
    if body.banner_url is not None:
        settings.store_banner_url = body.banner_url or None
    if body.closes_at is not None:
        # `.replace(tzinfo=None)` tiraba el offset en vez de convertirlo: un dueño en
        # USA (el caso normal de este módulo) mandando "cierro 5 PM" desde California
        # cerraba la tienda 7h antes, o sea ya en el pasado.
        settings.store_closes_at = _naive_utc(body.closes_at)
    elif body.minutes is not None and body.minutes > 0:
        settings.store_closes_at = now + timedelta(minutes=body.minutes)
    else:
        settings.store_closes_at = None   # a mano
    settings.updated_at = now
    session.add(settings)

    session.add(ShopperStoreSession(
        tenant_id=tenant_id,
        store_session_id=settings.store_session_id,
        store_name=settings.store_name,
        banner_url=settings.store_banner_url,
        opened_at=now,
        closes_at=settings.store_closes_at,
    ))

    await session.commit()
    await session.refresh(settings)
    return settings


@router.post("/store/close", response_model=ShopperCatalogSettingsRead)
async def close_store(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Cierra la venta: se congela. No toca las reservas ya hechas (quedan firmes);
    los ítems en vivo dejan de aceptar reservas por _listing_open. Sella la sesión
    del histórico con la hora real de cierre."""
    settings = await _get_or_create_settings(tenant_id, session)
    now = _now()
    settings.store_status = "closed"
    settings.updated_at = now
    session.add(settings)
    await _close_open_sessions(tenant_id, session, now)
    await session.commit()
    await session.refresh(settings)
    return settings


async def _close_open_sessions(tenant_id: uuid.UUID, session: AsyncSession, now: datetime) -> None:
    """Sella toda sesión sin closed_at. Es un barrido y no un update puntual porque el
    reloj puede vencer sin que nadie toque "cerrar" (el dueño cierra la app y se va):
    la próxima apertura o cierre encuentra la huérfana y la sella igual. Sin commit —
    corre dentro del tx del caller."""
    rows = (await session.execute(
        select(ShopperStoreSession).where(
            ShopperStoreSession.tenant_id == tenant_id,
            ShopperStoreSession.closed_at == None,
            ShopperStoreSession.is_active == True,
        )
    )).scalars().all()
    for s in rows:
        # Si el reloj ya había vencido, la venta murió a esa hora, no cuando el dueño
        # finalmente abrió la app. Mentir acá inflaría la duración del histórico.
        s.closed_at = min(now, s.closes_at) if s.closes_at and s.closes_at < now else now
        s.updated_at = now
        session.add(s)


# ── Config PRIVADA de la calculadora (nunca pública) ──────────────────────────

@router.get("/calc-settings", response_model=ShopperCalcSettingsRead)
async def get_calc_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create_calc_settings(tenant_id, session)


@router.patch("/calc-settings", response_model=ShopperCalcSettingsRead)
async def update_calc_settings(
    body: ShopperCalcSettingsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # Un campo vacío llega como 0 desde el front. Con exchange_rate=0 la calculadora
    # devuelve costo 0, cada producto nuevo se publica con costo real 0 y el reporte
    # cuenta el precio entero como ganancia — sin que nada avise.
    data = body.model_dump(exclude_unset=True)
    if data.get("exchange_rate") is not None and data["exchange_rate"] <= 0:
        raise HTTPException(status_code=400, detail="El tipo de cambio tiene que ser mayor que cero.")
    if data.get("tax_rate") is not None and not (0 <= data["tax_rate"] <= 100):
        raise HTTPException(status_code=400, detail="El impuesto va entre 0 y 100.")
    if data.get("default_markup_pct") is not None and data["default_markup_pct"] < 0:
        raise HTTPException(status_code=400, detail="La ganancia no puede ser negativa.")

    calc = await _get_or_create_calc_settings(tenant_id, session)
    _decimal_fields = {
        "exchange_rate", "tax_rate", "default_markup_pct", "suitcase_cost_usd",
        "suitcase_capacity_lbs", "box_cost_usd", "box_length_in", "box_width_in", "box_height_in",
    }
    for field, value in data.items():
        if field in _decimal_fields and value is not None:
            setattr(calc, field, Decimal(str(value)))
        else:
            setattr(calc, field, value)
    calc.updated_at = _now()
    session.add(calc)
    await session.commit()
    await session.refresh(calc)
    return calc


# ── Catálogo autenticado ───────────────────────────────────────────────────────

@router.get("/", response_model=list[ShopperCatalogItemRead])
async def list_catalog(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # El barrido de vencidas sólo corría cuando un cliente abría el catálogo público:
    # terminada la venta, el stock de las reservas que expiraron quedaba comprometido
    # para siempre y el producto se veía agotado sin estarlo. Abrir el módulo es el
    # otro momento natural para reconciliar.
    await _expire_tenant_pending_reservations(tenant_id, session)
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        ).order_by(ShopperCatalogItem.created_at.desc())
    )
    return [_item_read(i) for i in result.scalars().all()]


def _apply_calc_snapshot(item: ShopperCatalogItem, calc) -> None:
    """Congela el snapshot de la calculadora en el ítem (auditable)."""
    if calc is None:
        return
    item.calc_mode = calc.calc_mode
    item.calc_weight_lbs = Decimal(str(calc.weight_lbs)) if calc.weight_lbs is not None else None
    item.calc_volume_in3 = Decimal(str(calc.volume_in3)) if calc.volume_in3 is not None else None
    item.calc_cost_per_lb = Decimal(str(calc.cost_per_lb)) if calc.cost_per_lb is not None else None
    item.calc_cost_per_in3 = Decimal(str(calc.cost_per_in3)) if calc.cost_per_in3 is not None else None
    item.calc_tax_rate = Decimal(str(calc.tax_rate)) if calc.tax_rate is not None else None
    item.calc_exchange_rate = Decimal(str(calc.exchange_rate)) if calc.exchange_rate is not None else None
    item.calc_shipping_usd = Decimal(str(calc.shipping_usd)) if calc.shipping_usd is not None else None
    item.calc_tax_usd = Decimal(str(calc.tax_usd)) if calc.tax_usd is not None else None
    item.calc_total_cost_gtq = Decimal(str(calc.total_cost_gtq)) if calc.total_cost_gtq is not None else None


@router.post("/", response_model=ShopperCatalogItemRead, status_code=status.HTTP_201_CREATED)
async def create_catalog_item(
    body: ShopperCatalogItemCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="El título es requerido.")

    now = _now()
    listing = body.listing if body.listing in ("live", "catalog") else "catalog"
    store_session_id = None
    expires_at = _naive_utc(body.expires_at)
    is_published = body.is_published
    published_at = now if body.is_published else None

    # Publicar en vivo exige la tienda abierta; el ítem se publica ya, se sella a la
    # sesión actual y muere con la venta (expires_at = cierre de la venta).
    if listing == "live":
        settings = await _get_or_create_settings(tenant_id, session)
        if not _effective_store_live(settings, now):
            raise HTTPException(status_code=409, detail="Abrí la tienda antes de publicar en vivo.")
        store_session_id = settings.store_session_id
        is_published = True
        published_at = now
        expires_at = settings.store_closes_at

    item = ShopperCatalogItem(
        tenant_id=tenant_id,
        source=body.source,
        title=body.title.strip(),
        hook=body.hook.strip() if body.hook else None,
        description=body.description,
        category=body.category.strip() if body.category else None,
        price_gtq=Decimal(str(body.price_gtq)) if body.price_gtq is not None else None,
        price_usd=Decimal(str(body.price_usd)) if body.price_usd is not None else None,
        is_offer=body.is_offer,
        compare_at_price_gtq=Decimal(str(body.compare_at_price_gtq)) if body.compare_at_price_gtq is not None else None,
        offer_ends_at=_naive_utc(body.offer_ends_at),
        is_made_to_order=body.is_made_to_order,
        stock_total=max(1, body.stock_total),
        listing=listing,
        store_session_id=store_session_id,
        expires_at=expires_at,
        is_published=is_published,
        published_at=published_at,
        amazon_url=body.amazon_url,
        amazon_asin=body.amazon_asin,
        image_url=body.image_url,
        notes=body.notes,
    )
    _apply_calc_snapshot(item, body.calc)
    # Costo a mano: la fuente cuando no hubo calculadora → alimenta margen y ganancias.
    # Si llegaran los dos, manda el snapshot (igual que en el PATCH): es el único que
    # trae el desglose que respalda el total, y pisarlo con un número suelto deja un
    # ítem donde flete + tax + producto no cuadran con su propio costo, o sea inauditable.
    if body.cost_gtq is not None and body.calc is None:
        item.calc_total_cost_gtq = Decimal(str(body.cost_gtq))
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.post("/from-trip/{trip_item_id}", response_model=ShopperCatalogItemRead,
             status_code=status.HTTP_201_CREATED)
async def publish_from_trip_item(
    trip_item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Publica un ítem capturado en un viaje como producto del catálogo."""
    result = await session.execute(
        select(ShopperTripItem).where(
            ShopperTripItem.id == trip_item_id,
            ShopperTripItem.tenant_id == tenant_id,
            ShopperTripItem.is_active == True,
        )
    )
    trip_item = result.scalar_one_or_none()
    if not trip_item:
        raise HTTPException(status_code=404, detail="Ítem del viaje no encontrado.")

    dup = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.trip_item_id == trip_item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    existing = dup.scalar_one_or_none()
    if existing:
        return _item_read(existing)

    item = ShopperCatalogItem(
        tenant_id=tenant_id,
        source="trip",
        trip_item_id=trip_item_id,
        title=trip_item.title,
        description=trip_item.description,
        price_gtq=trip_item.price_gtq,
        stock_total=max(1, trip_item.stock),
        is_made_to_order=False,   # lo capturado en el viaje ya está en la mano
        is_published=True,
        published_at=_now(),
        notes=trip_item.notes,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.patch("/{item_id}", response_model=ShopperCatalogItemRead)
async def update_catalog_item(
    item_id: uuid.UUID,
    body: ShopperCatalogItemUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    changes = body.model_dump(exclude_unset=True)
    calc = changes.pop("calc", None)
    if "cost_gtq" in changes:
        cost = changes.pop("cost_gtq")
        item.calc_total_cost_gtq = Decimal(str(cost)) if cost is not None else None
        # Un número suelto reemplaza al total, pero el desglose viejo seguía ahí: quedaba
        # un ítem cuyo producto + tax + flete no suman su propio costo. Si no viene un
        # snapshot que lo respalde, el costo pasa a ser un hecho sin derivación.
        if calc is None:
            item.calc_mode = "directo" if cost is not None else None
            item.calc_shipping_usd = item.calc_tax_usd = item.calc_tax_rate = None
            item.calc_weight_lbs = item.calc_volume_in3 = None
            item.calc_cost_per_lb = item.calc_cost_per_in3 = None
    was_published = item.is_published
    _decimal_fields = ("price_gtq", "price_usd", "compare_at_price_gtq")
    _dt_fields = ("expires_at", "offer_ends_at")
    for field, value in changes.items():
        if field in _decimal_fields and value is not None:
            setattr(item, field, Decimal(str(value)))
        elif field in _dt_fields:
            setattr(item, field, _naive_utc(value))
        else:
            setattr(item, field, value)

    if body.calc is not None:
        _apply_calc_snapshot(item, body.calc)

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
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    item.is_active = False
    item.updated_at = _now()
    session.add(item)
    await session.commit()


# ── Reservas — autenticado (dueño) ────────────────────────────────────────────

@router.get("/reservations", response_model=list[ShopperReservationRead])
async def list_reservations(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    await _expire_tenant_pending_reservations(tenant_id, session)
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        ).order_by(ShopperReservation.created_at.desc())
    )
    rows = result.all()
    resolved = {
        r.replaces_reservation_id for r, _ in rows
        if r.replaces_reservation_id and r.status != "cancelada"
    }
    return [_reservation_read(r, i, r.id in resolved) for r, i in rows]


@router.post("/reservations", response_model=ShopperReservationRead,
             status_code=status.HTTP_201_CREATED)
async def create_manual_sale(
    body: ShopperManualSaleCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """El dueño registra a mano una venta que llegó por otro medio. Difiere del apartado
    público en tres cosas: no exige la venta abierta (por eso existe — el cliente escribió
    al WhatsApp, no al catálogo), puede nacer en cualquier estado del flujo, y no manda
    push (el dueño ya sabe: lo está tecleando él). Sí respeta el stock: registrar 3 de un
    producto del que quedan 2 es la misma sobreventa, la teclee un cliente o el dueño."""
    if not body.client_name.strip() or not body.client_phone.strip():
        raise HTTPException(status_code=400, detail="Nombre y WhatsApp son requeridos.")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")
    if body.status not in STATUS_FLOW:
        raise HTTPException(status_code=400, detail="Estado inválido.")

    item = (await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == body.catalog_item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        ).with_for_update()
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    await _expire_pending_reservations(item, session, commit=False)

    now = _now()
    available = _max_qty(item)
    if available < body.quantity:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Solo quedan {available} unidad(es) de este producto."
                if available > 0 else "Este producto ya está agotado."
            ),
        )

    order_token, order_pin = await _resolve_order_token(tenant_id, body.client_phone, session)

    reservation = ShopperReservation(
        tenant_id=tenant_id,
        catalog_item_id=item.id,
        client_name=body.client_name.strip(),
        client_phone=body.client_phone.strip(),
        client_token=uuid.uuid4(),
        order_token=order_token,
        order_pin=order_pin,
        quantity=body.quantity,
        status=body.status,
        notes=body.notes,
        expires_at=now + timedelta(hours=RESERVATION_EXPIRY_HOURS),
    )
    # Una venta que nace ya avanzada necesita sus timestamps: sin esto "Cómo te fue"
    # la cuenta como entregada pero sin fecha de entrega.
    for st in STATUS_FLOW[1:STATUS_FLOW.index(body.status) + 1]:
        setattr(reservation, STATUS_TS_FIELD[st], now)
    session.add(reservation)

    # Espeja _apply_stock_transition: entregada vive en stock_sold, no en stock_reserved.
    # Sumar siempre a reserved dejaría lo ya entregado apartado para siempre — el producto
    # jamás se libera y _physical_available lo da por agotado de por vida.
    if body.status == "entregada":
        item.stock_sold = item.stock_sold + body.quantity
    else:
        item.stock_reserved = item.stock_reserved + body.quantity
    item.last_reserved_at = now
    item.updated_at = now
    session.add(item)

    await session.commit()
    await session.refresh(reservation)
    return _reservation_read(reservation, item)


@router.patch("/reservations/{reservation_id}", response_model=ShopperReservationRead)
async def update_reservation(
    reservation_id: uuid.UUID,
    body: ShopperReservationUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Dueño mueve la reserva por la máquina de estados (impone VALID_TRANSITIONS,
    ajusta stock, sella/limpia timestamps). `no_disponible` acepta resolution + sugerido."""
    res_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    # FOR UPDATE: el PATCH del dueño (entregar/cancelar) mueve stock reservado↔vendido
    # vía _apply_stock_transition; concurrente con un reserve público corrompería el
    # contador sin el lock. Barato (baja frecuencia) y consistente con el resto.
    item_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == reservation.catalog_item_id,
            ShopperCatalogItem.is_active == True,
        ).with_for_update()
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


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reservation(
    reservation_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Saca la línea de la bandeja del dueño. Soft-delete (`is_active=False`), que es
    borrado de verdad para todo lo que mira: /stats, "Cómo te fue" y el pedido del
    cliente filtran por activas, así que la línea también sale de los indicadores —
    ese es el punto de limpiar la bandeja.

    Devuelve al inventario lo que la línea tenía tomado: `stock_reserved` si seguía en
    vuelo, `stock_sold` si ya se había entregado. Dejar el contador puesto sin una
    reserva viva que lo explique es la trampa del producto invendible — nada vuelve a
    barrerlo nunca. Es la misma cuenta que hace `_apply_stock_transition` al sacar una
    línea del flujo, sólo que acá la línea desaparece en vez de quedar cancelada.
    """
    reservation = (await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        )
    )).scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    # FOR UPDATE por lo mismo que el PATCH: liberar stock concurrente con un reserve
    # público corrompe el contador.
    item = (await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == reservation.catalog_item_id,
        ).with_for_update()
    )).scalar_one_or_none()

    now = _now()
    if item:
        if reservation.status == "entregada":
            item.stock_sold = max(0, item.stock_sold - reservation.quantity)
        elif reservation.status in IN_FLIGHT_STATUSES:
            item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
        item.updated_at = now
        session.add(item)

    reservation.is_active = False
    reservation.updated_at = now
    session.add(reservation)

    # Si era la última línea viva del pedido, el cupón nunca se otorgó: hay que soltarlo.
    # Si no, el canje queda contado contra `max_redemptions` sin una venta que lo respalde
    # y un cupón de un solo uso queda quemado para siempre.
    if reservation.order_token:
        still_alive = (await session.execute(
            select(ShopperReservation.id).where(
                ShopperReservation.order_token == reservation.order_token,
                ShopperReservation.tenant_id == tenant_id,
                ShopperReservation.id != reservation.id,
                ShopperReservation.is_active == True,
            ).limit(1)
        )).first()
        if still_alive is None:
            red_row = (await session.execute(
                select(ShopperCouponRedemption).where(
                    ShopperCouponRedemption.order_token == reservation.order_token,
                    ShopperCouponRedemption.tenant_id == tenant_id,
                    ShopperCouponRedemption.status == "held",
                )
            )).scalar_one_or_none()
            if red_row is not None:
                red_row.status = "released"
                red_row.released_at = now
                red_row.updated_at = now
                session.add(red_row)
                coupon = await session.get(ShopperCoupon, red_row.coupon_id)
                if coupon is not None:
                    coupon.redeemed_count = max(0, coupon.redeemed_count - 1)
                    coupon.updated_at = now
                    session.add(coupon)

    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/reservations/{reservation_id}/suggestions", response_model=list[ShopperCatalogItemRead])
async def reservation_suggestions(
    reservation_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    res_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    item = await session.get(ShopperCatalogItem, reservation.catalog_item_id)
    if not item:
        return []
    sims = await _similar_items(tenant_id, item, session, limit=6)
    return [_item_read(s) for s in sims]


@router.post("/reservations/{reservation_id}/mark-notified", response_model=ShopperReservationRead)
async def mark_reservation_notified(
    reservation_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    res_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
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
    item = await session.get(ShopperCatalogItem, reservation.catalog_item_id)
    resolved = await _has_active_substitute(reservation.id, session)
    return _reservation_read(reservation, item, resolved)


# ── Endpoints públicos ─────────────────────────────────────────────────────────

def _pay_info(settings: ShopperCatalogSettings) -> ShopperPayInfo | None:
    if not (settings.bank_name or settings.bank_account_number):
        return None
    return ShopperPayInfo(
        bank_name=settings.bank_name,
        bank_account_holder=settings.bank_account_holder,
        bank_account_number=settings.bank_account_number,
        bank_account_type=settings.bank_account_type,
    )


def _public_item(
    i: ShopperCatalogItem, bought_with: list[uuid.UUID] | None = None,
    *, closed: bool = False,
) -> PublicShopperCatalogItem:
    offer_live = bool(i.is_offer and (i.offer_ends_at is None or i.offer_ends_at > _now()))
    # Escasez honesta: número real sólo cuando el shopper trae unidades en mano.
    remaining = None if i.is_made_to_order else _physical_available(i)
    sold_out = (not i.is_made_to_order) and _physical_available(i) <= 0
    return PublicShopperCatalogItem(
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
        remaining=remaining,
        closed=bool(closed or sold_out),
        listing=i.listing,
        expires_at=i.expires_at if i.listing == "catalog" else None,
        image_url=i.image_url,
        last_reserved_at=i.last_reserved_at,
        bought_with=bought_with or [],
    )


async def _cooccurrence_map(
    tenant_id: uuid.UUID, in_stock_ids: set[uuid.UUID], session: AsyncSession,
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """'Se llevan juntos' — recomendador por co-ocurrencia real (order_token), sin IA."""
    if len(in_stock_ids) < 2:
        return {}
    rows = await session.execute(
        select(ShopperReservation.order_token, ShopperReservation.catalog_item_id)
        .where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.order_token.is_not(None),
            ShopperReservation.status.in_(ACTIVE_STATUSES),
        )
    )
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


@router.get("/public/{public_token}", response_model=PublicShopperCatalog)
@limiter.limit("60/minute")
async def get_public_catalog(
    request: Request,
    response: Response,
    public_token: uuid.UUID,
    v: str | None = Query(default=None),   # solo cache-key (content-addressing); ignorado en la lógica
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    # Content-addressed: con ?v la URL es inmutable-por-estado (cualquier cambio rota
    # v ⇒ otra URL) → el edge puede cachearla agresivo sin servir nada viejo. Sin ?v
    # (primer paint) se mantiene fresco.
    if v:
        response.headers["Cache-Control"] = "public, max-age=15, s-maxage=60"
    else:
        response.headers["Cache-Control"] = "public, max-age=0, s-maxage=5, stale-while-revalidate=5"
    response.headers["X-Content-Type-Options"] = "nosniff"

    # Antes de leer stock: soltar lo que vencieron. Libera `taken` ⇒ rota `_pulse_stamp`
    # solo ⇒ los demás clientes refrescan sin ayuda.
    await _expire_tenant_pending_reservations(settings.tenant_id, session)

    now = _now()
    items_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        ).order_by(ShopperCatalogItem.published_at.desc())
    )
    all_items = items_result.scalars().all()
    # Los ítems 'live' sólo pertenecen a la venta de la sesión ACTUAL: al abrir una
    # venta nueva, los de ventas viejas desaparecen del público (no reviven).
    items = [
        i for i in all_items
        if i.listing == "catalog" or i.store_session_id == settings.store_session_id
    ]
    # Cuando hay venta viva, va primero; dentro de cada grupo, lo más nuevo arriba.
    items.sort(key=lambda i: (
        0 if (i.listing == "live" and _listing_open(i, settings, now)) else 1,
        -(i.published_at or i.created_at).timestamp(),
    ))

    tenant = await session.get(Tenant, settings.tenant_id)
    categories = sorted({i.category for i in items if i.category})
    in_stock_ids = {i.id for i in items if _reservable(i, settings, now)}
    cooc = await _cooccurrence_map(settings.tenant_id, in_stock_ids, session)

    momentum = await session.execute(
        select(
            func.count(distinct(ShopperReservation.order_token)),
            func.coalesce(func.sum(ShopperReservation.quantity), 0),
        ).where(
            ShopperReservation.tenant_id == settings.tenant_id,
            ShopperReservation.is_active == True,
            ShopperReservation.status.in_(IN_FLIGHT_STATUSES),
        )
    )
    reserved_people, reserved_units = momentum.one()

    return PublicShopperCatalog(
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
        store_status="live" if _effective_store_live(settings, now) else "closed",
        store_name=settings.store_name,
        store_closes_at=settings.store_closes_at,
        # Sólo con la venta viva: una foto de Target colgada bajo un catálogo cerrado
        # promete una venta que no está pasando.
        store_banner_url=settings.store_banner_url if _effective_store_live(settings, now) else None,
        categories=categories,
        reserved_people=int(reserved_people or 0),
        reserved_units=int(reserved_units or 0),
        pay_info=_pay_info(settings),
        items=[
            _public_item(i, cooc.get(i.id), closed=not _listing_open(i, settings, now))
            for i in items
        ],
        v=_pulse_stamp(all_items, settings, now),
    )


@router.get("/public/{public_token}/pulse", response_model=PublicShopperPulse)
@limiter.limit("120/minute")
async def get_public_pulse(
    request: Request,
    response: Response,
    public_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Latido barato: el cliente lo pollea seguido y solo trae el catálogo completo
    cuando `v` cambia. TTL diminuto en el edge + micro-cache por worker absorben la
    manada de polls; el origin ve ~1 query cada 3s por token."""
    response.headers["Cache-Control"] = "public, max-age=2, s-maxage=3, stale-while-revalidate=3"
    response.headers["X-Content-Type-Options"] = "nosniff"

    cached = _pulse_cache_get(public_token)
    if cached is not None:
        return cached

    result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    now = _now()
    items_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        )
    )
    items = items_result.scalars().all()
    payload = PublicShopperPulse(
        v=_pulse_stamp(items, settings, now),
        live=_effective_store_live(settings, now),
        closes_at=settings.store_closes_at,
    )
    _pulse_cache_set(public_token, payload)
    return payload


@router.get(
    "/public/{public_token}/item/{item_id}/availability",
    response_model=PublicShopperItemAvailability,
)
@limiter.limit("120/minute")
async def get_public_item_availability(
    request: Request,
    response: Response,
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """¿Todavía queda? Lo consulta el cliente que tiene abierto el sheet de reserva.

    El catálogo completo trae las fotos embebidas (cientos de KB); preguntar por un solo
    ítem cuesta unos bytes, así que el sheet puede mantenerse al día sin castigar el
    teléfono de nadie. No reemplaza al POST de reserva: la carrera real la resuelve el
    FOR UPDATE de `create_reservation`. Esto sólo evita que el cliente escriba su nombre
    y su teléfono para chocar contra un "ya no queda".
    """
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"

    settings = (await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )).scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    item = (await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        )
    )).scalar_one_or_none()
    # Despublicado o borrado mientras el sheet estaba abierto: para el cliente es lo
    # mismo que agotado, y decirlo así evita un 404 que la pantalla no sabría explicar.
    if not item:
        return PublicShopperItemAvailability(id=item_id, remaining=0, closed=True)

    pub = _public_item(item, closed=not _listing_open(item, settings, _now()))
    return PublicShopperItemAvailability(
        id=item.id, remaining=pub.remaining, closed=pub.closed,
        stock_available=pub.stock_available,
    )


@router.post(
    "/public/{public_token}/reserve/{item_id}",
    response_model=PublicShopperReservationRead,
    status_code=status.HTTP_201_CREATED,
)
# 30/min por-IP: bajo CGNAT (Tigo/Claro) muchos clientes distintos comparten IP en un
# venta → 10/min ahogaba compradores reales. Con el lock atómico de stock (FOR UPDATE) el
# rate-limit ya NO es el backstop de sobreventa, sólo anti-DoS, así que aflojarlo es seguro.
@limiter.limit("30/minute")
async def create_reservation(
    request: Request,
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    body: ShopperReservationCreate,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente aparta un producto sin login. Acumula pedido + PIN."""
    if not body.client_name.strip() or not body.client_phone.strip():
        raise HTTPException(status_code=400, detail="Nombre y teléfono son requeridos.")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")

    settings_result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    # FOR UPDATE: serializa las reservas del MISMO ítem. Sin el lock, dos clientes
    # leen stock_reserved viejo, ambos pasan el chequeo y sobrevenden la última unidad
    # (la escritura ORM es de valor absoluto → last-writer-wins). El lock convierte el
    # read-modify-write en seguro; el segundo requester espera y relee el valor fresco.
    item_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        ).with_for_update()
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    # commit=False → no soltar el lock hasta reservar en el mismo tx.
    await _expire_pending_reservations(item, session, commit=False)

    now = _now()
    # Venta cerrada / catálogo vencido → ya no se aparta (mensaje genérico, no filtra por qué).
    # detail estructurado: el cliente lee `remaining` para voltear la card a AGOTADO en vivo.
    if not _listing_open(item, settings, now):
        raise HTTPException(status_code=409, detail={
            "code": "closed",
            "message": "Este producto ya no está disponible.",
            "remaining": 0,
        })

    available = _max_qty(item)
    if available < body.quantity:
        raise HTTPException(status_code=409, detail={
            "code": "sold_out" if available <= 0 else "insufficient_stock",
            "message": (
                "¡Se agotó! Mirá productos similares."
                if available <= 0
                else f"Solo quedan {available} unidad(es)."
            ),
            "remaining": available,
        })

    order_token, order_pin = await _resolve_order_token(
        settings.tenant_id, body.client_phone, session, body.order_token
    )

    # Doble toque sobre el mismo producto → sumamos a la reserva que ya existe en vez de
    # abrir otra línea. Corre bajo el FOR UPDATE del ítem, así que está serializado por
    # producto. El stock ya se validó arriba contra la cantidad de ESTE toque.
    recent = await session.scalar(
        select(ShopperReservation)
        .where(
            ShopperReservation.order_token == order_token,
            ShopperReservation.catalog_item_id == item_id,
            ShopperReservation.status == "pendiente",
            ShopperReservation.is_active == True,
            ShopperReservation.created_at >= now - timedelta(seconds=DOUBLE_TAP_WINDOW_SECONDS),
        )
        .order_by(ShopperReservation.created_at.desc())
        .limit(1)
    )
    if recent is not None:
        recent.quantity = recent.quantity + body.quantity
        recent.updated_at = now
        session.add(recent)
        reservation = recent
    else:
        reservation = ShopperReservation(
            tenant_id=settings.tenant_id,
            catalog_item_id=item_id,
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

    # Sólo en la reserva nueva: no despertar al dueño dos veces por un doble toque.
    if recent is None:
        await send_push_to_tenant(
            session=session,
            tenant_id=settings.tenant_id,
            title="🛍️ Nueva reserva",
            body=f"{reservation.client_name} apartó {item.title}",
            data={"module": "personal-shopper", "view": "catalog", "reservation_id": str(reservation.id)},
        )

    return PublicShopperReservationRead(
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


async def _build_order(order_token: uuid.UUID, session: AsyncSession) -> PublicShopperOrder | None:
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.order_token == order_token,
            ShopperReservation.is_active == True,
        ).order_by(ShopperReservation.created_at.desc())
    )
    rows = result.all()
    if not rows:
        return None

    tenant_id = rows[0][0].tenant_id
    settings_result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.tenant_id == tenant_id,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()

    now = _now()
    # Expiración lazy set-based y atómica: este es el camino MÁS caliente (get_client_order
    # se pollea y corre tras cada mutación). El loop viejo restaba stock_reserved en Python
    # por fila → dos _build_order concurrentes sobre el mismo pedido restaban DOS veces la
    # misma expiración → contador hundido → falsa disponibilidad → sobreventa por otra puerta.
    # Acá el UPDATE de la reserva es el árbitro: sólo una tx la saca de 'pendiente', así que
    # sólo esa cuenta su cantidad. Si otra ya la canceló, matchea 0 filas y resta 0.
    expired_pairs = [
        (r, i) for r, i in rows
        if r.status == "pendiente" and r.expires_at <= now
    ]
    if expired_pairs:
        await session.execute(
            text("""
                WITH victims AS (
                    SELECT r.id
                      FROM shopper_reservations r
                      JOIN shopper_catalog_items i ON i.id = r.catalog_item_id
                     WHERE r.order_token=:ot AND r.status='pendiente'
                       AND r.expires_at<=:now AND r.is_active=true
                     ORDER BY r.catalog_item_id
                       FOR UPDATE OF i SKIP LOCKED
                ), expired AS (
                    UPDATE shopper_reservations
                       SET status='cancelada', resolution='expiro',
                           cancelada_at=:now, updated_at=:now
                     WHERE id IN (SELECT id FROM victims) AND status='pendiente'
                    RETURNING catalog_item_id, quantity
                ), agg AS (
                    SELECT catalog_item_id, SUM(quantity) AS q
                      FROM expired GROUP BY catalog_item_id
                )
                UPDATE shopper_catalog_items i
                   SET stock_reserved=GREATEST(0, i.stock_reserved - agg.q),
                       updated_at=:now
                  FROM agg WHERE i.id=agg.catalog_item_id
            """),
            {"now": now, "ot": order_token},
        )
        await session.commit()
        # El stock lo maneja el SQL (race-free); acá sólo reflejamos en memoria para el
        # render de las líneas (expire_on_commit=False → los objetos conservan su valor).
        for r, _ in expired_pairs:
            r.status = "cancelada"
            r.resolution = "expiro"
            r.cancelada_at = now
            r.updated_at = now

    tenant = await session.get(Tenant, tenant_id)
    order_item_ids = {i.id for _, i in rows}
    resolved_ids = {
        r.replaces_reservation_id for r, _ in rows
        if r.replaces_reservation_id and r.status != "cancelada"
    }

    lines: list[PublicShopperOrderLine] = []
    for r, i in rows:
        suggestions: list[PublicShopperCatalogItem] = []
        if r.status == "no_disponible" and r.id not in resolved_ids:
            seen: set[uuid.UUID] = set(order_item_ids)
            if r.suggested_item_id:
                pinned = await session.get(ShopperCatalogItem, r.suggested_item_id)
                if pinned and pinned.is_published and pinned.is_active and _is_available(pinned):
                    suggestions.append(_public_item(pinned))
                    seen.add(pinned.id)
            for s in await _similar_items(tenant_id, i, session, limit=4, exclude_ids=seen):
                if len(suggestions) >= 4:
                    break
                suggestions.append(_public_item(s))
        lines.append(PublicShopperOrderLine(
            id=r.id,
            item_id=i.id,
            item_title=i.title,
            item_image_url=i.image_url,
            item_price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
            quantity=r.quantity,
            status=r.status,
            editable=(r.status == "pendiente" and r.expires_at > now),
            stock_available=_max_qty(i, r.quantity),
            is_made_to_order=i.is_made_to_order,
            expires_at=r.expires_at,
            created_at=r.created_at,
            resolution=r.resolution,
            resolution_note=r.resolution_note,
            suggested_items=suggestions,
            resolved_by_substitute=(r.id in resolved_ids),
        ))
    # "Total a pagar" es lo que todavía está en vuelo. Sumar las entregadas convertía
    # el pedido en un acumulado eterno: quien ya te pagó Q1,000 y volvía a apartar
    # Q100 leía "Total a pagar Q1,100" — y el cupón se calculaba sobre ese monto.
    active = [l for l in lines if l.status in IN_FLIGHT_STATUSES]
    subtotal = sum((l.item_price_gtq or 0) * l.quantity for l in active)

    # Cupón del pedido: se recomputa en vivo sobre el subtotal actual (el snapshot
    # guardado es solo auditoría). Si el cupón dejó de valer, se libera en modo lazy.
    coupon_code = None
    coupon_discount = 0.0
    coupon_note = None
    coupon_expires_at = None
    red_row = (await session.execute(
        select(ShopperCouponRedemption, ShopperCoupon).join(
            ShopperCoupon, ShopperCouponRedemption.coupon_id == ShopperCoupon.id
        ).where(
            ShopperCouponRedemption.order_token == order_token,
            ShopperCouponRedemption.status == "held",
            ShopperCouponRedemption.tenant_id == tenant_id,
        )
    )).first()
    if red_row is not None:
        redemption, coupon = red_row
        active_pairs = [(i, r.quantity) for r, i in rows if r.status in IN_FLIGHT_STATUSES]
        assumed = await _assumed_cost_ratio(tenant_id, session)
        disc, note, hard_invalid = _evaluate_coupon(coupon, active_pairs, assumed, now)
        if hard_invalid:
            redemption.status = "released"
            redemption.released_at = now
            redemption.updated_at = now
            coupon.redeemed_count = max(0, coupon.redeemed_count - 1)
            coupon.updated_at = now
            session.add(redemption)
            session.add(coupon)
            await session.commit()
        else:
            # El snapshot del canje es lo que leen /stats y el histórico de ventas.
            # Como el descuento se recomputa en vivo pero el snapshot no se tocaba,
            # un pedido editado después de canjear le restaba al dueño un descuento
            # que nunca existió (o le inflaba la ganancia si el pedido creció).
            disc_q = Decimal(str(disc)).quantize(Decimal("0.01"))
            sub_q = Decimal(str(subtotal)).quantize(Decimal("0.01"))
            # …pero el recálculo corre sobre lo que sigue EN VUELO, y una entrega saca
            # la línea de ahí. Un pedido ya entregado no tiene nada en vuelo → disc 0 →
            # el snapshot se borraba solo la próxima vez que el cliente abría su link,
            # y la ganancia de esa venta saltaba como si nunca hubiera habido descuento.
            # Entregar sella el trato: desde la primera entrega el snapshot es histórico.
            delivered = any(r.status == "entregada" for r, _ in rows)
            if not delivered and (
                redemption.discount_gtq != disc_q or redemption.subtotal_gtq != sub_q
            ):
                redemption.discount_gtq = disc_q
                redemption.subtotal_gtq = sub_q
                redemption.updated_at = now
                session.add(redemption)
                await session.commit()
            coupon_code = coupon.code
            coupon_discount = float(disc)
            coupon_note = note
            coupon_expires_at = coupon.expires_at

    return PublicShopperOrder(
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
        subtotal_gtq=subtotal,
        total_gtq=subtotal - coupon_discount,
        total_items=sum(l.quantity for l in active),
        coupon_code=coupon_code,
        coupon_discount_gtq=coupon_discount,
        coupon_note=coupon_note,
        coupon_expires_at=coupon_expires_at,
    )


async def _load_editable_line(
    order_token: uuid.UUID, reservation_id: uuid.UUID, session: AsyncSession,
) -> tuple[ShopperReservation, ShopperCatalogItem]:
    # FOR UPDATE OF el ítem: subir la cantidad de una línea reclama stock igual que
    # reservar → sin el lock, sobrevende. Lo comparten update y delete (ambos mutan stock).
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.order_token == order_token,
            ShopperReservation.is_active == True,
        ).with_for_update(of=ShopperCatalogItem)
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


@router.get("/public/order/{order_token}", response_model=PublicShopperOrder)
@limiter.limit("60/minute")
async def get_client_order(
    request: Request,
    response: Response,
    order_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.post("/public/order/lookup", response_model=PublicShopperOrder)
@limiter.limit("10/minute")
async def lookup_order(
    request: Request,
    response: Response,
    body: ShopperOrderLookupBody,
    session: AsyncSession = Depends(get_session),
):
    """Público — recuperar el pedido con WhatsApp + PIN de 4 dígitos. Rate-limitado."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    digits = _phone_digits(body.phone)
    pin = body.pin.strip()
    if len(digits) < 8 or len(pin) != 4 or not pin.isdigit():
        raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")

    catalog = (await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == body.catalog_token,
            ShopperCatalogSettings.is_active == True,
        )
    )).scalar_one_or_none()
    if not catalog:
        raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")

    result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.tenant_id == catalog.tenant_id,
            ShopperReservation.order_pin == pin,
            ShopperReservation.is_active == True,
            ShopperReservation.order_token.is_not(None),
        ).order_by(ShopperReservation.created_at.desc())
    )
    for r in result.scalars().all():
        if _phone_digits(r.client_phone) == digits and r.order_token:
            order = await _build_order(r.order_token, session)
            if order is not None:
                return order
    raise HTTPException(status_code=404, detail="No encontramos un pedido con esos datos.")


@router.patch("/public/order/{order_token}/line/{reservation_id}", response_model=PublicShopperOrder)
@limiter.limit("30/minute")
async def update_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    body: PublicShopperOrderLineUpdate,
    session: AsyncSession = Depends(get_session),
):
    reservation, item = await _load_editable_line(order_token, reservation_id, session)
    new_qty = body.quantity
    if new_qty < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")
    # El cliente ve el tope como un botón que no responde; el mensaje es lo único que
    # le explica por qué. Que diga qué pasó, no cuánto hay en un inventario que no ve.
    max_qty = _max_qty(item, reservation.quantity)
    if new_qty > max_qty:
        raise HTTPException(status_code=409, detail=(
            "Ya tenés apartado todo lo que queda de este producto."
            if max_qty <= reservation.quantity
            else f"Solo quedan {max_qty} disponibles."
        ))

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


@router.delete("/public/order/{order_token}/line/{reservation_id}", response_model=PublicShopperOrder)
@limiter.limit("30/minute")
async def delete_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
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
             response_model=PublicShopperOrder)
@limiter.limit("20/minute")
async def swap_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    new_item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente acepta un reemplazo de una línea no_disponible."""
    row = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.order_token == order_token,
            ShopperReservation.is_active == True,
        )
    )
    original = row.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Producto no encontrado en tu pedido.")
    if original.status != "no_disponible":
        raise HTTPException(status_code=409, detail="Este producto no está disponible para cambio.")
    if await _has_active_substitute(original.id, session):
        raise HTTPException(status_code=409, detail="Ya cambiaste este producto por otro.")

    # FOR UPDATE: aceptar el reemplazo crea una reserva sobre new_item → reclama stock,
    # mismo riesgo de sobreventa que reservar. Lock + expiry sin commit en el mismo tx.
    new_item = (await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == new_item_id,
        ).with_for_update()
    )).scalar_one_or_none()
    if not new_item or new_item.tenant_id != original.tenant_id \
            or not new_item.is_published or not new_item.is_active:
        raise HTTPException(status_code=404, detail="Ese producto ya no está disponible.")

    await _expire_pending_reservations(new_item, session, commit=False)
    available = _max_qty(new_item)
    if available < 1:
        raise HTTPException(status_code=409, detail="Ese producto ya no tiene disponibilidad.")

    now = _now()
    qty = max(1, min(original.quantity, available))
    substitute = ShopperReservation(
        tenant_id=original.tenant_id,
        catalog_item_id=new_item.id,
        client_name=original.client_name,
        client_phone=original.client_phone,
        client_token=uuid.uuid4(),
        order_token=order_token,
        order_pin=original.order_pin,
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
        data={"module": "personal-shopper", "view": "catalog", "reservation_id": str(substitute.id)},
    )

    order = await _build_order(order_token, session)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return order


@router.post("/public/order/{order_token}/line/{reservation_id}/dismiss",
             response_model=PublicShopperOrder)
@limiter.limit("30/minute")
async def dismiss_order_line(
    request: Request,
    order_token: uuid.UUID,
    reservation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Público — el cliente oculta de su vista una línea cerrada (no_disponible/cancelada)."""
    row = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.order_token == order_token,
            ShopperReservation.is_active == True,
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
        return PublicShopperOrder(order_token=order_token, client_name=reservation.client_name, lines=[])
    return order


@router.get("/public/reservation/{client_token}", response_model=PublicShopperReservationRead)
@limiter.limit("60/minute")
async def get_client_reservation(
    request: Request,
    client_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem, ShopperCatalogSettings).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).join(
            ShopperCatalogSettings, ShopperCatalogSettings.tenant_id == ShopperReservation.tenant_id
        ).where(
            ShopperReservation.client_token == client_token,
            ShopperReservation.is_active == True,
            ShopperCatalogSettings.is_active == True,
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

    return PublicShopperReservationRead(
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


# ════════════════════════════════════════════════════════════════════════════════
# CUPONES DE DESCUENTO
# Dueño (get_current_tenant_id → RLS): CRUD. Público (get_session + filtro por tenant
# del pedido): preview / apply / remove. El descuento se recorta para nunca dejar el
# pedido bajo el costo (piso de margen). Errores públicos genéricos (anti-enumeración).
# ════════════════════════════════════════════════════════════════════════════════

# Base32 Crockford sin caracteres ambiguos (I, L, O, U) → tipeable a mano, no secuencial.
_COUPON_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_COUPON_GENERIC_ERR = "Este código no es válido o ya no está disponible."


def _normalize_code(raw: str | None) -> str:
    """Canónico: MAYÚSCULAS, solo alfanuméricos (descarta guiones/espacios de display)."""
    return "".join(c for c in (raw or "").upper() if c.isalnum())


def _gen_coupon_code(n: int = 8) -> str:
    return "".join(secrets.choice(_COUPON_ALPHABET) for _ in range(n))


def _fmt_q(d) -> str:
    v = float(d)
    return f"{v:,.0f}" if v == int(v) else f"{v:,.2f}"


async def _unique_coupon_code(tenant_id: uuid.UUID, session: AsyncSession, tries: int = 8) -> str:
    for _ in range(tries):
        code = _gen_coupon_code()
        exists = (await session.execute(
            select(ShopperCoupon.id).where(
                ShopperCoupon.tenant_id == tenant_id, ShopperCoupon.code == code
            )
        )).first()
        if not exists:
            return code
    return _gen_coupon_code(10)   # fallback: más largo → colisión despreciable


async def _assumed_cost_ratio(tenant_id: uuid.UUID, session: AsyncSession) -> Decimal:
    ratio = (await session.execute(
        select(ShopperCalcSettings.assumed_cost_ratio).where(
            ShopperCalcSettings.tenant_id == tenant_id,
            ShopperCalcSettings.is_active == True,
        )
    )).scalar_one_or_none()
    return Decimal(str(ratio)) if ratio is not None else Decimal("0.700")


async def _load_markup(tenant_id: uuid.UUID, session: AsyncSession) -> tuple[Decimal, Decimal]:
    calc = (await session.execute(
        select(ShopperCalcSettings).where(
            ShopperCalcSettings.tenant_id == tenant_id,
            ShopperCalcSettings.is_active == True,
        )
    )).scalar_one_or_none()
    markup = Decimal(str(calc.default_markup_pct)) if calc else Decimal("30")
    assumed = Decimal(str(calc.assumed_cost_ratio)) if calc else Decimal("0.700")
    return markup, assumed


def _coupon_hard_invalid(coupon: ShopperCoupon, now: datetime) -> bool:
    """Inválido 'duro' (no depende del pedido): desactivado / fuera de ventana. NO
    incluye agotado por max_redemptions — un canje ya 'held' consumió su slot y no
    debe liberarse por eso."""
    if not coupon.is_active:
        return True
    if coupon.starts_at is not None and coupon.starts_at > now:
        return True
    if coupon.expires_at is not None and coupon.expires_at <= now:
        return True
    return False


def _coupon_discount(coupon: ShopperCoupon, active_pairs, assumed_ratio: Decimal) -> tuple[Decimal, str | None]:
    """Descuento efectivo del cupón sobre las líneas activas (item, qty). Devuelve
    (descuento, nota). El descuento = min(bruto, tope Q, piso de margen)."""
    subtotal = sum((Decimal(str(i.price_gtq or 0)) * q) for i, q in active_pairs) or Decimal("0")
    if subtotal <= 0:
        return (Decimal("0.00"), None)
    if coupon.min_subtotal_gtq is not None and subtotal < Decimal(str(coupon.min_subtotal_gtq)):
        return (Decimal("0.00"), f"Aplica a pedidos desde Q{_fmt_q(coupon.min_subtotal_gtq)}")

    if coupon.discount_type == "fixed":
        raw = Decimal(str(coupon.amount_off_gtq or 0))
    else:
        raw = subtotal * (Decimal(str(coupon.percent_off or 0)) / Decimal("100"))
    discount = raw
    if coupon.max_discount_gtq is not None:
        discount = min(discount, Decimal(str(coupon.max_discount_gtq)))

    # Piso de margen: nunca dejar el total bajo costo*(1+min_margin_pct/100).
    order_cost = Decimal("0")
    for i, q in active_pairs:
        if i.calc_total_cost_gtq is not None:
            unit_cost = Decimal(str(i.calc_total_cost_gtq))
        else:
            unit_cost = Decimal(str(i.price_gtq or 0)) * assumed_ratio
        order_cost += unit_cost * q
    floor_cap = subtotal - order_cost * (Decimal("1") + Decimal(str(coupon.min_margin_pct or 0)) / Decimal("100"))
    if floor_cap < discount:
        discount = floor_cap

    if discount < 0:
        discount = Decimal("0")
    if discount > subtotal:
        discount = subtotal
    return (discount.quantize(Decimal("0.01")), None)


def _evaluate_coupon(coupon: ShopperCoupon, active_pairs, assumed_ratio: Decimal, now: datetime):
    """(descuento, nota, hard_invalid). Compartido por preview, apply y _build_order."""
    if _coupon_hard_invalid(coupon, now):
        return (Decimal("0.00"), None, True)
    disc, note = _coupon_discount(coupon, active_pairs, assumed_ratio)
    return (disc, note, False)


def _coupon_below_cost_risk(coupon: ShopperCoupon, markup_pct: Decimal, assumed_ratio: Decimal) -> bool:
    """Advisory para el dueño: ¿el % supera el punto de equilibrio de un ítem de markup
    típico? El piso de margen igual protege en runtime; esto solo avisa al crear."""
    if coupon.discount_type == "percent" and coupon.percent_off is not None:
        m = Decimal(str(markup_pct or 0))
        if m <= 0:
            return float(coupon.percent_off) > 0
        d_be = m / (Decimal("1") + m / Decimal("100"))   # % descuento que anula el margen
        return Decimal(str(coupon.percent_off)) > d_be
    return False


def _coupon_read(c: ShopperCoupon, could_go_below_cost: bool = False) -> ShopperCouponRead:
    return ShopperCouponRead(
        id=c.id,
        code=c.code,
        discount_type=c.discount_type,
        percent_off=float(c.percent_off) if c.percent_off is not None else None,
        amount_off_gtq=float(c.amount_off_gtq) if c.amount_off_gtq is not None else None,
        max_discount_gtq=float(c.max_discount_gtq) if c.max_discount_gtq is not None else None,
        min_subtotal_gtq=float(c.min_subtotal_gtq) if c.min_subtotal_gtq is not None else None,
        min_margin_pct=float(c.min_margin_pct or 0),
        max_redemptions=c.max_redemptions,
        per_customer_limit=c.per_customer_limit,
        redeemed_count=c.redeemed_count,
        starts_at=c.starts_at,
        expires_at=c.expires_at,
        label=c.label,
        is_active=c.is_active,
        created_at=c.created_at,
        could_go_below_cost=could_go_below_cost,
    )


async def _order_active_rows(order_token: uuid.UUID, session: AsyncSession):
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.order_token == order_token,
            ShopperReservation.is_active == True,
        )
    )
    return result.all()


def _validate_discount_fields(discount_type: str, percent_off, amount_off) -> None:
    if discount_type == "percent":
        if percent_off is None or not (0 < float(percent_off) <= 100):
            raise HTTPException(status_code=400, detail="El porcentaje debe estar entre 1 y 100.")
    else:
        if amount_off is None or float(amount_off) <= 0:
            raise HTTPException(status_code=400, detail="El monto de descuento debe ser mayor a 0.")


# ── Dueño ───────────────────────────────────────────────────────────────────────
@router.post("/coupons", response_model=ShopperCouponRead, status_code=status.HTTP_201_CREATED)
async def create_coupon(
    body: ShopperCouponInput,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    dtype = body.discount_type if body.discount_type in ("percent", "fixed") else "percent"
    _validate_discount_fields(dtype, body.percent_off, body.amount_off_gtq)

    if body.code:
        code = _normalize_code(body.code)
        if not (3 <= len(code) <= 24):
            raise HTTPException(status_code=400, detail="El código debe tener entre 3 y 24 caracteres.")
        exists = (await session.execute(
            select(ShopperCoupon.id).where(
                ShopperCoupon.tenant_id == tenant_id, ShopperCoupon.code == code
            )
        )).first()
        if exists:
            raise HTTPException(status_code=409, detail="Ese código ya existe, probá otro.")
    else:
        code = await _unique_coupon_code(tenant_id, session)

    coupon = ShopperCoupon(
        tenant_id=tenant_id,
        code=code,
        discount_type=dtype,
        percent_off=Decimal(str(body.percent_off)) if dtype == "percent" else None,
        amount_off_gtq=Decimal(str(body.amount_off_gtq)) if dtype == "fixed" else None,
        max_discount_gtq=Decimal(str(body.max_discount_gtq)) if body.max_discount_gtq is not None else None,
        min_subtotal_gtq=Decimal(str(body.min_subtotal_gtq)) if body.min_subtotal_gtq is not None else None,
        min_margin_pct=Decimal(str(body.min_margin_pct or 0)),
        max_redemptions=body.max_redemptions,
        per_customer_limit=max(1, body.per_customer_limit or 1),
        starts_at=_naive_utc(body.starts_at),
        expires_at=_naive_utc(body.expires_at),
        label=body.label,
    )
    session.add(coupon)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Ese código ya existe, probá otro.")
    await session.refresh(coupon)

    markup, assumed = await _load_markup(tenant_id, session)
    return _coupon_read(coupon, _coupon_below_cost_risk(coupon, markup, assumed))


@router.get("/coupons", response_model=list[ShopperCouponRead])
async def list_coupons(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    markup, assumed = await _load_markup(tenant_id, session)
    result = await session.execute(
        select(ShopperCoupon).where(ShopperCoupon.tenant_id == tenant_id)
        .order_by(ShopperCoupon.created_at.desc())
    )
    return [_coupon_read(c, _coupon_below_cost_risk(c, markup, assumed)) for c in result.scalars().all()]


@router.patch("/coupons/{coupon_id}", response_model=ShopperCouponRead)
async def update_coupon(
    coupon_id: uuid.UUID,
    body: ShopperCouponInput,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    coupon = (await session.execute(
        select(ShopperCoupon).where(
            ShopperCoupon.id == coupon_id, ShopperCoupon.tenant_id == tenant_id
        )
    )).scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupón no encontrado.")

    data = body.model_dump(exclude_unset=True)
    if data.get("discount_type") in ("percent", "fixed"):
        coupon.discount_type = data["discount_type"]
    if "percent_off" in data:
        coupon.percent_off = Decimal(str(data["percent_off"])) if data["percent_off"] is not None else None
    if "amount_off_gtq" in data:
        coupon.amount_off_gtq = Decimal(str(data["amount_off_gtq"])) if data["amount_off_gtq"] is not None else None
    _validate_discount_fields(coupon.discount_type, coupon.percent_off, coupon.amount_off_gtq)

    for f in ("max_discount_gtq", "min_subtotal_gtq"):
        if f in data:
            setattr(coupon, f, Decimal(str(data[f])) if data[f] is not None else None)
    if "min_margin_pct" in data:
        coupon.min_margin_pct = Decimal(str(data["min_margin_pct"] if data["min_margin_pct"] is not None else 0))
    if "max_redemptions" in data:
        coupon.max_redemptions = data["max_redemptions"]
    if "per_customer_limit" in data:
        coupon.per_customer_limit = max(1, data["per_customer_limit"] or 1)
    for f in ("starts_at", "expires_at"):
        if f in data:
            setattr(coupon, f, _naive_utc(data[f]))
    if "label" in data:
        coupon.label = data["label"]
    if data.get("code"):
        newcode = _normalize_code(data["code"])
        if newcode != coupon.code:
            if not (3 <= len(newcode) <= 24):
                raise HTTPException(status_code=400, detail="El código debe tener entre 3 y 24 caracteres.")
            clash = (await session.execute(
                select(ShopperCoupon.id).where(
                    ShopperCoupon.tenant_id == tenant_id, ShopperCoupon.code == newcode
                )
            )).first()
            if clash:
                raise HTTPException(status_code=409, detail="Ese código ya existe, probá otro.")
            coupon.code = newcode
    if data.get("is_active") is not None:
        coupon.is_active = data["is_active"]

    coupon.updated_at = _now()
    session.add(coupon)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Ese código ya existe, probá otro.")
    await session.refresh(coupon)

    markup, assumed = await _load_markup(tenant_id, session)
    return _coupon_read(coupon, _coupon_below_cost_risk(coupon, markup, assumed))


@router.delete("/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coupon(
    coupon_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    coupon = (await session.execute(
        select(ShopperCoupon).where(
            ShopperCoupon.id == coupon_id, ShopperCoupon.tenant_id == tenant_id
        )
    )).scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupón no encontrado.")
    used = (await session.execute(
        select(func.count()).select_from(ShopperCouponRedemption).where(
            ShopperCouponRedemption.coupon_id == coupon_id
        )
    )).scalar_one()
    if used > 0:
        raise HTTPException(
            status_code=409,
            detail="Este cupón ya tiene canjes; desactivalo en vez de eliminarlo.",
        )
    await session.delete(coupon)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/coupons/{coupon_id}/redemptions", response_model=list[CouponRedemptionRead])
async def coupon_redemptions(
    coupon_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    coupon = (await session.execute(
        select(ShopperCoupon.id).where(
            ShopperCoupon.id == coupon_id, ShopperCoupon.tenant_id == tenant_id
        )
    )).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupón no encontrado.")
    result = await session.execute(
        select(ShopperCouponRedemption).where(
            ShopperCouponRedemption.coupon_id == coupon_id,
            ShopperCouponRedemption.tenant_id == tenant_id,
        ).order_by(ShopperCouponRedemption.created_at.desc())
    )
    out: list[CouponRedemptionRead] = []
    for r in result.scalars().all():
        out.append(CouponRedemptionRead(
            id=r.id,
            order_token=r.order_token,
            client_phone=r.client_phone,
            status=r.status,
            discount_gtq=float(r.discount_gtq or 0),
            subtotal_gtq=float(r.subtotal_gtq or 0),
            created_at=r.created_at,
            released_at=r.released_at,
        ))
    return out


# ── Público (canje) ───────────────────────────────────────────────────────────
def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


@router.post("/public/order/{order_token}/coupon/preview", response_model=CouponPreview)
@limiter.limit("15/minute")
async def preview_coupon(
    request: Request,
    response: Response,
    order_token: uuid.UUID,
    body: CouponApplyBody,
    session: AsyncSession = Depends(get_session),
):
    _no_store(response)
    code = _normalize_code(body.code)
    rows = await _order_active_rows(order_token, session)
    if not rows:
        return CouponPreview(valid=False, reason=_COUPON_GENERIC_ERR)
    tenant_id = rows[0][0].tenant_id
    active_pairs = [(i, r.quantity) for r, i in rows if r.status in ACTIVE_STATUSES]
    subtotal = sum(float(i.price_gtq or 0) * q for i, q in active_pairs)
    now = _now()

    coupon = (await session.execute(
        select(ShopperCoupon).where(
            ShopperCoupon.tenant_id == tenant_id,
            ShopperCoupon.code == code,
            ShopperCoupon.is_active == True,
        )
    )).scalar_one_or_none()
    exhausted = coupon is not None and coupon.max_redemptions is not None and coupon.redeemed_count >= coupon.max_redemptions
    if coupon is None or _coupon_hard_invalid(coupon, now) or exhausted:
        return CouponPreview(valid=False, subtotal_gtq=subtotal, new_total_gtq=subtotal, reason=_COUPON_GENERIC_ERR)

    assumed = await _assumed_cost_ratio(tenant_id, session)
    disc, note = _coupon_discount(coupon, active_pairs, assumed)
    if disc <= 0:
        # note (mínimo) es la única excepción segura; el resto, genérico.
        return CouponPreview(
            valid=False, subtotal_gtq=subtotal, new_total_gtq=subtotal,
            coupon_code=coupon.code, coupon_expires_at=coupon.expires_at,
            reason=note or _COUPON_GENERIC_ERR,
        )
    return CouponPreview(
        valid=True, discount_gtq=float(disc), subtotal_gtq=subtotal,
        new_total_gtq=subtotal - float(disc),
        coupon_code=coupon.code, coupon_expires_at=coupon.expires_at,
    )


@router.post("/public/order/{order_token}/coupon", response_model=PublicShopperOrder)
@limiter.limit("10/minute")
async def apply_coupon(
    request: Request,
    response: Response,
    order_token: uuid.UUID,
    body: CouponApplyBody,
    session: AsyncSession = Depends(get_session),
):
    _no_store(response)
    code = _normalize_code(body.code)
    rows = await _order_active_rows(order_token, session)
    if not rows:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    tenant_id = rows[0][0].tenant_id
    client_phone = rows[0][0].client_phone
    phone_digits = _phone_digits(client_phone)
    active_pairs = [(i, r.quantity) for r, i in rows if r.status in ACTIVE_STATUSES]
    subtotal = sum((Decimal(str(i.price_gtq or 0)) * q) for i, q in active_pairs) or Decimal("0")
    now = _now()

    coupon = (await session.execute(
        select(ShopperCoupon).where(
            ShopperCoupon.tenant_id == tenant_id,
            ShopperCoupon.code == code,
            ShopperCoupon.is_active == True,
        )
    )).scalar_one_or_none()
    if coupon is None or _coupon_hard_invalid(coupon, now):
        raise HTTPException(status_code=400, detail=_COUPON_GENERIC_ERR)

    assumed = await _assumed_cost_ratio(tenant_id, session)
    disc, note = _coupon_discount(coupon, active_pairs, assumed)
    if disc <= 0:
        # Solo se consume un slot cuando genera descuento real. Mínimo → nota segura.
        raise HTTPException(status_code=400, detail=note or _COUPON_GENERIC_ERR)

    # ¿Ya hay un cupón 'held' en este pedido?
    existing = (await session.execute(
        select(ShopperCouponRedemption).where(
            ShopperCouponRedemption.order_token == order_token,
            ShopperCouponRedemption.status == "held",
        )
    )).scalar_one_or_none()
    if existing is not None:
        if existing.coupon_id == coupon.id:
            return await _build_order(order_token, session)   # idempotente
        old = await session.get(ShopperCoupon, existing.coupon_id)
        existing.status = "released"
        existing.released_at = now
        existing.updated_at = now
        session.add(existing)
        if old is not None:
            old.redeemed_count = max(0, old.redeemed_count - 1)
            old.updated_at = now
            session.add(old)
        await session.flush()

    # Guard atómico del cap global: toma el row-lock del cupón y serializa los apply.
    consumed = await session.execute(
        text("""
            UPDATE shopper_coupons
               SET redeemed_count = redeemed_count + 1, updated_at = now()
             WHERE id = :cid AND tenant_id = :tid AND is_active
               AND (starts_at  IS NULL OR starts_at  <= :now)
               AND (expires_at IS NULL OR expires_at >  :now)
               AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
            RETURNING id
        """),
        {"cid": str(coupon.id), "tid": str(tenant_id), "now": now},
    )
    if consumed.first() is None:
        await session.rollback()
        raise HTTPException(status_code=400, detail=_COUPON_GENERIC_ERR)

    # Bajo el lock: límite por cliente (race-free porque el UPDATE serializa).
    held_for_phone = (await session.execute(
        select(func.count()).select_from(ShopperCouponRedemption).where(
            ShopperCouponRedemption.coupon_id == coupon.id,
            ShopperCouponRedemption.client_phone_digits == phone_digits,
            ShopperCouponRedemption.status == "held",
        )
    )).scalar_one()
    if held_for_phone >= coupon.per_customer_limit:
        await session.rollback()
        raise HTTPException(status_code=400, detail=_COUPON_GENERIC_ERR)

    session.add(ShopperCouponRedemption(
        tenant_id=tenant_id,
        coupon_id=coupon.id,
        order_token=order_token,
        client_phone=client_phone,
        client_phone_digits=phone_digits,
        status="held",
        discount_gtq=disc,
        subtotal_gtq=subtotal,
    ))
    try:
        await session.commit()
    except IntegrityError:
        # Carrera de doble-submit: el UNIQUE(order_token) WHERE held ganó otra tx.
        await session.rollback()
        return await _build_order(order_token, session)
    return await _build_order(order_token, session)


@router.delete("/public/order/{order_token}/coupon", response_model=PublicShopperOrder)
@limiter.limit("15/minute")
async def remove_coupon(
    request: Request,
    response: Response,
    order_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    _no_store(response)
    rows = await _order_active_rows(order_token, session)
    if not rows:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    now = _now()
    existing = (await session.execute(
        select(ShopperCouponRedemption).where(
            ShopperCouponRedemption.order_token == order_token,
            ShopperCouponRedemption.status == "held",
        )
    )).scalar_one_or_none()
    if existing is not None:
        old = await session.get(ShopperCoupon, existing.coupon_id)
        existing.status = "released"
        existing.released_at = now
        existing.updated_at = now
        session.add(existing)
        if old is not None:
            old.redeemed_count = max(0, old.redeemed_count - 1)
            old.updated_at = now
            session.add(old)
        await session.commit()
    return await _build_order(order_token, session)


# ── Reporting honesto (dueño) ─────────────────────────────────────────────────

# Baldes por avance real del pedido. El front NO debe sumar pendiente como si fuera
# plata cobrada: por eso viven separados y el USD/ganancia solo cuentan lo realizado.
_STATS_POTENTIAL = ("pendiente",)
_STATS_COMMITTED = ("confirmada", "comprada", "en_camino")
_STATS_REALIZED = ("entregada",)


@router.get("/stats", response_model=ShopperStatsRead)
async def shopper_stats(
    days: int = Query(0, ge=0, le=365),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Reporting honesto: tres baldes (potencial/en firme/realizado) neteados de cupón.
    Reemplaza el `summary` del front que mezclaba pendiente con cobrado. `days=0` = todo.
    El costo sale de la calculadora (`calc_total_cost_gtq`); si un ítem no lo tiene, se
    asume `precio × assumed_cost_ratio` y se cuenta en `assumed_cost_lines`."""
    now = _now()
    assumed_ratio = await _assumed_cost_ratio(tenant_id, session)
    exchange_rate = (await session.execute(
        select(ShopperCalcSettings.exchange_rate).where(
            ShopperCalcSettings.tenant_id == tenant_id,
            ShopperCalcSettings.is_active == True,
        )
    )).scalar_one_or_none()
    rate = Decimal(str(exchange_rate)) if exchange_rate else Decimal("7.75")

    conds = [
        ShopperReservation.tenant_id == tenant_id,
        ShopperReservation.is_active == True,
    ]
    if days > 0:
        conds.append(ShopperReservation.created_at >= now - timedelta(days=days))

    rows = (await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(*conds)
    )).all()

    def _blank() -> dict:
        return {
            "revenue": Decimal("0"), "cost": Decimal("0"), "coupon": Decimal("0"),
            "units": 0, "lines": 0, "orders": set(), "assumed": 0,
        }

    buckets = {"potential": _blank(), "committed": _blank(), "realized": _blank()}
    cancelled_lines = unavailable_lines = expired_lines = 0
    phones: dict[str, set] = {}
    prod: dict[uuid.UUID, dict] = {}                     # item_id -> aporte realizado+firme
    coupon_share = await _coupon_share_by_line(tenant_id, session)

    for r, item in rows:
        qty = r.quantity or 0
        price = Decimal(str(item.price_gtq or 0))
        if item.calc_total_cost_gtq is not None:
            unit_cost = Decimal(str(item.calc_total_cost_gtq))
            assumed = 0
        else:
            unit_cost = price * assumed_ratio
            assumed = 1
        line_rev = price * qty
        line_cost = unit_cost * qty

        if r.status in _STATS_POTENTIAL:
            key = "potential"
        elif r.status in _STATS_COMMITTED:
            key = "committed"
        elif r.status in _STATS_REALIZED:
            key = "realized"
        else:
            if r.status == "no_disponible":
                unavailable_lines += 1
            elif r.status == "cancelada":
                if r.resolution == "expiro":
                    expired_lines += 1
                else:
                    cancelled_lines += 1
            continue

        # El descuento va prorrateado a la línea, no entero al balde más avanzado del
        # pedido: si de dos ítems uno se entregó y el otro no se consiguió, cargarle
        # todo el cupón al entregado hunde la ganancia por plata que nunca se regaló.
        # La parte de las líneas caídas no entra a ningún balde: no se otorgó.
        line_coupon = coupon_share.get(r.id, Decimal("0"))

        b = buckets[key]
        b["revenue"] += line_rev
        b["cost"] += line_cost
        b["coupon"] += line_coupon
        b["units"] += qty
        b["lines"] += 1
        b["assumed"] += assumed
        if r.order_token:
            b["orders"].add(r.order_token)
        if r.client_phone:
            phones.setdefault(r.client_phone, set())
            if r.order_token:
                phones[r.client_phone].add(r.order_token)

        if key in ("realized", "committed"):
            p = prod.setdefault(r.catalog_item_id, {
                "title": item.title, "image_url": item.image_url,
                "units": 0, "revenue": Decimal("0"), "profit": Decimal("0"),
            })
            p["units"] += qty
            # El campo se llama net_revenue: que lo sea. Traía bruto y no reconciliaba
            # con la utilidad de los baldes.
            p["revenue"] += line_rev - line_coupon
            p["profit"] += line_rev - line_cost - line_coupon

    total_coupon = sum((b["coupon"] for b in buckets.values()), Decimal("0"))

    def _bucket_out(b: dict) -> ShopperStatsBucket:
        revenue = b["revenue"]
        coupon = min(b["coupon"], revenue)   # el cupón no puede exceder el bruto del balde
        net = revenue - coupon
        return ShopperStatsBucket(
            revenue_gtq=float(revenue.quantize(Decimal("0.01"))),
            coupon_gtq=float(coupon.quantize(Decimal("0.01"))),
            net_revenue_gtq=float(net.quantize(Decimal("0.01"))),
            cost_gtq=float(b["cost"].quantize(Decimal("0.01"))),
            profit_gtq=float((net - b["cost"]).quantize(Decimal("0.01"))),
            units=b["units"], lines=b["lines"], orders=len(b["orders"]),
            assumed_cost_lines=b["assumed"],
        )

    realized = _bucket_out(buckets["realized"])
    committed = _bucket_out(buckets["committed"])
    potential = _bucket_out(buckets["potential"])

    realized_orders = len(buckets["realized"]["orders"])
    avg_ticket = realized.net_revenue_gtq / realized_orders if realized_orders else 0.0
    terminal = realized.lines + cancelled_lines + unavailable_lines + expired_lines
    fulfillment = realized.lines / terminal if terminal else 0.0

    top = sorted(prod.items(), key=lambda kv: kv[1]["revenue"], reverse=True)[:5]
    top_products = [
        ShopperStatsProduct(
            catalog_item_id=iid, title=p["title"], image_url=p["image_url"],
            units=p["units"],
            net_revenue_gtq=float(p["revenue"].quantize(Decimal("0.01"))),
            profit_gtq=float(p["profit"].quantize(Decimal("0.01"))),
        )
        for iid, p in top
    ]

    return ShopperStatsRead(
        period_days=days,
        generated_at=now,
        exchange_rate=float(rate),
        potential=potential,
        committed=committed,
        realized=realized,
        realized_profit_usd=round(realized.profit_gtq / float(rate), 2) if rate else 0.0,
        avg_ticket_gtq=round(avg_ticket, 2),
        fulfillment_rate=round(fulfillment, 4),
        cancelled_lines=cancelled_lines,
        unavailable_lines=unavailable_lines,
        expired_lines=expired_lines,
        total_coupon_gtq=float(total_coupon.quantize(Decimal("0.01"))),
        unique_customers=len(phones),
        recurring_customers=sum(1 for ots in phones.values() if len(ots) > 1),
        top_products=top_products,
    )


# ── Histórico de ventas en vivo ───────────────────────────────────────────────

@router.get("/store/sessions", response_model=list[ShopperStoreSessionRead])
async def list_store_sessions(
    limit: int = Query(30, ge=1, le=100),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Histórico de ventas en vivo, la más reciente arriba. Las cifras se derivan de
    las reservas creadas dentro de la ventana de cada venta (no hay snapshot congelado:
    entregar un pedido mañana tiene que mover el número de la venta de hoy)."""
    sessions = (await session.execute(
        select(ShopperStoreSession).where(
            ShopperStoreSession.tenant_id == tenant_id,
            ShopperStoreSession.is_active == True,
        ).order_by(ShopperStoreSession.opened_at.desc()).limit(limit)
    )).scalars().all()
    if not sessions:
        return []

    assumed_ratio = await _assumed_cost_ratio(tenant_id, session)
    # Una sola query para todas las ventas: el histórico es una lista, no una vista de
    # detalle, y N ventanas × 1 query cada una se degrada rápido.
    oldest = min(s.opened_at for s in sessions)
    rows = (await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
            ShopperReservation.created_at >= oldest,
        )
    )).all()

    coupon_share = await _coupon_share_by_line(tenant_id, session)

    out: list[ShopperStoreSessionRead] = []
    for s in sessions:
        # La venta en curso no tiene closed_at: su ventana llega hasta ahora.
        end = s.closed_at or _now()
        agg = _summarize_window(rows, s.opened_at, end, assumed_ratio, coupon_share)
        out.append(ShopperStoreSessionRead(
            id=s.id, store_name=s.store_name, banner_url=s.banner_url,
            opened_at=s.opened_at, closed_at=s.closed_at, closes_at=s.closes_at,
            **agg,
        ))
    return out


async def _coupon_share_by_line(
    tenant_id: uuid.UUID, session: AsyncSession
) -> dict[uuid.UUID, Decimal]:
    """Reparte el descuento de cada pedido entre SUS líneas, proporcional al bruto de
    cada una. Sin prorrateo el descuento entero recae sobre las líneas que sobreviven:
    el pedido de dos ítems donde uno no se consiguió le cargaba a la única línea
    entregada un descuento que se otorgó sobre las dos."""
    redemptions = (await session.execute(
        select(ShopperCouponRedemption.order_token, ShopperCouponRedemption.discount_gtq).where(
            ShopperCouponRedemption.tenant_id == tenant_id,
            ShopperCouponRedemption.status == "held",
        )
    )).all()
    by_order = {ot: Decimal(str(d)) for ot, d in redemptions if ot and d}
    if not by_order:
        return {}

    rows = (await session.execute(
        select(
            ShopperReservation.id, ShopperReservation.order_token,
            ShopperReservation.quantity, ShopperCatalogItem.price_gtq,
        ).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
            ShopperReservation.order_token.in_(list(by_order)),
        )
    )).all()

    return _prorate_coupons(
        by_order,
        [(rid, ot, Decimal(str(price or 0)) * (qty or 0)) for rid, ot, qty, price in rows],
    )


def _prorate_coupons(
    disc_by_order: dict[uuid.UUID, Decimal],
    lines: list[tuple[uuid.UUID, uuid.UUID, Decimal]],
) -> dict[uuid.UUID, Decimal]:
    """Aritmética pura del prorrateo (separada de la query para poder testearla):
    `lines` es (reservation_id, order_token, bruto de la línea)."""
    gross: dict[uuid.UUID, Decimal] = {}
    by_order_lines: dict[uuid.UUID, list[tuple[uuid.UUID, Decimal]]] = {}
    for rid, ot, g in lines:
        gross[ot] = gross.get(ot, Decimal("0")) + g
        by_order_lines.setdefault(ot, []).append((rid, g))

    share: dict[uuid.UUID, Decimal] = {}
    for ot, disc in disc_by_order.items():
        total = gross.get(ot, Decimal("0"))
        if total <= 0:
            continue
        for rid, g in by_order_lines[ot]:
            share[rid] = (disc * g / total).quantize(Decimal("0.01"))
    return share


def _summarize_window(
    rows, start: datetime, end: datetime, assumed_ratio: Decimal,
    coupon_share: dict[uuid.UUID, Decimal] | None = None,
) -> dict:
    """Métricas de las reservas creadas dentro de [start, end]. Separa lo APARTADO
    (bruto, aún puede evaporarse) de lo ENTREGADO (plata de verdad) — meterlos en un
    solo número es exactamente la mentira que el endpoint /stats vino a matar."""
    coupon_share = coupon_share or {}
    units = reservations = clients_n = 0
    delivered_units = cancelled = 0
    revenue = Decimal("0")
    delivered_revenue = Decimal("0")
    delivered_profit = Decimal("0")
    delivered_coupon = Decimal("0")
    phones: set[str] = set()
    per_item: dict[uuid.UUID, dict] = {}

    for r, item in rows:
        if not (start <= r.created_at <= end):
            continue
        if r.status in ("cancelada", "no_disponible"):
            cancelled += 1
            continue
        qty = r.quantity or 0
        price = Decimal(str(item.price_gtq or 0))
        units += qty
        reservations += 1
        revenue += price * qty
        if r.client_phone:
            phones.add(r.client_phone)
        if r.status == "entregada":
            unit_cost = (
                Decimal(str(item.calc_total_cost_gtq))
                if item.calc_total_cost_gtq is not None else price * assumed_ratio
            )
            # El cupón se descuenta de lo entregado: sin esto la venta declaraba como
            # ganancia plata que el dueño regaló, y el mismo cierre daba una utilidad
            # distinta acá que en /stats.
            line_coupon = coupon_share.get(r.id, Decimal("0"))
            delivered_units += qty
            delivered_coupon += line_coupon
            delivered_revenue += price * qty - line_coupon
            delivered_profit += (price - unit_cost) * qty - line_coupon
        p = per_item.setdefault(r.catalog_item_id, {"title": item.title, "units": 0})
        p["units"] += qty

    clients_n = len(phones)
    top_title, top_units = None, 0
    for p in per_item.values():
        if p["units"] > top_units:
            top_units, top_title = p["units"], p["title"]

    q = lambda d: float(d.quantize(Decimal("0.01")))
    return {
        "units": units, "reservations": reservations, "clients": clients_n,
        "revenue_gtq": q(revenue),
        "delivered_units": delivered_units,
        "delivered_revenue_gtq": q(delivered_revenue),
        "delivered_profit_gtq": q(delivered_profit),
        "delivered_coupon_gtq": q(delivered_coupon),
        "cancelled_lines": cancelled,
        "top_title": top_title, "top_units": top_units,
    }


@router.delete("/store/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_store_session(
    session_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Saca una venta del histórico para que no estorbe. Soft-delete: borra la FILA DEL
    HISTÓRICO, nunca las reservas ni la plata — el dueño está limpiando una lista, no
    deshaciendo ventas, y "Cómo te fue" sigue contando esos pedidos."""
    row = (await session.execute(
        select(ShopperStoreSession).where(
            ShopperStoreSession.id == session_id,
            ShopperStoreSession.tenant_id == tenant_id,
            ShopperStoreSession.is_active == True,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")
    if row.closed_at is None:
        raise HTTPException(status_code=409, detail="Cerrá la venta antes de quitarla del histórico.")
    row.is_active = False
    row.updated_at = _now()
    session.add(row)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
