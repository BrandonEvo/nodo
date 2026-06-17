"""
ENDPOINTS PÚBLICOS: Tienda y pedidos por token — sin autenticación
- GET  /api/store/catalog/{public_token}         → Catálogo de la tienda
- POST /api/store/catalog/{public_token}/orders  → Crear pedido (aparta stock con TTL)
- GET  /api/store/orders/{order_token}           → Seguimiento del pedido
- POST /api/store/orders/{order_token}/pay       → Pago simulado

Seguridad (mismo patrón que public_tracking.py):
  - Rate limit propio por endpoint — más estricto que el global 100/min
  - Tokens UUID v4: 2^122 posibilidades — brute-force imposible
  - Solo campos seguros: sin tenant_id ni teléfonos; branding del negocio
    sí se expone a propósito (identidad pública del vendedor)
"""
import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field as PField
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from core.limiter import limiter
from api.services.push_service import send_push_to_tenant
from api.services.store_service import expire_stale_orders, generate_short_code, now_utc, release_reservation
from models.store import StoreOrder, StoreOrderItem, StoreProduct, StorePromotion, StoreSettings
from models.tenants import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tienda Pública"])


class PublicProductRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    price: float
    # Gancho: precio "antes" tachado y etiqueta llamativa. NUNCA exponer cost.
    compare_at_price: Optional[float] = None
    badge: Optional[str] = None
    available: int
    image_url: Optional[str] = None


class PublicPromotionRead(BaseModel):
    # Solo campos seguros del gancho — sin tenant_id, sin product_id interno crudo
    title: str
    promo_type: str
    value: Optional[float] = None
    product_id: Optional[uuid.UUID] = None    # = id del catálogo (ya público)
    description: Optional[str] = None
    urgency_text: Optional[str] = None
    ends_on: Optional[str] = None


class PublicCatalogRead(BaseModel):
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None
    is_open: bool
    products: List[PublicProductRead]
    promotions: List[PublicPromotionRead] = []


class PublicOrderItemIn(BaseModel):
    product_id: uuid.UUID
    qty: int = PField(ge=1, le=99)


class PublicOrderCreate(BaseModel):
    customer_name: str = PField(min_length=2, max_length=150)
    customer_phone: str = PField(min_length=6, max_length=30)
    items: List[PublicOrderItemIn] = PField(min_length=1, max_length=30)


class PublicOrderCreated(BaseModel):
    order_token: uuid.UUID
    short_code: str
    expires_at: Optional[datetime] = None


class PublicOrderItemRead(BaseModel):
    product_name: str
    qty: int
    unit_price: float


class PublicOrderRead(BaseModel):
    short_code: str
    status: str
    expires_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    paid: bool
    total: float
    items: List[PublicOrderItemRead]
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None


def _security_headers(response: Response, max_age: int = 0) -> None:
    if max_age > 0:
        response.headers["Cache-Control"] = f"public, max-age={max_age}, s-maxage={max_age}"
    else:
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


async def _get_settings_by_token(session: AsyncSession, public_token: uuid.UUID) -> StoreSettings:
    settings = (
        await session.execute(
            select(StoreSettings).where(
                StoreSettings.public_token == public_token,
                StoreSettings.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")
    return settings


async def _get_tenant(session: AsyncSession, tenant_id: uuid.UUID) -> Optional[Tenant]:
    return (
        await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()


@router.get("/catalog/{public_token}", response_model=PublicCatalogRead)
@limiter.limit("20/minute")
async def get_public_catalog(
    public_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    await expire_stale_orders(session, settings.tenant_id)
    tenant = await _get_tenant(session, settings.tenant_id)

    result = await session.execute(
        select(StoreProduct).where(
            StoreProduct.tenant_id == settings.tenant_id,
            StoreProduct.is_active == True,  # noqa: E712
            StoreProduct.is_published == True,  # noqa: E712
        ).order_by(StoreProduct.name)
    )
    products = result.scalars().all()
    published_ids = {p.id for p in products}

    # Solo promociones VIGENTES (publicada, activa y hoy ∈ rango de fechas).
    # El filtrado de fechas lo hace Python para respetar el día local del negocio.
    today = now_utc().date()
    promo_rows = (
        await session.execute(
            select(StorePromotion).where(
                StorePromotion.tenant_id == settings.tenant_id,
                StorePromotion.is_active == True,  # noqa: E712
                StorePromotion.is_published == True,  # noqa: E712
            )
        )
    ).scalars().all()

    promotions: List[PublicPromotionRead] = []
    for promo in promo_rows:
        if promo.starts_on and today < promo.starts_on:
            continue
        if promo.ends_on and today > promo.ends_on:
            continue
        # Una promo de producto solo se expone si su producto está publicado
        if promo.product_id and promo.product_id not in published_ids:
            continue
        promotions.append(PublicPromotionRead(
            title=promo.title,
            promo_type=promo.promo_type,
            value=float(promo.value) if promo.value is not None else None,
            product_id=promo.product_id,
            description=promo.description,
            urgency_text=promo.urgency_text,
            ends_on=promo.ends_on.isoformat() if promo.ends_on else None,
        ))

    _security_headers(response, max_age=10)
    return PublicCatalogRead(
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
        is_open=settings.is_open,
        products=[
            PublicProductRead(
                id=p.id,
                name=p.name,
                description=p.description,
                price=float(p.price),
                compare_at_price=float(p.compare_at_price) if p.compare_at_price is not None else None,
                badge=p.badge,
                image_url=p.image_url,
                available=max(0, p.stock_qty - p.reserved_qty),
            )
            for p in products
        ],
        promotions=promotions,
    )


@router.post("/catalog/{public_token}/orders", response_model=PublicOrderCreated, status_code=201)
@limiter.limit("5/minute")
async def create_public_order(
    public_token: uuid.UUID,
    body: PublicOrderCreate,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    if not settings.is_open:
        raise HTTPException(status_code=409, detail="La tienda está cerrada en este momento")
    await expire_stale_orders(session, settings.tenant_id)

    product_ids = [i.product_id for i in body.items]
    result = await session.execute(
        select(StoreProduct)
        .where(
            StoreProduct.tenant_id == settings.tenant_id,
            StoreProduct.id.in_(product_ids),
            StoreProduct.is_active == True,  # noqa: E712
            StoreProduct.is_published == True,  # noqa: E712
        )
        .with_for_update()
    )
    products = {p.id: p for p in result.scalars().all()}

    total = Decimal("0")
    for item in body.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(status_code=409, detail="Un producto ya no está disponible")
        available = product.stock_qty - product.reserved_qty
        if item.qty > available:
            raise HTTPException(status_code=409, detail=f"Stock insuficiente: {product.name}")
        total += product.price * item.qty

    now = now_utc()
    order = StoreOrder(
        tenant_id=settings.tenant_id,
        short_code=await generate_short_code(session, settings.tenant_id),
        customer_name=body.customer_name.strip(),
        customer_phone=body.customer_phone.strip(),
        channel="catalogo",
        status="solicitado",
        expires_at=now + timedelta(minutes=settings.reservation_ttl_minutes),
        total=total,
    )
    session.add(order)
    await session.flush()

    for item in body.items:
        product = products[item.product_id]
        product.reserved_qty += item.qty
        session.add(product)
        session.add(StoreOrderItem(
            tenant_id=settings.tenant_id,
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            qty=item.qty,
            unit_price=product.price,
            unit_cost=product.cost,
        ))

    await session.commit()

    try:
        item_count = sum(i.qty for i in body.items)
        await send_push_to_tenant(
            session=session,
            tenant_id=settings.tenant_id,
            title=f"🛒 Pedido {order.short_code}",
            body=f"{body.customer_name.strip()} — {item_count} producto(s), Q{float(total):.2f}",
            data={"module": "ventas"},
        )
    except Exception:
        logger.warning("push de pedido nuevo falló order=%s", order.id, exc_info=True)

    _security_headers(response)
    return PublicOrderCreated(
        order_token=order.public_token,
        short_code=order.short_code,
        expires_at=order.expires_at,
    )


async def _get_order_by_token(session: AsyncSession, order_token: uuid.UUID) -> StoreOrder:
    order = (
        await session.execute(
            select(StoreOrder).where(
                StoreOrder.public_token == order_token,
                StoreOrder.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    if order.status == "solicitado" and order.expires_at and order.expires_at < now_utc():
        await release_reservation(session, order)
        order.status = "expirado"
        order.updated_at = now_utc()
        session.add(order)
        await session.commit()
        await session.refresh(order)
    return order


async def _build_public_order_read(session: AsyncSession, order: StoreOrder) -> PublicOrderRead:
    tenant = await _get_tenant(session, order.tenant_id)
    items = (
        await session.execute(
            select(StoreOrderItem).where(StoreOrderItem.order_id == order.id)
        )
    ).scalars().all()
    return PublicOrderRead(
        short_code=order.short_code,
        status=order.status,
        expires_at=order.expires_at,
        delivered_at=order.delivered_at,
        paid=order.paid_at is not None,
        total=float(order.total),
        items=[
            PublicOrderItemRead(
                product_name=i.product_name,
                qty=i.qty,
                unit_price=float(i.unit_price),
            )
            for i in items
        ],
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
    )


@router.get("/orders/{order_token}", response_model=PublicOrderRead)
@limiter.limit("20/minute")
async def get_public_order(
    order_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    order = await _get_order_by_token(session, order_token)
    _security_headers(response, max_age=10)
    return await _build_public_order_read(session, order)


@router.post("/orders/{order_token}/pay", response_model=PublicOrderRead)
@limiter.limit("5/minute")
async def pay_public_order(
    order_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    order = await _get_order_by_token(session, order_token)
    if order.status in ("rechazado", "expirado", "cancelado"):
        raise HTTPException(status_code=409, detail="El pedido ya no está activo")
    if order.paid_at is not None:
        raise HTTPException(status_code=409, detail="El pedido ya está pagado")

    # Pago simulado — payment_provider/payment_ref quedan listos para pasarela real
    order.paid_at = now_utc()
    order.payment_method = "simulado"
    order.payment_provider = "demo"
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()

    try:
        await send_push_to_tenant(
            session=session,
            tenant_id=order.tenant_id,
            title=f"💵 Pedido {order.short_code} pagado",
            body=f"{order.customer_name or 'Cliente'} pagó Q{float(order.total):.2f}",
            data={"module": "ventas"},
        )
    except Exception:
        logger.warning("push de pago falló order=%s", order.id, exc_info=True)

    _security_headers(response)
    return await _build_public_order_read(session, order)
