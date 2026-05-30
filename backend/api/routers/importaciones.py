"""
MÓDULO: IMPORTACIONES — Cotizaciones
- GET    /api/importaciones/cotizaciones              → Listar cotizaciones del tenant
- POST   /api/importaciones/cotizaciones              → Crear cotización con snapshot
- PATCH  /api/importaciones/cotizaciones/{id}/status → Avanzar estado
- PATCH  /api/importaciones/cotizaciones/{id}/logistics → Actualizar tracking/entrega/notas
- POST   /api/importaciones/cotizaciones/{id}/renovar → Renovar in-place +24h
"""
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from core.limiter import limiter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id, current_active_user
from models.importaciones import ImportCotizacion, VALID_TRANSITIONS, STATUS_TS_FIELD
from models import User

router = APIRouter(tags=["Importaciones"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _expires() -> datetime:
    return _utcnow() + timedelta(hours=24)


# ── Schemas ────────────────────────────────────────────────────────────────────

class CotizacionCreate(BaseModel):
    product_name: str
    amazon_asin: Optional[str] = None
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
    product_name: str
    amazon_asin: Optional[str]
    inputs_snapshot: dict
    config_snapshot: dict
    result_snapshot: dict
    share_token: uuid.UUID
    status: str
    expires_at: datetime
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    notes: Optional[str]
    comprado_at: Optional[datetime]
    en_transito_at: Optional[datetime]
    entregado_at: Optional[datetime]
    pagado_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicCotizacionRead(BaseModel):
    product_name: str
    status: str
    tracking_number: Optional[str]
    estimated_delivery: Optional[date]
    created_at: datetime
    comprado_at: Optional[datetime]
    en_transito_at: Optional[datetime]
    entregado_at: Optional[datetime]


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
    return result.scalars().all()


@router.post("/cotizaciones", response_model=CotizacionRead, status_code=201)
async def create_cotizacion(
    body: CotizacionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    now = _utcnow()
    cotizacion = ImportCotizacion(
        tenant_id=tenant_id,
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
    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return cotizacion


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
    return cotizacion


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
    return cotizacion


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

    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
    response.headers["X-Content-Type-Options"] = "nosniff"

    return PublicCotizacionRead(
        product_name=cotizacion.product_name,
        status=cotizacion.status,
        tracking_number=cotizacion.tracking_number,
        estimated_delivery=cotizacion.estimated_delivery,
        created_at=cotizacion.created_at,
        comprado_at=cotizacion.comprado_at,
        en_transito_at=cotizacion.en_transito_at,
        entregado_at=cotizacion.entregado_at,
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
    cotizacion.updated_at = _utcnow()

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return cotizacion


@router.post("/cotizaciones/{id}/renovar", response_model=CotizacionRead)
async def renovar_cotizacion(
    id: uuid.UUID,
    body: RenovarPayload,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    cotizacion = await _get_cotizacion(id, tenant_id, session)

    if cotizacion.status != "pendiente":
        raise HTTPException(status_code=400, detail="Solo se pueden renovar cotizaciones en estado pendiente.")

    now = _utcnow()
    cotizacion.inputs_snapshot = body.inputs_snapshot
    cotizacion.config_snapshot = body.config_snapshot
    cotizacion.result_snapshot = body.result_snapshot
    cotizacion.expires_at = now + timedelta(hours=24)
    cotizacion.updated_at = now

    session.add(cotizacion)
    await session.commit()
    await session.refresh(cotizacion)
    return cotizacion
