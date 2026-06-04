"""
ENDPOINT PÚBLICO: Tracking de pedido por token
- GET /api/tracking/{token}  → Sin autenticación, datos limitados

Seguridad:
  - Rate limit propio: 20 req/min por IP (más estricto que el global 100/min)
  - UUID v4 token: 2^122 posibilidades — brute-force imposible
  - Cache-Control: 20 s — reduce golpes a la BD bajo carga
  - Solo expone campos seguros: sin tenant_id, sin teléfono, sin precios, sin nombre del cliente
  - Branding del negocio (nombre, logo, color) SÍ se expone a propósito: es la
    identidad pública del vendedor, le da personalidad a la página de tracking.
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from db.session import get_session
from models.bakery import ShopperOrder
from models.tenants import Tenant
from core.limiter import limiter

router = APIRouter(tags=["Public Tracking"])


class PublicTrackingRead(BaseModel):
    product_description: str
    quantity: float
    unit: str
    delivery_date: Optional[str] = None
    status: str
    tracking_status: Optional[str] = None
    tracking_note: Optional[str] = None
    tracking_updated_at: Optional[datetime] = None
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None


@router.get("/{token}", response_model=PublicTrackingRead)
@limiter.limit("20/minute")
async def get_public_tracking(
    token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperOrder).where(
            ShopperOrder.tracking_token == token,
            ShopperOrder.is_active == True,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == order.tenant_id))
    ).scalar_one_or_none()

    response.headers["Cache-Control"] = "public, max-age=20, s-maxage=20"
    response.headers["X-Content-Type-Options"] = "nosniff"

    return PublicTrackingRead(
        product_description=order.product_description,
        quantity=order.quantity,
        unit=order.unit,
        delivery_date=str(order.delivery_date) if order.delivery_date else None,
        status=order.status,
        tracking_status=order.tracking_status,
        tracking_note=order.tracking_note,
        tracking_updated_at=order.tracking_updated_at,
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
    )
