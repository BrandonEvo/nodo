"""
MÓDULO 1: BODEGA — Inventario de Materia Prima
- GET    /api/bodega/items          → Listar insumos del tenant
- POST   /api/bodega/items          → Crear insumo
- PATCH  /api/bodega/items/{id}     → Editar nombre/unidad/mínimo
- PATCH  /api/bodega/items/{id}/adjust → Ajustar stock (+/-)
- DELETE /api/bodega/items/{id}     → Baja lógica
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import InventoryItem, InventoryPriceHistory, StockMovement
from models.schemas import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemRead, StockAdjust, PriceHistoryRead, StockMovementRead
)
from api.helpers import recalculate_recipes_using_item

router = APIRouter(tags=["Bodega (Inventario)"])


@router.get("/items", response_model=list[InventoryItemRead])
async def list_items(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem)
        .where(InventoryItem.tenant_id == tenant_id, InventoryItem.is_active == True)
        .order_by(InventoryItem.name)
    )
    return result.scalars().all()


@router.post("/items", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: InventoryItemCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = InventoryItem(**body.model_dump(), tenant_id=tenant_id)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=InventoryItemRead)
async def update_item(
    item_id: uuid.UUID,
    body: InventoryItemUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = await session.get(InventoryItem, item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/items/{item_id}/adjust", response_model=InventoryItemRead)
async def adjust_stock(
    item_id: uuid.UUID,
    body: StockAdjust,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = await session.get(InventoryItem, item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    price_changed = False
    if body.adjust_type == "entrada":
        item.current_stock += body.quantity
        if body.unit_cost is not None and body.unit_cost > 0 and body.unit_cost != item.last_unit_cost:
            item.last_unit_cost = body.unit_cost
            price_changed = True
    else:
        item.current_stock = max(0.0, item.current_stock - body.quantity)
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    await session.commit()
    await session.refresh(item)

    session.add(StockMovement(
        inventory_item_id=item.id,
        tenant_id=tenant_id,
        move_type=body.adjust_type,
        quantity=body.quantity,
        unit_cost=body.unit_cost if body.adjust_type == "entrada" else None,
        stock_after=item.current_stock,
    ))

    if price_changed:
        session.add(InventoryPriceHistory(
            inventory_item_id=item.id,
            tenant_id=tenant_id,
            unit_cost=item.last_unit_cost,
        ))
        await recalculate_recipes_using_item(item.id, tenant_id, session)

    await session.commit()
    return item


@router.get("/items/{item_id}/price-history", response_model=list[PriceHistoryRead])
async def get_price_history(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = await session.get(InventoryItem, item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    result = await session.execute(
        select(InventoryPriceHistory)
        .where(InventoryPriceHistory.inventory_item_id == item_id)
        .order_by(InventoryPriceHistory.recorded_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.get("/items/{item_id}/movements", response_model=list[StockMovementRead])
async def get_movements(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = await session.get(InventoryItem, item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    result = await session.execute(
        select(StockMovement)
        .where(StockMovement.inventory_item_id == item_id)
        .order_by(StockMovement.recorded_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = await session.get(InventoryItem, item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    item.is_active = False
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    await session.commit()
