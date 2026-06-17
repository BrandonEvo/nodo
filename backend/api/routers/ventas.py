"""
MÓDULO VENTAS: catálogo público con flujo de stock
- GET    /api/ventas/settings              → Config de la tienda (auto-crea con token público)
- PATCH  /api/ventas/settings              → Editar TTL de reserva / abrir-cerrar tienda
- GET    /api/ventas/products              → Listar productos del catálogo
- POST   /api/ventas/products              → Crear producto
- PATCH  /api/ventas/products/{id}         → Editar producto
- DELETE /api/ventas/products/{id}         → Soft-delete
- GET    /api/ventas/monitor               → Pedidos + KPIs en un solo request (polling)
- POST   /api/ventas/orders/{id}/confirm   → solicitado → apartado (reserva firme)
- POST   /api/ventas/orders/{id}/reject    → solicitado → rechazado (libera stock)
- POST   /api/ventas/orders/{id}/deliver   → apartado/solicitado → entregado (descuenta stock)
- POST   /api/ventas/orders/{id}/charge    → marca pagado (efectivo en local)
- POST   /api/ventas/orders/{id}/cancel    → solicitado/apartado → cancelado (libera stock)
- POST   /api/ventas/quick-sale            → venta sin cliente, nace entregada+pagada
- POST   /api/ventas/waste                 → merma/ajuste de stock con motivo
- GET    /api/ventas/promotions            → Listar promociones (con is_live calculado)
- POST   /api/ventas/promotions            → Crear promoción / gancho de venta
- PATCH  /api/ventas/promotions/{id}       → Editar promoción
- DELETE /api/ventas/promotions/{id}       → Eliminar promoción
"""
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from api.services.store_service import (
    expire_stale_orders, generate_short_code, now_utc, release_reservation,
)
from models.store import (
    StoreOrder, StoreOrderItem, StoreProduct, StorePromotion, StoreSettings, StoreStockMove,
)
from models.schemas import (
    StoreSettingsRead, StoreSettingsUpdate,
    StoreProductCreate, StoreProductUpdate, StoreProductRead,
    StoreOrderRead, StoreOrderItemRead, StoreKpis, StoreMonitorRead,
    QuickSaleCreate, StoreWasteCreate, StoreClientRead,
    StorePromotionCreate, StorePromotionUpdate, StorePromotionRead,
)

router = APIRouter(tags=["Ventas (Catálogo)"])

LOW_STOCK_THRESHOLD = 3
WASTE_REASONS = ("se_arruino", "perdida", "correccion")
# Las fotos viajan como data-URL (mismo patrón que el logo del tenant) — tope ~500 KB
MAX_IMAGE_CHARS = 700_000


PROMO_TYPES = ("percent", "two_for_one", "compare_at", "bundle", "badge")
MAX_BADGE_CHARS = 40


def _product_to_read(p: StoreProduct) -> StoreProductRead:
    return StoreProductRead(
        id=p.id,
        name=p.name,
        description=p.description,
        price=float(p.price),
        cost=float(p.cost),
        compare_at_price=float(p.compare_at_price) if p.compare_at_price is not None else None,
        badge=p.badge,
        image_url=p.image_url,
        stock_qty=p.stock_qty,
        reserved_qty=p.reserved_qty,
        available=max(0, p.stock_qty - p.reserved_qty),
        is_published=p.is_published,
    )


def _promo_is_live(promo: StorePromotion, today: date) -> bool:
    if not promo.is_published or not promo.is_active:
        return False
    if promo.starts_on and today < promo.starts_on:
        return False
    if promo.ends_on and today > promo.ends_on:
        return False
    return True


def _promo_to_read(promo: StorePromotion, product_name: Optional[str], today: date) -> StorePromotionRead:
    return StorePromotionRead(
        id=promo.id,
        title=promo.title,
        promo_type=promo.promo_type,
        value=float(promo.value) if promo.value is not None else None,
        product_id=promo.product_id,
        product_name=product_name,
        description=promo.description,
        urgency_text=promo.urgency_text,
        starts_on=promo.starts_on,
        ends_on=promo.ends_on,
        is_published=promo.is_published,
        is_live=_promo_is_live(promo, today),
    )


def _order_to_read(o: StoreOrder) -> StoreOrderRead:
    return StoreOrderRead(
        id=o.id,
        short_code=o.short_code,
        public_token=o.public_token,
        customer_name=o.customer_name,
        customer_phone=o.customer_phone,
        channel=o.channel,
        status=o.status,
        expires_at=o.expires_at,
        delivered_at=o.delivered_at,
        paid_at=o.paid_at,
        payment_method=o.payment_method,
        total=float(o.total),
        created_at=o.created_at,
        items=[
            StoreOrderItemRead(
                product_id=i.product_id,
                product_name=i.product_name,
                qty=i.qty,
                unit_price=float(i.unit_price),
            )
            for i in o.items
        ],
    )


async def _get_or_create_settings(session: AsyncSession, tenant_id: uuid.UUID) -> StoreSettings:
    settings = (
        await session.execute(
            select(StoreSettings).where(StoreSettings.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not settings:
        settings = StoreSettings(tenant_id=tenant_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


@router.get("/settings", response_model=StoreSettingsRead)
async def get_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(session, tenant_id)
    return StoreSettingsRead(
        public_token=settings.public_token,
        is_open=settings.is_open,
        reservation_ttl_minutes=settings.reservation_ttl_minutes,
    )


@router.patch("/settings", response_model=StoreSettingsRead)
async def update_settings(
    body: StoreSettingsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(session, tenant_id)
    if body.is_open is not None:
        settings.is_open = body.is_open
    if body.reservation_ttl_minutes is not None:
        if not 5 <= body.reservation_ttl_minutes <= 1440:
            raise HTTPException(status_code=422, detail="El plazo de reserva debe estar entre 5 y 1440 minutos")
        settings.reservation_ttl_minutes = body.reservation_ttl_minutes
    settings.updated_at = now_utc()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return StoreSettingsRead(
        public_token=settings.public_token,
        is_open=settings.is_open,
        reservation_ttl_minutes=settings.reservation_ttl_minutes,
    )


@router.get("/products", response_model=list[StoreProductRead])
async def list_products(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(StoreProduct).where(
            StoreProduct.tenant_id == tenant_id,
            StoreProduct.is_active == True,  # noqa: E712
        ).order_by(StoreProduct.name)
    )
    return [_product_to_read(p) for p in result.scalars().all()]


@router.post("/products", response_model=StoreProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: StoreProductCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if body.price < 0 or body.cost < 0 or body.stock_qty < 0:
        raise HTTPException(status_code=422, detail="Precio, costo y stock deben ser positivos")
    if body.compare_at_price is not None and body.compare_at_price < 0:
        raise HTTPException(status_code=422, detail="El precio de comparación debe ser positivo")
    if body.image_url and len(body.image_url) > MAX_IMAGE_CHARS:
        raise HTTPException(status_code=422, detail="La imagen es demasiado grande")
    badge = (body.badge or "").strip()[:MAX_BADGE_CHARS] or None
    product = StoreProduct(
        tenant_id=tenant_id,
        name=body.name.strip(),
        description=body.description,
        price=Decimal(str(body.price)),
        cost=Decimal(str(body.cost)),
        compare_at_price=Decimal(str(body.compare_at_price)) if body.compare_at_price else None,
        badge=badge,
        image_url=body.image_url or None,
        stock_qty=body.stock_qty,
        is_published=body.is_published,
    )
    session.add(product)
    await session.commit()
    await session.refresh(product)
    return _product_to_read(product)


@router.patch("/products/{product_id}", response_model=StoreProductRead)
async def update_product(
    product_id: uuid.UUID,
    body: StoreProductUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    product = await session.get(StoreProduct, product_id)
    if not product or product.tenant_id != tenant_id or not product.is_active:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = body.model_dump(exclude_none=True)
    if "price" in data:
        if data["price"] < 0:
            raise HTTPException(status_code=422, detail="El precio debe ser positivo")
        data["price"] = Decimal(str(data["price"]))
    if "cost" in data:
        if data["cost"] < 0:
            raise HTTPException(status_code=422, detail="El costo debe ser positivo")
        data["cost"] = Decimal(str(data["cost"]))
    if "compare_at_price" in data:
        if data["compare_at_price"] < 0:
            raise HTTPException(status_code=422, detail="El precio de comparación debe ser positivo")
        # 0 → quitar el precio ancla (exclude_none impide mandar null)
        data["compare_at_price"] = (
            Decimal(str(data["compare_at_price"])) if data["compare_at_price"] > 0 else None
        )
    if "badge" in data:
        # "" → quitar la etiqueta
        data["badge"] = data["badge"].strip()[:MAX_BADGE_CHARS] or None
    if "stock_qty" in data and data["stock_qty"] < 0:
        raise HTTPException(status_code=422, detail="El stock debe ser positivo")
    if "name" in data:
        data["name"] = data["name"].strip()
    if "image_url" in data:
        if data["image_url"] and len(data["image_url"]) > MAX_IMAGE_CHARS:
            raise HTTPException(status_code=422, detail="La imagen es demasiado grande")
        # "" significa quitar la foto (exclude_none impide mandar null)
        if data["image_url"] == "":
            data["image_url"] = None

    for field, value in data.items():
        setattr(product, field, value)
    product.updated_at = now_utc()
    session.add(product)
    await session.commit()
    await session.refresh(product)
    return _product_to_read(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    product = await session.get(StoreProduct, product_id)
    if not product or product.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.is_active = False
    product.is_published = False
    product.updated_at = now_utc()
    session.add(product)
    await session.commit()


@router.get("/monitor", response_model=StoreMonitorRead)
async def get_monitor(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    await expire_stale_orders(session, tenant_id)

    result = await session.execute(
        select(StoreOrder)
        .options(selectinload(StoreOrder.items))
        .where(
            StoreOrder.tenant_id == tenant_id,
            StoreOrder.is_active == True,  # noqa: E712
        )
        .order_by(StoreOrder.created_at.desc())
        .limit(100)
    )
    orders = result.scalars().all()

    today_start = datetime.combine(now_utc().date(), time.min)
    cobrado_hoy = (
        await session.execute(
            select(func.coalesce(func.sum(StoreOrder.total), 0)).where(
                StoreOrder.tenant_id == tenant_id,
                StoreOrder.paid_at >= today_start,
            )
        )
    ).scalar_one()

    ganancia_hoy = (
        await session.execute(
            select(func.coalesce(
                func.sum((StoreOrderItem.unit_price - StoreOrderItem.unit_cost) * StoreOrderItem.qty), 0,
            ))
            .select_from(StoreOrderItem)
            .join(StoreOrder, StoreOrder.id == StoreOrderItem.order_id)
            .where(
                StoreOrder.tenant_id == tenant_id,
                StoreOrder.paid_at >= today_start,
            )
        )
    ).scalar_one()

    invertido = (
        await session.execute(
            select(func.coalesce(func.sum(StoreProduct.cost * StoreProduct.stock_qty), 0)).where(
                StoreProduct.tenant_id == tenant_id,
                StoreProduct.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one()

    stock_critico = (
        await session.execute(
            select(func.count()).select_from(StoreProduct).where(
                StoreProduct.tenant_id == tenant_id,
                StoreProduct.is_active == True,  # noqa: E712
                StoreProduct.is_published == True,  # noqa: E712
                (StoreProduct.stock_qty - StoreProduct.reserved_qty) <= LOW_STOCK_THRESHOLD,
            )
        )
    ).scalar_one()

    kpis = StoreKpis(
        nuevos=sum(1 for o in orders if o.status == "solicitado"),
        por_entregar=sum(1 for o in orders if o.status == "apartado"),
        por_cobrar=sum(1 for o in orders if o.status == "entregado" and o.paid_at is None),
        cobrado_hoy=float(cobrado_hoy),
        ganancia_hoy=float(ganancia_hoy),
        invertido=float(invertido),
        stock_critico=stock_critico,
    )
    return StoreMonitorRead(orders=[_order_to_read(o) for o in orders], kpis=kpis)


@router.get("/clients", response_model=list[StoreClientRead])
async def list_clients(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(
                StoreOrder.customer_phone,
                func.max(StoreOrder.customer_name).label("customer_name"),
                func.count().label("orders_count"),
                func.coalesce(
                    func.sum(StoreOrder.total).filter(StoreOrder.paid_at != None), 0,  # noqa: E711
                ).label("total_paid"),
                func.max(StoreOrder.created_at).label("last_order_at"),
            )
            .where(
                StoreOrder.tenant_id == tenant_id,
                StoreOrder.is_active == True,  # noqa: E712
                StoreOrder.customer_phone != None,  # noqa: E711
                StoreOrder.customer_phone != "",
            )
            .group_by(StoreOrder.customer_phone)
            .order_by(func.max(StoreOrder.created_at).desc())
        )
    ).all()
    return [
        StoreClientRead(
            customer_phone=r.customer_phone,
            customer_name=r.customer_name or "Cliente",
            orders_count=r.orders_count,
            total_paid=float(r.total_paid),
            last_order_at=r.last_order_at,
        )
        for r in rows
    ]


@router.get("/orders", response_model=list[StoreOrderRead])
async def list_orders(
    customer_phone: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(StoreOrder)
        .options(selectinload(StoreOrder.items))
        .where(
            StoreOrder.tenant_id == tenant_id,
            StoreOrder.is_active == True,  # noqa: E712
        )
    )
    if customer_phone:
        stmt = stmt.where(StoreOrder.customer_phone == customer_phone)
    stmt = stmt.order_by(StoreOrder.created_at.desc()).limit(limit)
    result = await session.execute(stmt)
    return [_order_to_read(o) for o in result.scalars().all()]


async def _get_order(session: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID) -> StoreOrder:
    result = await session.execute(
        select(StoreOrder)
        .options(selectinload(StoreOrder.items))
        .where(StoreOrder.id == order_id, StoreOrder.tenant_id == tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order or not order.is_active:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return order


@router.post("/orders/{order_id}/confirm", response_model=StoreOrderRead)
async def confirm_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    await expire_stale_orders(session, tenant_id)
    order = await _get_order(session, tenant_id, order_id)
    if order.status != "solicitado":
        raise HTTPException(status_code=409, detail="El pedido ya no está en estado solicitado")
    order.status = "apartado"
    order.expires_at = None
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _order_to_read(order)


@router.post("/orders/{order_id}/reject", response_model=StoreOrderRead)
async def reject_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await _get_order(session, tenant_id, order_id)
    if order.status != "solicitado":
        raise HTTPException(status_code=409, detail="Solo se pueden rechazar pedidos solicitados")
    await release_reservation(session, order)
    order.status = "rechazado"
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _order_to_read(order)


@router.post("/orders/{order_id}/deliver", response_model=StoreOrderRead)
async def deliver_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    await expire_stale_orders(session, tenant_id)
    order = await _get_order(session, tenant_id, order_id)
    if order.status not in ("solicitado", "apartado"):
        raise HTTPException(status_code=409, detail="El pedido no está pendiente de entrega")

    for item in order.items:
        product = await session.get(StoreProduct, item.product_id)
        if product:
            product.stock_qty = max(0, product.stock_qty - item.qty)
            product.reserved_qty = max(0, product.reserved_qty - item.qty)
            session.add(product)

    order.status = "entregado"
    order.delivered_at = now_utc()
    order.expires_at = None
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _order_to_read(order)


@router.post("/orders/{order_id}/charge", response_model=StoreOrderRead)
async def charge_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await _get_order(session, tenant_id, order_id)
    if order.status in ("rechazado", "expirado", "cancelado"):
        raise HTTPException(status_code=409, detail="El pedido ya no está activo")
    if order.paid_at is not None:
        raise HTTPException(status_code=409, detail="El pedido ya está pagado")
    order.paid_at = now_utc()
    order.payment_method = "efectivo"
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _order_to_read(order)


@router.post("/orders/{order_id}/cancel", response_model=StoreOrderRead)
async def cancel_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await _get_order(session, tenant_id, order_id)
    if order.status not in ("solicitado", "apartado"):
        raise HTTPException(status_code=409, detail="Solo se pueden cancelar pedidos pendientes")
    await release_reservation(session, order)
    order.status = "cancelado"
    order.expires_at = None
    order.updated_at = now_utc()
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return _order_to_read(order)


@router.post("/quick-sale", response_model=StoreOrderRead, status_code=status.HTTP_201_CREATED)
async def quick_sale(
    body: QuickSaleCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.items:
        raise HTTPException(status_code=422, detail="La venta necesita al menos un producto")

    product_ids = [i.product_id for i in body.items]
    result = await session.execute(
        select(StoreProduct)
        .where(
            StoreProduct.tenant_id == tenant_id,
            StoreProduct.id.in_(product_ids),
            StoreProduct.is_active == True,  # noqa: E712
        )
        .with_for_update()
    )
    products = {p.id: p for p in result.scalars().all()}

    total = Decimal("0")
    for item in body.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        if item.qty < 1:
            raise HTTPException(status_code=422, detail="Cantidad inválida")
        available = product.stock_qty - product.reserved_qty
        if item.qty > available:
            raise HTTPException(status_code=409, detail=f"Stock insuficiente: {product.name}")

    now = now_utc()
    order = StoreOrder(
        tenant_id=tenant_id,
        short_code=await generate_short_code(session, tenant_id),
        channel="mostrador",
        status="entregado",
        delivered_at=now,
        paid_at=now,
        payment_method=body.payment_method,
    )
    session.add(order)
    await session.flush()

    for item in body.items:
        product = products[item.product_id]
        unit_price = Decimal(str(item.unit_price)) if item.unit_price is not None else product.price
        if unit_price < 0:
            raise HTTPException(status_code=422, detail="Precio inválido")
        total += unit_price * item.qty
        product.stock_qty -= item.qty
        session.add(product)
        session.add(StoreOrderItem(
            tenant_id=tenant_id,
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            qty=item.qty,
            unit_price=unit_price,
            unit_cost=product.cost,
        ))

    order.total = total
    session.add(order)
    await session.commit()

    result = await session.execute(
        select(StoreOrder).options(selectinload(StoreOrder.items)).where(StoreOrder.id == order.id)
    )
    return _order_to_read(result.scalar_one())


@router.post("/waste", response_model=list[StoreProductRead])
async def register_waste(
    body: StoreWasteCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.items:
        raise HTTPException(status_code=422, detail="La merma necesita al menos un producto")
    if body.reason not in WASTE_REASONS:
        raise HTTPException(status_code=422, detail="Motivo inválido")

    product_ids = [i.product_id for i in body.items]
    result = await session.execute(
        select(StoreProduct)
        .where(
            StoreProduct.tenant_id == tenant_id,
            StoreProduct.id.in_(product_ids),
            StoreProduct.is_active == True,  # noqa: E712
        )
        .with_for_update()
    )
    products = {p.id: p for p in result.scalars().all()}

    for item in body.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        if item.qty < 1:
            raise HTTPException(status_code=422, detail="Cantidad inválida")
        available = product.stock_qty - product.reserved_qty
        if item.qty > available:
            raise HTTPException(status_code=409, detail=f"Stock insuficiente: {product.name}")

    move_type = "ajuste" if body.reason == "correccion" else "merma"
    for item in body.items:
        product = products[item.product_id]
        product.stock_qty -= item.qty
        product.updated_at = now_utc()
        session.add(product)
        session.add(StoreStockMove(
            tenant_id=tenant_id,
            product_id=product.id,
            qty=-item.qty,
            move_type=move_type,
            reason=body.reason,
            note=body.note,
        ))

    await session.commit()
    return [_product_to_read(products[i.product_id]) for i in body.items]


# ── Promociones / ganchos de venta ──────────────────────────────────────────

async def _product_names(session: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, str]:
    rows = (
        await session.execute(
            select(StoreProduct.id, StoreProduct.name).where(
                StoreProduct.tenant_id == tenant_id,
                StoreProduct.is_active == True,  # noqa: E712
            )
        )
    ).all()
    return {r.id: r.name for r in rows}


async def _validate_promo(
    session: AsyncSession, tenant_id: uuid.UUID,
    promo_type: str, value: Optional[float], product_id: Optional[uuid.UUID],
    starts_on: Optional[date], ends_on: Optional[date],
) -> None:
    if promo_type not in PROMO_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de promoción inválido")
    if promo_type == "percent":
        if value is None or not 1 <= value <= 90:
            raise HTTPException(status_code=422, detail="El descuento debe estar entre 1% y 90%")
    if promo_type == "bundle" and (value is None or value < 0):
        raise HTTPException(status_code=422, detail="El precio del combo debe ser positivo")
    if starts_on and ends_on and ends_on < starts_on:
        raise HTTPException(status_code=422, detail="La fecha de fin no puede ser anterior al inicio")
    if product_id is not None:
        product = await session.get(StoreProduct, product_id)
        if not product or product.tenant_id != tenant_id or not product.is_active:
            raise HTTPException(status_code=404, detail="Producto no encontrado")


@router.get("/promotions", response_model=list[StorePromotionRead])
async def list_promotions(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(StorePromotion).where(
            StorePromotion.tenant_id == tenant_id,
            StorePromotion.is_active == True,  # noqa: E712
        ).order_by(StorePromotion.created_at.desc())
    )
    promos = result.scalars().all()
    names = await _product_names(session, tenant_id)
    today = now_utc().date()
    return [
        _promo_to_read(p, names.get(p.product_id) if p.product_id else None, today)
        for p in promos
    ]


@router.post("/promotions", response_model=StorePromotionRead, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    body: StorePromotionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="La promoción necesita un título")
    await _validate_promo(
        session, tenant_id, body.promo_type, body.value, body.product_id,
        body.starts_on, body.ends_on,
    )
    promo = StorePromotion(
        tenant_id=tenant_id,
        product_id=body.product_id,
        title=body.title.strip()[:80],
        promo_type=body.promo_type,
        value=Decimal(str(body.value)) if body.value is not None else None,
        description=(body.description or "").strip()[:200] or None,
        urgency_text=(body.urgency_text or "").strip()[:80] or None,
        starts_on=body.starts_on,
        ends_on=body.ends_on,
        is_published=body.is_published,
    )
    session.add(promo)
    await session.commit()
    await session.refresh(promo)
    names = await _product_names(session, tenant_id)
    return _promo_to_read(promo, names.get(promo.product_id) if promo.product_id else None, now_utc().date())


@router.patch("/promotions/{promo_id}", response_model=StorePromotionRead)
async def update_promotion(
    promo_id: uuid.UUID,
    body: StorePromotionUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    promo = await session.get(StorePromotion, promo_id)
    if not promo or promo.tenant_id != tenant_id or not promo.is_active:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")

    data = body.model_dump(exclude_unset=True)
    new_type = data.get("promo_type", promo.promo_type)
    new_value = data.get("value", float(promo.value) if promo.value is not None else None)
    new_product = data.get("product_id", promo.product_id)
    new_start = data.get("starts_on", promo.starts_on)
    new_end = data.get("ends_on", promo.ends_on)
    if any(k in data for k in ("promo_type", "value", "product_id", "starts_on", "ends_on")):
        await _validate_promo(session, tenant_id, new_type, new_value, new_product, new_start, new_end)

    if "title" in data:
        if not data["title"].strip():
            raise HTTPException(status_code=422, detail="La promoción necesita un título")
        promo.title = data["title"].strip()[:80]
    if "promo_type" in data:
        promo.promo_type = data["promo_type"]
    if "value" in data:
        promo.value = Decimal(str(data["value"])) if data["value"] is not None else None
    if "product_id" in data:
        promo.product_id = data["product_id"]
    if "description" in data:
        promo.description = (data["description"] or "").strip()[:200] or None
    if "urgency_text" in data:
        promo.urgency_text = (data["urgency_text"] or "").strip()[:80] or None
    if "starts_on" in data:
        promo.starts_on = data["starts_on"]
    if "ends_on" in data:
        promo.ends_on = data["ends_on"]
    if "is_published" in data:
        promo.is_published = data["is_published"]

    promo.updated_at = now_utc()
    session.add(promo)
    await session.commit()
    await session.refresh(promo)
    names = await _product_names(session, tenant_id)
    return _promo_to_read(promo, names.get(promo.product_id) if promo.product_id else None, now_utc().date())


@router.delete("/promotions/{promo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promo_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    promo = await session.get(StorePromotion, promo_id)
    if not promo or promo.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    promo.is_active = False
    promo.is_published = False
    promo.updated_at = now_utc()
    session.add(promo)
    await session.commit()
