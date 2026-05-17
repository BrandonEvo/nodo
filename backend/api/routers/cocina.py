"""
MÓDULO 3: COCINA — Producción y Merma
- GET    /api/cocina/orders                  → Listar órdenes del día
- POST   /api/cocina/orders                  → Crear orden de producción
- PATCH  /api/cocina/orders/{id}/start       → Iniciar orden (pending → en_proceso)
- PATCH  /api/cocina/orders/{id}/complete    → Completar (en_proceso → completed) + descuenta Bodega
- POST   /api/cocina/orders/{id}/waste       → Registrar merma
- DELETE /api/cocina/orders/{id}             → Baja lógica
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import ProductionOrder, WasteLog, Recipe, RecipeIngredient, InventoryItem
from models.schemas import (
    ProductionOrderCreate, ProductionOrderRead, WasteLogCreate, WasteLogRead,
)

router = APIRouter(tags=["Cocina (Producción)"])


async def _build_order_read(order: ProductionOrder, session: AsyncSession) -> ProductionOrderRead:
    recipe = await session.get(Recipe, order.recipe_id)
    return ProductionOrderRead(
        id=order.id,
        tenant_id=order.tenant_id,
        recipe_id=order.recipe_id,
        recipe_name=recipe.name if recipe else "Sin nombre",
        quantity=order.quantity,
        status=order.status,
        started_at=order.started_at,
        completed_at=order.completed_at,
        created_at=order.created_at,
    )


@router.get("/orders", response_model=list[ProductionOrderRead])
async def list_orders(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ProductionOrder)
        .where(ProductionOrder.tenant_id == tenant_id, ProductionOrder.is_active == True)
        .order_by(ProductionOrder.created_at.desc())
    )
    orders = result.scalars().all()
    return [await _build_order_read(o, session) for o in orders]


@router.post("/orders", response_model=ProductionOrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: ProductionOrderCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, body.recipe_id)
    if not recipe or recipe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    order = ProductionOrder(
        recipe_id=body.recipe_id,
        quantity=body.quantity,
        status="pending",
        tenant_id=tenant_id,
    )
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return await _build_order_read(order, session)


@router.patch("/orders/{order_id}/start", response_model=ProductionOrderRead)
async def start_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await session.get(ProductionOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"La orden está en estado '{order.status}', no se puede iniciar")

    order.status = "en_proceso"
    order.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
    order.updated_at = order.started_at
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return await _build_order_read(order, session)


@router.patch("/orders/{order_id}/complete", response_model=ProductionOrderRead)
async def complete_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await session.get(ProductionOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status not in ("pending", "en_proceso"):
        raise HTTPException(status_code=400, detail="La orden ya fue completada")

    # Descontar insumos de Bodega automáticamente
    ing_result = await session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == order.recipe_id,
            RecipeIngredient.is_active == True,
        )
    )
    for ing in ing_result.scalars().all():
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item and item.tenant_id == tenant_id:
            item.current_stock = max(0.0, item.current_stock - (ing.quantity * order.quantity))
            item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(item)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order.status = "completed"
    order.completed_at = now
    order.updated_at = now
    if not order.started_at:
        order.started_at = now
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return await _build_order_read(order, session)


@router.post("/orders/{order_id}/waste", response_model=WasteLogRead, status_code=status.HTTP_201_CREATED)
async def log_waste(
    order_id: uuid.UUID,
    body: WasteLogCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await session.get(ProductionOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    log = WasteLog(
        production_order_id=order_id,
        quantity=body.quantity,
        reason=body.reason,
        tenant_id=tenant_id,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return WasteLogRead(
        id=log.id,
        production_order_id=log.production_order_id,
        quantity=log.quantity,
        reason=log.reason,
        created_at=log.created_at,
    )


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await session.get(ProductionOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status == "en_proceso":
        raise HTTPException(status_code=400, detail="No se puede eliminar una orden en proceso")
    order.is_active = False
    order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(order)
    await session.commit()
