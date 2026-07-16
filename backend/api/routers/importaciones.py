"""
MÓDULO: IMPORTACIONES — Cotizaciones + Clientes
- GET    /api/importaciones/cotizaciones              → Listar cotizaciones del tenant
- POST   /api/importaciones/cotizaciones              → Crear cotización con snapshot
- PATCH  /api/importaciones/cotizaciones/{id}/status → Avanzar estado
- PATCH  /api/importaciones/cotizaciones/{id}/logistics → Actualizar tracking/entrega/notas
- POST   /api/importaciones/cotizaciones/{id}/renovar → Renovar in-place +24h
- GET    /api/importaciones/clientes                 → Listar clientes (search) + stats
- POST   /api/importaciones/clientes                 → Crear cliente
- GET    /api/importaciones/clientes/{id}            → Cliente + sus cotizaciones
- PATCH  /api/importaciones/clientes/{id}            → Editar cliente
- DELETE /api/importaciones/clientes/{id}            → Soft-delete cliente
"""
import uuid
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from core.limiter import limiter
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id, current_active_user
from models.importaciones import (
    ImportCotizacion, ImportCliente, ImportPaquete,
    VALID_TRANSITIONS, STATUS_TS_FIELD, STATUS_FLOW,
)
from models.import_catalog import ImportReservation, ImportCatalogItem
from models.tenants import Tenant
from models import User
from api.services.push_service import send_push_to_tenant

# Estados (del flujo real del pedido) que merecen notificación al equipo
_PUSH_ON_STATUS: dict[str, tuple[str, str]] = {
    "confirmado":  ("✓ Pedido confirmado", "El cliente confirmó el pedido"),
    "en_transito": ("🚚 Pedido en tránsito", "El envío está en camino"),
    "entregado":   ("📦 Pedido entregado", "El pedido fue entregado al cliente"),
    "pagado":      ("💰 Pedido pagado", "El cliente completó el pago"),
}

router = APIRouter(tags=["Importaciones"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _expires() -> datetime:
    return _utcnow() + timedelta(hours=24)


def _to_decimal(value) -> Optional[Decimal]:
    """Extrae un monto del result_snapshot (JSON) como Decimal redondeado a 2."""
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return None


# ── Schemas ────────────────────────────────────────────────────────────────────

class ClienteMini(BaseModel):
    id: uuid.UUID
    name: str
    phone: Optional[str] = None

    model_config = {"from_attributes": True}


class CotizacionCreate(BaseModel):
    product_name: str
    amazon_asin: Optional[str] = None
    cliente_id: Optional[uuid.UUID] = None
    inputs_snapshot: dict
    config_snapshot: dict
    result_snapshot: dict


class StatusUpdate(BaseModel):
    status: str


class LogisticsUpdate(BaseModel):
    tracking_number: Optional[str] = None
    estimated_delivery: Optional[date] = None
    notes: Optional[str] = None


class RenovarPayload(BaseModel):
    inputs_snapshot: dict
    config_snapshot: dict
    result_snapshot: dict


class CotizacionRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    cliente_id: Optional[uuid.UUID]
    paquete_id: Optional[uuid.UUID] = None
    cliente: Optional[ClienteMini] = None
    product_name: str
    amazon_asin: Optional[str]
    inputs_snapshot: dict
    config_snapshot: dict
    result_snapshot: dict
    sale_price_gtq: Optional[Decimal]
    landed_cost_gtq: Optional[Decimal]
    share_token: uuid.UUID
    status: str
    expires_at: datetime
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    notes: Optional[str]
    confirmado_at: Optional[datetime]
    comprado_at: Optional[datetime]
    en_transito_at: Optional[datetime]
    entregado_at: Optional[datetime]
    pagado_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClienteCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class ClienteUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class ClienteRead(BaseModel):
    id: uuid.UUID
    name: str
    phone: Optional[str]
    email: Optional[str]
    notes: Optional[str]
    # Origen de la ficha: manual | catalogo | qr — y verificación del teléfono.
    source: str = "manual"
    attribution: Optional[str] = None
    phone_verified: bool = False
    created_at: datetime
    updated_at: datetime
    # Stats agregadas de cotizaciones
    cotizaciones_count: int = 0
    total_pagado_gtq: Decimal = Decimal("0.00")
    last_cotizacion_at: Optional[datetime] = None
    # Acumulado del pedido en línea (reservas del catálogo), en buckets por estado:
    # reservado = solo apartado (pendiente); pedido_actual = en curso (confirmada..en_camino);
    # entregado = ya recibido. Los desenlaces no_disponible/cancelada no suman.
    reservado_gtq: Decimal = Decimal("0.00")
    pedido_actual_gtq: Decimal = Decimal("0.00")
    entregado_gtq: Decimal = Decimal("0.00")
    reservas_activas: int = 0

    model_config = {"from_attributes": True}


class ClienteReservaRead(BaseModel):
    """Línea de reserva del catálogo mostrada en el perfil del cliente."""
    id: uuid.UUID
    item_title: str
    item_image_url: Optional[str] = None
    quantity: int
    status: str
    line_total_gtq: Decimal = Decimal("0.00")
    created_at: datetime
    order_token: Optional[uuid.UUID] = None


class ClienteDetail(ClienteRead):
    cotizaciones: list[CotizacionRead] = []
    reservas: list[ClienteReservaRead] = []


class PublicCotizacionRead(BaseModel):
    product_name: str
    cliente_name: Optional[str] = None
    status: str
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    created_at: datetime
    confirmado_at: Optional[datetime]
    comprado_at: Optional[datetime]
    en_transito_at: Optional[datetime]
    entregado_at: Optional[datetime]
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None


# ── Paquetes (agrupación de pedidos) ───────────────────────────────────────────

class PaqueteCreate(BaseModel):
    name: Optional[str] = None
    cliente_id: Optional[uuid.UUID] = None
    cotizacion_ids: list[uuid.UUID] = []   # miembros iniciales (opcional)


class PaqueteUpdate(BaseModel):
    name: Optional[str] = None
    tracking_number: Optional[str] = None
    estimated_delivery: Optional[date] = None
    notes: Optional[str] = None


class PaqueteRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    cliente_id: Optional[uuid.UUID]
    cliente: Optional[ClienteMini] = None
    name: str
    status: str
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    notes: Optional[str]
    confirmado_at: Optional[datetime]
    comprado_at: Optional[datetime]
    en_transito_at: Optional[datetime]
    entregado_at: Optional[datetime]
    pagado_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    cotizaciones: list[CotizacionRead] = []

    model_config = {"from_attributes": True}


class AssignPaquetePayload(BaseModel):
    paquete_id: Optional[uuid.UUID] = None   # None = sacar del paquete (suelta)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_cotizacion(
    id: uuid.UUID,
    tenant_id: uuid.UUID,
    session: AsyncSession,
) -> ImportCotizacion:
    cotizacion = await session.get(ImportCotizacion, id)
    if not cotizacion or cotizacion.tenant_id != tenant_id or not cotizacion.is_active:
        raise HTTPException(status_code=404, detail="Cotización no encontrada.")
    return cotizacion


async def _get_cliente(
    id: uuid.UUID,
    tenant_id: uuid.UUID,
    session: AsyncSession,
) -> ImportCliente:
    cliente = await session.get(ImportCliente, id)
    if not cliente or cliente.tenant_id != tenant_id or not cliente.is_active:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    return cliente


def _apply_metrics(cotizacion: ImportCotizacion) -> None:
    """Denormaliza precio de venta y costo landed desde el result_snapshot."""
    snap = cotizacion.result_snapshot or {}
    cotizacion.sale_price_gtq = _to_decimal(snap.get("salePriceGTQ"))
    cotizacion.landed_cost_gtq = _to_decimal(snap.get("totalLandedCostGTQ"))


async def _serialize(
    cotizaciones: list[ImportCotizacion],
    tenant_id: uuid.UUID,
    session: AsyncSession,
) -> list[CotizacionRead]:
    """Convierte cotizaciones a CotizacionRead embebiendo el cliente (una query)."""
    cliente_ids = {c.cliente_id for c in cotizaciones if c.cliente_id}
    clientes: dict[uuid.UUID, ImportCliente] = {}
    if cliente_ids:
        rows = await session.execute(
            select(ImportCliente).where(ImportCliente.id.in_(cliente_ids))
        )
        clientes = {cl.id: cl for cl in rows.scalars().all()}

    out: list[CotizacionRead] = []
    for c in cotizaciones:
        read = CotizacionRead.model_validate(c)
        cl = clientes.get(c.cliente_id) if c.cliente_id else None
        read.cliente = ClienteMini.model_validate(cl) if cl else None
        out.append(read)
    return out


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/cotizaciones", response_model=list[CotizacionRead])
async def list_cotizaciones(
    status: Optional[str] = None,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    q = (
        select(ImportCotizacion)
        .where(ImportCotizacion.tenant_id == tenant_id, ImportCotizacion.is_active == True)
        .order_by(ImportCotizacion.created_at.desc())
    )
    if status:
        q = q.where(ImportCotizacion.status == status)
    result = await session.execute(q)
    return await _serialize(list(result.scalars().all()), tenant_id, session)


@router.post("/cotizaciones", response_model=CotizacionRead, status_code=201)
async def create_cotizacion(
    body: CotizacionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if body.cliente_id is not None:
        await _get_cliente(body.cliente_id, tenant_id, session)

    now = _utcnow()
    cotizacion = ImportCotizacion(
        tenant_id=tenant_id,
        cliente_id=body.cliente_id,
        product_name=body.product_name,
        amazon_asin=body.amazon_asin,
        inputs_snapshot=body.inputs_snapshot,
        config_snapshot=body.config_snapshot,
        result_snapshot=body.result_snapshot,
        expires_at=now + timedelta(hours=24),
        created_at=now,
        updated_at=now,
        created_by=user.id,
    )
    _apply_metrics(cotizacion)
    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return (await _serialize([cotizacion], tenant_id, session))[0]


@router.patch("/cotizaciones/{id}/status", response_model=CotizacionRead)
async def advance_status(
    id: uuid.UUID,
    body: StatusUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cotizacion = await _get_cotizacion(id, tenant_id, session)

    old_status = cotizacion.status
    allowed = VALID_TRANSITIONS.get(old_status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Transición no válida: {old_status} → {body.status}.",
        )

    cotizacion.status = body.status
    cotizacion.updated_at = _utcnow()

    # Sello de tiempo del nuevo estado (solo si aún no lo tenía).
    ts_field = STATUS_TS_FIELD.get(body.status)
    if ts_field and getattr(cotizacion, ts_field) is None:
        setattr(cotizacion, ts_field, _utcnow())

    # Al retroceder, limpiar los timestamps de los estados que quedan "en el futuro".
    if body.status in STATUS_FLOW:
        new_idx = STATUS_FLOW.index(body.status)
        for st in STATUS_FLOW[new_idx + 1:]:
            f = STATUS_TS_FIELD.get(st)
            if f:
                setattr(cotizacion, f, None)

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)

    # Notificar solo al avanzar en el flujo (no al retroceder ni reactivar).
    moved_forward = (
        old_status in STATUS_FLOW and body.status in STATUS_FLOW
        and STATUS_FLOW.index(body.status) > STATUS_FLOW.index(old_status)
    )
    if moved_forward and body.status in _PUSH_ON_STATUS:
        title, base_body = _PUSH_ON_STATUS[body.status]
        cliente_name = None
        if cotizacion.cliente_id:
            cliente = await session.get(ImportCliente, cotizacion.cliente_id)
            cliente_name = cliente.name if cliente else None
        client_suffix = f" — {cliente_name}" if cliente_name else ""
        await send_push_to_tenant(
            session=session,
            tenant_id=tenant_id,
            title=title,
            body=base_body + client_suffix,
            data={"module": "importaciones", "cotizacion_id": str(cotizacion.id)},
        )

    return (await _serialize([cotizacion], tenant_id, session))[0]


@router.patch("/cotizaciones/{id}/logistics", response_model=CotizacionRead)
async def update_logistics(
    id: uuid.UUID,
    body: LogisticsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cotizacion = await _get_cotizacion(id, tenant_id, session)

    if body.tracking_number is not None:
        cotizacion.tracking_number = body.tracking_number or None
    if body.estimated_delivery is not None:
        cotizacion.estimated_delivery = body.estimated_delivery
    if body.notes is not None:
        cotizacion.notes = body.notes or None

    cotizacion.updated_at = _utcnow()
    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return (await _serialize([cotizacion], tenant_id, session))[0]


@router.get("/public/{share_token}", response_model=PublicCotizacionRead)
@limiter.limit("20/minute")
async def get_public_tracking(
    share_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportCotizacion).where(
            ImportCotizacion.share_token == share_token,
            ImportCotizacion.is_active == True,
        )
    )
    cotizacion = result.scalar_one_or_none()
    if not cotizacion:
        raise HTTPException(status_code=404, detail="Cotización no encontrada.")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == cotizacion.tenant_id))
    ).scalar_one_or_none()

    cliente_name: Optional[str] = None
    if cotizacion.cliente_id:
        cliente = await session.get(ImportCliente, cotizacion.cliente_id)
        cliente_name = cliente.name if cliente else None

    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
    response.headers["X-Content-Type-Options"] = "nosniff"

    return PublicCotizacionRead(
        product_name=cotizacion.product_name,
        cliente_name=cliente_name,
        status=cotizacion.status,
        tracking_number=cotizacion.tracking_number,
        estimated_delivery=cotizacion.estimated_delivery,
        created_at=cotizacion.created_at,
        confirmado_at=cotizacion.confirmado_at,
        comprado_at=cotizacion.comprado_at,
        en_transito_at=cotizacion.en_transito_at,
        entregado_at=cotizacion.entregado_at,
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
    )


@router.patch("/cotizaciones/{id}/recalcular", response_model=CotizacionRead)
async def recalcular_cotizacion(
    id: uuid.UUID,
    body: RenovarPayload,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cotizacion = await _get_cotizacion(id, tenant_id, session)

    if cotizacion.status in ("pagado", "cancelado"):
        raise HTTPException(status_code=400, detail="No se puede editar una cotización cerrada.")

    cotizacion.inputs_snapshot = body.inputs_snapshot
    cotizacion.config_snapshot = body.config_snapshot
    cotizacion.result_snapshot = body.result_snapshot
    _apply_metrics(cotizacion)
    cotizacion.updated_at = _utcnow()

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return (await _serialize([cotizacion], tenant_id, session))[0]


# ── Clientes ─────────────────────────────────────────────────────────────────

async def _cliente_stats(
    cliente_ids: list[uuid.UUID],
    tenant_id: uuid.UUID,
    session: AsyncSession,
) -> dict[uuid.UUID, dict]:
    """Agrega nº de cotizaciones, total pagado y última cotización por cliente."""
    if not cliente_ids:
        return {}
    rows = await session.execute(
        select(
            ImportCotizacion.cliente_id,
            func.count(ImportCotizacion.id),
            func.coalesce(
                func.sum(ImportCotizacion.sale_price_gtq).filter(
                    ImportCotizacion.status == "pagado"
                ),
                0,
            ),
            func.max(ImportCotizacion.created_at),
        )
        .where(
            ImportCotizacion.tenant_id == tenant_id,
            ImportCotizacion.is_active == True,
            ImportCotizacion.cliente_id.in_(cliente_ids),
        )
        .group_by(ImportCotizacion.cliente_id)
    )
    stats: dict[uuid.UUID, dict] = {}
    for cliente_id, count, total, last in rows.all():
        stats[cliente_id] = {
            "cotizaciones_count": count,
            "total_pagado_gtq": _to_decimal(total) or Decimal("0.00"),
            "last_cotizacion_at": last,
        }
    return stats


async def _cliente_reservation_stats(
    cliente_ids: list[uuid.UUID],
    tenant_id: uuid.UUID,
    session: AsyncSession,
) -> dict[uuid.UUID, dict]:
    """Agrega el valor de las reservas del catálogo por cliente en buckets por estado.
    line_total = precio del ítem × cantidad. Los desenlaces no_disponible/cancelada no suman."""
    if not cliente_ids:
        return {}
    line_total = ImportCatalogItem.price_gtq * ImportReservation.quantity
    en_curso = ["confirmada", "comprada", "en_camino"]
    activas = ["pendiente", *en_curso]
    rows = await session.execute(
        select(
            ImportReservation.cliente_id,
            func.coalesce(func.sum(line_total).filter(ImportReservation.status == "pendiente"), 0),
            func.coalesce(func.sum(line_total).filter(ImportReservation.status.in_(en_curso)), 0),
            func.coalesce(func.sum(line_total).filter(ImportReservation.status == "entregada"), 0),
            func.count(ImportReservation.id).filter(ImportReservation.status.in_(activas)),
        )
        .join(ImportCatalogItem, ImportCatalogItem.id == ImportReservation.catalog_item_id)
        .where(
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.is_active == True,
            ImportReservation.cliente_id.in_(cliente_ids),
        )
        .group_by(ImportReservation.cliente_id)
    )
    stats: dict[uuid.UUID, dict] = {}
    for cliente_id, reservado, curso, entregado, count_activas in rows.all():
        if cliente_id is None:
            continue
        stats[cliente_id] = {
            "reservado_gtq": _to_decimal(reservado) or Decimal("0.00"),
            "pedido_actual_gtq": _to_decimal(curso) or Decimal("0.00"),
            "entregado_gtq": _to_decimal(entregado) or Decimal("0.00"),
            "reservas_activas": count_activas or 0,
        }
    return stats


def _cliente_read(cliente: ImportCliente, stats: dict) -> ClienteRead:
    return ClienteRead(
        id=cliente.id,
        name=cliente.name,
        phone=cliente.phone,
        email=cliente.email,
        notes=cliente.notes,
        source=cliente.source,
        attribution=cliente.attribution,
        phone_verified=cliente.phone_verified,
        created_at=cliente.created_at,
        updated_at=cliente.updated_at,
        cotizaciones_count=stats.get("cotizaciones_count", 0),
        total_pagado_gtq=stats.get("total_pagado_gtq", Decimal("0.00")),
        last_cotizacion_at=stats.get("last_cotizacion_at"),
        reservado_gtq=stats.get("reservado_gtq", Decimal("0.00")),
        pedido_actual_gtq=stats.get("pedido_actual_gtq", Decimal("0.00")),
        entregado_gtq=stats.get("entregado_gtq", Decimal("0.00")),
        reservas_activas=stats.get("reservas_activas", 0),
    )


@router.get("/clientes", response_model=list[ClienteRead])
async def list_clientes(
    search: Optional[str] = None,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    q = (
        select(ImportCliente)
        .where(ImportCliente.tenant_id == tenant_id, ImportCliente.is_active == True)
        .order_by(ImportCliente.name)
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.where(ImportCliente.name.ilike(like) | ImportCliente.phone.ilike(like))
    clientes = list((await session.execute(q)).scalars().all())

    ids = [c.id for c in clientes]
    stats = await _cliente_stats(ids, tenant_id, session)
    rstats = await _cliente_reservation_stats(ids, tenant_id, session)
    return [
        _cliente_read(c, {**stats.get(c.id, {}), **rstats.get(c.id, {})})
        for c in clientes
    ]


@router.post("/clientes", response_model=ClienteRead, status_code=201)
async def create_cliente(
    body: ClienteCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre del cliente es obligatorio.")

    now = _utcnow()
    cliente = ImportCliente(
        tenant_id=tenant_id,
        name=name,
        phone=(body.phone or "").strip() or None,
        email=(body.email or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_at=now,
        updated_at=now,
        created_by=user.id,
    )
    session.add(cliente)
    await session.commit()
    await session.refresh(cliente)
    return _cliente_read(cliente, {})


@router.get("/clientes/{id}", response_model=ClienteDetail)
async def get_cliente(
    id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cliente = await _get_cliente(id, tenant_id, session)
    stats = await _cliente_stats([cliente.id], tenant_id, session)
    rstats = await _cliente_reservation_stats([cliente.id], tenant_id, session)

    rows = await session.execute(
        select(ImportCotizacion)
        .where(
            ImportCotizacion.tenant_id == tenant_id,
            ImportCotizacion.cliente_id == cliente.id,
            ImportCotizacion.is_active == True,
        )
        .order_by(ImportCotizacion.created_at.desc())
    )
    cotizaciones = await _serialize(list(rows.scalars().all()), tenant_id, session)

    rrows = await session.execute(
        select(ImportReservation, ImportCatalogItem)
        .join(ImportCatalogItem, ImportCatalogItem.id == ImportReservation.catalog_item_id)
        .where(
            ImportReservation.tenant_id == tenant_id,
            ImportReservation.cliente_id == cliente.id,
            ImportReservation.is_active == True,
        )
        .order_by(ImportReservation.created_at.desc())
    )
    reservas = [
        ClienteReservaRead(
            id=r.id,
            item_title=it.title,
            item_image_url=it.image_url,
            quantity=r.quantity,
            status=r.status,
            line_total_gtq=(_to_decimal((it.price_gtq or Decimal("0")) * r.quantity) or Decimal("0.00")),
            created_at=r.created_at,
            order_token=r.order_token,
        )
        for r, it in rrows.all()
    ]

    base = _cliente_read(cliente, {**stats.get(cliente.id, {}), **rstats.get(cliente.id, {})})
    return ClienteDetail(**base.model_dump(), cotizaciones=cotizaciones, reservas=reservas)


@router.patch("/clientes/{id}", response_model=ClienteRead)
async def update_cliente(
    id: uuid.UUID,
    body: ClienteUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cliente = await _get_cliente(id, tenant_id, session)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="El nombre del cliente es obligatorio.")
        cliente.name = name
    if body.phone is not None:
        cliente.phone = body.phone.strip() or None
    if body.email is not None:
        cliente.email = body.email.strip() or None
    if body.notes is not None:
        cliente.notes = body.notes.strip() or None

    cliente.updated_at = _utcnow()
    session.add(cliente)
    await session.commit()
    await session.refresh(cliente)

    stats = await _cliente_stats([cliente.id], tenant_id, session)
    rstats = await _cliente_reservation_stats([cliente.id], tenant_id, session)
    return _cliente_read(cliente, {**stats.get(cliente.id, {}), **rstats.get(cliente.id, {})})


@router.delete("/clientes/{id}", status_code=204)
async def delete_cliente(
    id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cliente = await _get_cliente(id, tenant_id, session)
    cliente.is_active = False
    cliente.updated_at = _utcnow()
    session.add(cliente)
    await session.commit()
    return Response(status_code=204)


@router.post("/cotizaciones/{id}/renovar", response_model=CotizacionRead)
async def renovar_cotizacion(
    id: uuid.UUID,
    body: RenovarPayload,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cotizacion = await _get_cotizacion(id, tenant_id, session)

    if cotizacion.status != "cotizado":
        raise HTTPException(status_code=400, detail="Solo se pueden renovar cotizaciones en estado cotizado.")

    now = _utcnow()
    cotizacion.inputs_snapshot = body.inputs_snapshot
    cotizacion.config_snapshot = body.config_snapshot
    cotizacion.result_snapshot = body.result_snapshot
    _apply_metrics(cotizacion)
    cotizacion.expires_at = now + timedelta(hours=24)
    cotizacion.updated_at = now

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return (await _serialize([cotizacion], tenant_id, session))[0]


# ── Paquetes (agrupación de pedidos con tracking unificado) ────────────────────

def _set_status(obj, new_status: str, now: datetime) -> None:
    """Aplica estado + sello de tiempo y limpia los timestamps de estados futuros.
    Sirve para ImportCotizacion e ImportPaquete (comparten los campos *_at)."""
    obj.status = new_status
    obj.updated_at = now
    ts_field = STATUS_TS_FIELD.get(new_status)
    if ts_field and getattr(obj, ts_field) is None:
        setattr(obj, ts_field, now)
    if new_status in STATUS_FLOW:
        new_idx = STATUS_FLOW.index(new_status)
        for st in STATUS_FLOW[new_idx + 1:]:
            f = STATUS_TS_FIELD.get(st)
            if f:
                setattr(obj, f, None)


async def _get_paquete(id: uuid.UUID, tenant_id: uuid.UUID, session: AsyncSession) -> ImportPaquete:
    paquete = await session.get(ImportPaquete, id)
    if not paquete or paquete.tenant_id != tenant_id or not paquete.is_active:
        raise HTTPException(status_code=404, detail="Paquete no encontrado.")
    return paquete


async def _serialize_paquetes(
    paquetes: list[ImportPaquete], tenant_id: uuid.UUID, session: AsyncSession,
) -> list[PaqueteRead]:
    """Arma PaqueteRead con el cliente embebido y las cotizaciones miembro."""
    if not paquetes:
        return []
    paquete_ids = [p.id for p in paquetes]

    members_rows = await session.execute(
        select(ImportCotizacion).where(
            ImportCotizacion.tenant_id == tenant_id,
            ImportCotizacion.is_active == True,
            ImportCotizacion.paquete_id.in_(paquete_ids),
        ).order_by(ImportCotizacion.created_at.desc())
    )
    members = list(members_rows.scalars().all())
    members_read = await _serialize(members, tenant_id, session)
    by_paquete: dict[uuid.UUID, list[CotizacionRead]] = {}
    for r in members_read:
        by_paquete.setdefault(r.paquete_id, []).append(r)

    cliente_ids = {p.cliente_id for p in paquetes if p.cliente_id}
    clientes: dict[uuid.UUID, ImportCliente] = {}
    if cliente_ids:
        rows = await session.execute(select(ImportCliente).where(ImportCliente.id.in_(cliente_ids)))
        clientes = {cl.id: cl for cl in rows.scalars().all()}

    out: list[PaqueteRead] = []
    for p in paquetes:
        read = PaqueteRead.model_validate(p)
        cl = clientes.get(p.cliente_id) if p.cliente_id else None
        read.cliente = ClienteMini.model_validate(cl) if cl else None
        read.cotizaciones = by_paquete.get(p.id, [])
        out.append(read)
    return out


@router.get("/paquetes", response_model=list[PaqueteRead])
async def list_paquetes(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ImportPaquete)
        .where(ImportPaquete.tenant_id == tenant_id, ImportPaquete.is_active == True)
        .order_by(ImportPaquete.created_at.desc())
    )
    return await _serialize_paquetes(list(result.scalars().all()), tenant_id, session)


@router.post("/paquetes", response_model=PaqueteRead, status_code=201)
async def create_paquete(
    body: PaqueteCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    now = _utcnow()
    cliente_id = body.cliente_id

    members: list[ImportCotizacion] = []
    if body.cotizacion_ids:
        rows = await session.execute(
            select(ImportCotizacion).where(
                ImportCotizacion.id.in_(body.cotizacion_ids),
                ImportCotizacion.tenant_id == tenant_id,
                ImportCotizacion.is_active == True,
            )
        )
        members = list(rows.scalars().all())
        if cliente_id is None:
            for m in members:
                if m.cliente_id:
                    cliente_id = m.cliente_id
                    break

    paquete = ImportPaquete(
        tenant_id=tenant_id,
        cliente_id=cliente_id,
        name=(body.name or "").strip() or "Paquete",
        status="cotizado",
        created_at=now,
        updated_at=now,
        created_by=user.id,
    )
    session.add(paquete)
    await session.flush()

    for m in members:
        m.paquete_id = paquete.id
        _set_status(m, paquete.status, now)
        session.add(m)

    await session.commit()
    await session.refresh(paquete)
    return (await _serialize_paquetes([paquete], tenant_id, session))[0]


@router.patch("/paquetes/{id}", response_model=PaqueteRead)
async def update_paquete(
    id: uuid.UUID,
    body: PaqueteUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    paquete = await _get_paquete(id, tenant_id, session)
    if body.name is not None:
        paquete.name = body.name.strip() or paquete.name
    if body.tracking_number is not None:
        paquete.tracking_number = body.tracking_number or None
    if body.estimated_delivery is not None:
        paquete.estimated_delivery = body.estimated_delivery
    if body.notes is not None:
        paquete.notes = body.notes or None
    paquete.updated_at = _utcnow()
    session.add(paquete)
    await session.commit()
    await session.refresh(paquete)
    return (await _serialize_paquetes([paquete], tenant_id, session))[0]


@router.patch("/paquetes/{id}/status", response_model=PaqueteRead)
async def advance_paquete_status(
    id: uuid.UUID,
    body: StatusUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Avanza el estado del paquete y lo cascada a todas sus cotizaciones miembro."""
    paquete = await _get_paquete(id, tenant_id, session)

    allowed = VALID_TRANSITIONS.get(paquete.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Transición no válida: {paquete.status} → {body.status}.",
        )

    now = _utcnow()
    old_status = paquete.status
    _set_status(paquete, body.status, now)
    session.add(paquete)

    members_rows = await session.execute(
        select(ImportCotizacion).where(
            ImportCotizacion.paquete_id == paquete.id,
            ImportCotizacion.tenant_id == tenant_id,
            ImportCotizacion.is_active == True,
        )
    )
    for m in members_rows.scalars().all():
        _set_status(m, body.status, now)
        session.add(m)

    await session.commit()
    await session.refresh(paquete)

    moved_forward = (
        old_status in STATUS_FLOW and body.status in STATUS_FLOW
        and STATUS_FLOW.index(body.status) > STATUS_FLOW.index(old_status)
    )
    if moved_forward and body.status in _PUSH_ON_STATUS:
        title, base_body = _PUSH_ON_STATUS[body.status]
        cliente_name = None
        if paquete.cliente_id:
            cliente = await session.get(ImportCliente, paquete.cliente_id)
            cliente_name = cliente.name if cliente else None
        suffix = f" — {cliente_name}" if cliente_name else ""
        await send_push_to_tenant(
            session=session,
            tenant_id=tenant_id,
            title=title,
            body=f"{base_body} ({paquete.name}){suffix}",
            data={"module": "importaciones", "paquete_id": str(paquete.id)},
        )

    return (await _serialize_paquetes([paquete], tenant_id, session))[0]


@router.delete("/paquetes/{id}", status_code=204)
async def delete_paquete(
    id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Disuelve el paquete: las cotizaciones quedan sueltas (no se borran)."""
    paquete = await _get_paquete(id, tenant_id, session)
    now = _utcnow()

    members_rows = await session.execute(
        select(ImportCotizacion).where(
            ImportCotizacion.paquete_id == paquete.id,
            ImportCotizacion.tenant_id == tenant_id,
        )
    )
    for m in members_rows.scalars().all():
        m.paquete_id = None
        m.updated_at = now
        session.add(m)

    paquete.is_active = False
    paquete.updated_at = now
    session.add(paquete)
    await session.commit()
    return Response(status_code=204)


@router.patch("/cotizaciones/{id}/paquete", response_model=CotizacionRead)
async def assign_cotizacion_paquete(
    id: uuid.UUID,
    body: AssignPaquetePayload,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Mueve una cotización a un paquete (o la saca si paquete_id es null).
    Al entrar a un paquete adopta su estado para mantener el envío consistente."""
    cotizacion = await _get_cotizacion(id, tenant_id, session)
    now = _utcnow()

    if body.paquete_id is None:
        cotizacion.paquete_id = None
        cotizacion.updated_at = now
    else:
        paquete = await _get_paquete(body.paquete_id, tenant_id, session)
        cotizacion.paquete_id = paquete.id
        if paquete.cliente_id is None and cotizacion.cliente_id is not None:
            paquete.cliente_id = cotizacion.cliente_id
            paquete.updated_at = now
            session.add(paquete)
        _set_status(cotizacion, paquete.status, now)

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return (await _serialize([cotizacion], tenant_id, session))[0]
