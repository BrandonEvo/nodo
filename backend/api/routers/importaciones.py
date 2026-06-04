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
    ImportCotizacion, ImportCliente, VALID_TRANSITIONS, STATUS_TS_FIELD,
)
from models.tenants import Tenant
from models import User

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
    created_at: datetime
    updated_at: datetime
    # Stats agregadas
    cotizaciones_count: int = 0
    total_pagado_gtq: Decimal = Decimal("0.00")
    last_cotizacion_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ClienteDetail(ClienteRead):
    cotizaciones: list[CotizacionRead] = []


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

    allowed = VALID_TRANSITIONS.get(cotizacion.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Transición no válida: {cotizacion.status} → {body.status}.",
        )

    cotizacion.status = body.status
    cotizacion.updated_at = _utcnow()

    ts_field = STATUS_TS_FIELD.get(body.status)
    if ts_field:
        setattr(cotizacion, ts_field, _utcnow())

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
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


def _cliente_read(cliente: ImportCliente, stats: dict) -> ClienteRead:
    return ClienteRead(
        id=cliente.id,
        name=cliente.name,
        phone=cliente.phone,
        email=cliente.email,
        notes=cliente.notes,
        created_at=cliente.created_at,
        updated_at=cliente.updated_at,
        cotizaciones_count=stats.get("cotizaciones_count", 0),
        total_pagado_gtq=stats.get("total_pagado_gtq", Decimal("0.00")),
        last_cotizacion_at=stats.get("last_cotizacion_at"),
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

    stats = await _cliente_stats([c.id for c in clientes], tenant_id, session)
    return [_cliente_read(c, stats.get(c.id, {})) for c in clientes]


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

    base = _cliente_read(cliente, stats.get(cliente.id, {}))
    return ClienteDetail(**base.model_dump(), cotizaciones=cotizaciones)


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
    return _cliente_read(cliente, stats.get(cliente.id, {}))


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
