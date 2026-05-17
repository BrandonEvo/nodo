"""
MÓDULO 4: MOSTRADOR — Punto de Venta (POS)
- GET  /api/mostrador/products    → Listar recetas activas como productos de venta
- POST /api/mostrador/sales       → Registrar una venta completa
- GET  /api/mostrador/sales       → Listar ventas del día actual
"""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import Recipe, Sale, SaleItem
from models.schemas import (
    RecipeRead, SaleCreate, SaleRead, SaleItemRead,
)

router = APIRouter(tags=["Mostrador (POS)"])


@router.get("/products", response_model=list[RecipeRead])
async def list_products(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Retorna las recetas activas del tenant para usarlas como productos de venta."""
    result = await session.execute(
        select(Recipe)
        .where(Recipe.tenant_id == tenant_id, Recipe.is_active == True)
        .order_by(Recipe.name)
    )
    return result.scalars().all()


@router.post("/sales", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
async def create_sale(
    body: SaleCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Registra una venta completa con sus ítems."""
    if not body.items:
        raise HTTPException(status_code=400, detail="La venta debe tener al menos un ítem")

    total = sum(item.price * item.quantity for item in body.items)
    sale = Sale(
        tenant_id=tenant_id,
        total=total,
        payment_method=body.payment_method,
    )
    session.add(sale)
    await session.flush()  # Obtener sale.id sin hacer commit aún

    items_read: list[SaleItemRead] = []
    for item_data in body.items:
        recipe = await session.get(Recipe, item_data.recipe_id)
        if not recipe or recipe.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail=f"Receta {item_data.recipe_id} no encontrada")

        sale_item = SaleItem(
            tenant_id=tenant_id,
            sale_id=sale.id,
            recipe_id=item_data.recipe_id,
            quantity=item_data.quantity,
            price=item_data.price,
            freshness_tag=item_data.freshness_tag,
        )
        session.add(sale_item)
        await session.flush()

        items_read.append(SaleItemRead(
            id=sale_item.id,
            recipe_id=sale_item.recipe_id,
            recipe_name=recipe.name,
            quantity=sale_item.quantity,
            price=sale_item.price,
            freshness_tag=sale_item.freshness_tag,
        ))

    await session.commit()
    await session.refresh(sale)

    return SaleRead(
        id=sale.id,
        tenant_id=sale.tenant_id,
        total=sale.total,
        payment_method=sale.payment_method,
        created_at=sale.created_at,
        items=items_read,
    )


@router.get("/sales", response_model=list[SaleRead])
async def list_today_sales(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Lista las ventas del día actual del tenant."""
    today_start = datetime.combine(date.today(), datetime.min.time())

    result = await session.execute(
        select(Sale)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            Sale.created_at >= today_start,
        )
        .order_by(Sale.created_at.desc())
    )
    sales = result.scalars().all()

    sales_read = []
    for sale in sales:
        items_result = await session.execute(
            select(SaleItem).where(SaleItem.sale_id == sale.id, SaleItem.is_active == True)
        )
        items = items_result.scalars().all()

        items_read = []
        for si in items:
            recipe = await session.get(Recipe, si.recipe_id)
            items_read.append(SaleItemRead(
                id=si.id,
                recipe_id=si.recipe_id,
                recipe_name=recipe.name if recipe else "—",
                quantity=si.quantity,
                price=si.price,
                freshness_tag=si.freshness_tag,
            ))

        sales_read.append(SaleRead(
            id=sale.id,
            tenant_id=sale.tenant_id,
            total=sale.total,
            payment_method=sale.payment_method,
            created_at=sale.created_at,
            items=items_read,
        ))

    return sales_read
