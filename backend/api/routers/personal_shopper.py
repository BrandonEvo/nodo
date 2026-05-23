"""
MÓDULO 8: PERSONAL SHOPPER
- GET    /api/personal-shopper/          → Listar pedidos del tenant
- POST   /api/personal-shopper/          → Crear pedido (manual o desde calculadora)
- PATCH  /api/personal-shopper/{id}      → Actualizar pedido
- DELETE /api/personal-shopper/{id}      → Soft-delete
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import ShopperOrder, ShopperOrderStatus
from models.schemas import ShopperOrderCreate, ShopperOrderUpdate, ShopperOrderRead

router = APIRouter(tags=["Personal Shopper"])


def _to_read(o: ShopperOrder) -> ShopperOrderRead:
    return ShopperOrderRead(
        id=o.id,
        tenant_id=o.tenant_id,
        client_name=o.client_name,
        client_phone=o.client_phone,
        product_description=o.product_description,
        quantity=o.quantity,
        unit=o.unit,
        delivery_date=o.delivery_date,
        status=o.status,
        quoted_price=float(o.quoted_price) if o.quoted_price is not None else None,
        notes=o.notes,
        is_active=o.is_active,
        created_at=o.created_at,
        updated_at=o.updated_at,
        calc_product_price_usd=float(o.calc_product_price_usd) if o.calc_product_price_usd is not None else None,
        calc_tax_usd=float(o.calc_tax_usd)                     if o.calc_tax_usd           is not None else None,
        calc_shipping_usd=float(o.calc_shipping_usd)           if o.calc_shipping_usd      is not None else None,
        calc_total_cost_usd=float(o.calc_total_cost_usd)       if o.calc_total_cost_usd    is not None else None,
        calc_total_cost_gtq=float(o.calc_total_cost_gtq)       if o.calc_total_cost_gtq    is not None else None,
        calc_profit_gtq=float(o.calc_profit_gtq)               if o.calc_profit_gtq        is not None else None,
        calc_margin_pct=float(o.calc_margin_pct)               if o.calc_margin_pct        is not None else None,
        calc_exchange_rate=float(o.calc_exchange_rate)         if o.calc_exchange_rate     is not None else None,
        calc_tax_rate=float(o.calc_tax_rate)                   if o.calc_tax_rate          is not None else None,
        calc_weight_lbs=float(o.calc_weight_lbs)               if o.calc_weight_lbs        is not None else None,
        calc_cost_per_lb=float(o.calc_cost_per_lb)             if o.calc_cost_per_lb       is not None else None,
        tracking_token=o.tracking_token,
        tracking_status=o.tracking_status,
        tracking_note=o.tracking_note,
        tracking_updated_at=o.tracking_updated_at,
    )


@router.get("/", response_model=list[ShopperOrderRead])
async def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    q = select(ShopperOrder).where(
        ShopperOrder.tenant_id == tenant_id,
        ShopperOrder.is_active == True,
    ).order_by(ShopperOrder.created_at.desc())

    if status_filter:
        q = q.where(ShopperOrder.status == status_filter)

    result = await session.execute(q)
    return [_to_read(o) for o in result.scalars().all()]


@router.post("/", response_model=ShopperOrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: ShopperOrderCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # Validar status
    valid = {s.value for s in ShopperOrderStatus}
    if body.status not in valid:
        raise HTTPException(status_code=422, detail=f"Status inválido. Opciones: {valid}")

    order = ShopperOrder(
        tenant_id=tenant_id,
        client_name=body.client_name,
        client_phone=body.client_phone,
        product_description=body.product_description,
        quantity=body.quantity,
        unit=body.unit,
        delivery_date=body.delivery_date,
        status=body.status,
        quoted_price=Decimal(str(body.quoted_price)) if body.quoted_price is not None else None,
        notes=body.notes,
    )

    # Adjuntar snapshot de calculadora si viene
    if body.calc:
        c = body.calc
        order.calc_product_price_usd = Decimal(str(c.product_price_usd))
        order.calc_tax_usd           = Decimal(str(c.tax_usd))
        order.calc_shipping_usd      = Decimal(str(c.shipping_usd))
        order.calc_total_cost_usd    = Decimal(str(c.total_cost_usd))
        order.calc_total_cost_gtq    = Decimal(str(c.total_cost_gtq))
        order.calc_profit_gtq        = Decimal(str(c.profit_gtq))
        order.calc_margin_pct        = Decimal(str(c.margin_pct))
        order.calc_exchange_rate     = Decimal(str(c.exchange_rate))
        order.calc_tax_rate          = Decimal(str(c.tax_rate))
        order.calc_weight_lbs        = Decimal(str(c.weight_lbs))
        order.calc_cost_per_lb       = Decimal(str(c.cost_per_lb))

    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _to_read(order)


@router.patch("/{order_id}", response_model=ShopperOrderRead)
async def update_order(
    order_id: uuid.UUID,
    body: ShopperOrderUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperOrder).where(
            ShopperOrder.id == order_id,
            ShopperOrder.tenant_id == tenant_id,
            ShopperOrder.is_active == True,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    if body.status is not None:
        valid = {s.value for s in ShopperOrderStatus}
        if body.status not in valid:
            raise HTTPException(status_code=422, detail=f"Status inválido. Opciones: {valid}")

    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "quoted_price" and value is not None:
            setattr(order, field, Decimal(str(value)))
        else:
            setattr(order, field, value)

    if "tracking_status" in changes:
        order.tracking_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _to_read(order)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperOrder).where(
            ShopperOrder.id == order_id,
            ShopperOrder.tenant_id == tenant_id,
            ShopperOrder.is_active == True,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    order.is_active = False
    order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(order)
    await session.commit()
