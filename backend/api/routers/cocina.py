"""
MÓDULO 3: COCINA — Producción y Merma
- GET    /api/cocina/orders                  → Listar órdenes del día
- POST   /api/cocina/orders                  → Crear orden de producción
- PATCH  /api/cocina/orders/{id}/start       → Iniciar orden (pending → en_proceso)
- PATCH  /api/cocina/orders/{id}/complete    → Completar (en_proceso → completed) + descuenta Bodega
- POST   /api/cocina/orders/{id}/waste       → Registrar merma
- DELETE /api/cocina/orders/{id}             → Baja lógica
- GET    /api/cocina/daily-summary           → Resumen diario de producción
"""
import uuid
from datetime import datetime, timezone, date as date_type
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import ProductionOrder, WasteLog, Recipe, RecipeIngredient, InventoryItem
from models.schemas import (
    ProductionOrderCreate, ProductionOrderComplete, ProductionOrderRead,
    WasteLogCreate, WasteLogRead, OrderPreview, OrderPreviewIngredient,
    DailySummaryRead, MatrixResponse, MatrixRecipeRow, DayCell,
)
from api.services.recipe_calculator import RecipeCalculator
from api.services.push_service import send_push_to_tenant

router = APIRouter(tags=["Cocina (Producción)"])


async def _build_order_read(order: ProductionOrder, session: AsyncSession) -> ProductionOrderRead:
    recipe = await session.get(Recipe, order.recipe_id)
    return ProductionOrderRead(
        id=order.id,
        tenant_id=order.tenant_id,
        recipe_id=order.recipe_id,
        recipe_name=recipe.name if recipe else "Sin nombre",
        quantity=order.quantity,
        actual_units=order.actual_units,
        status=order.status,
        started_at=order.started_at,
        completed_at=order.completed_at,
        created_at=order.created_at,
        harina_lbs=float(order.harina_lbs) if order.harina_lbs is not None else None,
        costo_produccion=float(order.costo_produccion) if order.costo_produccion is not None else None,
        venta_esperada=float(order.venta_esperada) if order.venta_esperada is not None else None,
        utilidad_diaria=float(order.utilidad_diaria) if order.utilidad_diaria is not None else None,
        production_date=order.production_date,
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


@router.get("/preview/{recipe_id}", response_model=OrderPreview)
async def preview_order(
    recipe_id: uuid.UUID,
    quantity: int = 1,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, recipe_id)
    if not recipe or recipe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    ing_result = await session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == recipe_id,
            RecipeIngredient.is_active == True,
        )
    )
    ingredients: list[OrderPreviewIngredient] = []
    for ing in ing_result.scalars().all():
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item and item.tenant_id == tenant_id:
            required = ing.quantity * quantity
            ingredients.append(OrderPreviewIngredient(
                name=item.name,
                unit=item.unit,
                required=required,
                available=item.current_stock,
                sufficient=item.current_stock >= required,
            ))

    return OrderPreview(
        recipe_id=recipe.id,
        recipe_name=recipe.name,
        estimated_yield=recipe.estimated_yield,
        total_units=recipe.estimated_yield * quantity,
        estimated_cost=recipe.estimated_cost * quantity,
        ingredients=ingredients,
    )


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
    body: ProductionOrderComplete = ProductionOrderComplete(),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    order = await session.get(ProductionOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status not in ("pending", "en_proceso"):
        raise HTTPException(status_code=400, detail="La orden ya fue completada")

    actual_units = body.actual_units if body.actual_units is not None else order.quantity

    # Calcular métricas de producción diaria
    recipe = await session.get(Recipe, order.recipe_id)

    # Descontar insumos de Bodega usando Baker's %:
    # flour_lbs = actual_units / panes_por_libra_harina
    # deduction_per_ingredient = (bakers_percent/100) * flour_lbs
    flour_lbs = (
        actual_units / recipe.panes_por_libra_harina
        if recipe and recipe.panes_por_libra_harina
        else None
    )
    ing_result = await session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == order.recipe_id,
            RecipeIngredient.is_active == True,
        )
    )
    for ing in ing_result.scalars().all():
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item and item.tenant_id == tenant_id and flour_lbs is not None:
            deduction = (float(ing.bakers_percent) / 100.0) * flour_lbs
            item.current_stock = max(0.0, item.current_stock - deduction)
            item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(item)
    harina_lbs = None
    costo_produccion = None
    venta_esperada = None
    utilidad_diaria = None

    if recipe and recipe.panes_por_libra_harina and recipe.panes_por_libra_harina > 0:
        harina_lbs = Decimal(str(actual_units)) / Decimal(str(recipe.panes_por_libra_harina))
        try:
            calc = await RecipeCalculator.calculate(
                db=session,
                recipe_id=order.recipe_id,
                tenant_id=tenant_id,
            )
            costo_produccion = (Decimal(str(calc["costo_formulacion_qq"])) / Decimal("100")) * harina_lbs
        except Exception:
            costo_produccion = None

        venta_esperada = Decimal(str(recipe.sell_price)) * Decimal(str(actual_units))
        if costo_produccion is not None:
            utilidad_diaria = venta_esperada - costo_produccion

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order.status = "completed"
    order.completed_at = now
    order.updated_at = now
    if not order.started_at:
        order.started_at = now
    order.actual_units = actual_units
    order.harina_lbs = harina_lbs
    order.costo_produccion = costo_produccion
    order.venta_esperada = venta_esperada
    order.utilidad_diaria = utilidad_diaria
    order.production_date = date_type.today()
    session.add(order)
    await session.commit()
    await session.refresh(order)

    recipe_name = recipe.name if recipe else "Receta"
    await send_push_to_tenant(
        session=session,
        tenant_id=tenant_id,
        title="✓ Lote completado",
        body=f"{recipe_name} — {int(actual_units)} unidades listas",
        data={"module": "cocina"},
    )

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


@router.get("/daily-summary", response_model=DailySummaryRead)
async def daily_summary(
    date: date_type = Query(default=None),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    target = date or date_type.today()
    result = await session.execute(
        select(ProductionOrder).where(
            ProductionOrder.tenant_id == tenant_id,
            ProductionOrder.is_active == True,
            ProductionOrder.status == "completed",
            ProductionOrder.production_date == target,
        )
    )
    orders = result.scalars().all()
    return DailySummaryRead(
        date=target,
        orders_count=len(orders),
        harina_total_lbs=round(sum(float(o.harina_lbs) for o in orders if o.harina_lbs is not None), 2),
        costo_total=round(sum(float(o.costo_produccion) for o in orders if o.costo_produccion is not None), 2),
        venta_total=round(sum(float(o.venta_esperada) for o in orders if o.venta_esperada is not None), 2),
        utilidad_total=round(sum(float(o.utilidad_diaria) for o in orders if o.utilidad_diaria is not None), 2),
    )


@router.get("/matriz-mensual", response_model=MatrixResponse)
async def matriz_mensual(
    year: int = Query(..., ge=2020, le=2099),
    month: int = Query(..., ge=1, le=12),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    from collections import defaultdict

    month_start = date_type(year, month, 1)
    if month == 12:
        month_end = date_type(year + 1, 1, 1)
    else:
        month_end = date_type(year, month + 1, 1)

    result = await session.execute(
        select(ProductionOrder, Recipe.name, Recipe.sell_price)
        .join(Recipe, ProductionOrder.recipe_id == Recipe.id)
        .where(
            ProductionOrder.tenant_id == tenant_id,
            ProductionOrder.status == "completed",
            ProductionOrder.production_date >= month_start,
            ProductionOrder.production_date < month_end,
            ProductionOrder.is_active == True,
        )
        .order_by(ProductionOrder.production_date)
    )
    rows = result.all()

    # Structure: recipe_id → day → aggregated cell
    by_recipe: dict[uuid.UUID, dict] = {}
    daily: dict[int, dict] = defaultdict(lambda: {"harina_lbs": 0.0, "costo": 0.0, "venta": 0.0, "utilidad": 0.0})
    days_set: set[int] = set()

    for order, recipe_name, sell_price in rows:
        day = order.production_date.day
        days_set.add(day)
        rid = order.recipe_id

        if rid not in by_recipe:
            by_recipe[rid] = {
                "recipe_id": str(rid),
                "recipe_name": recipe_name,
                "sell_price": float(sell_price or 0),
                "day_cells": defaultdict(lambda: {"harina_lbs": 0.0, "costo": 0.0, "venta": 0.0, "utilidad": 0.0}),
            }

        h = float(order.harina_lbs or 0)
        c = float(order.costo_produccion or 0)
        v = float(order.venta_esperada or 0)
        u = float(order.utilidad_diaria or 0)

        cell = by_recipe[rid]["day_cells"][day]
        cell["harina_lbs"] += h
        cell["costo"] += c
        cell["venta"] += v
        cell["utilidad"] += u

        daily[day]["harina_lbs"] += h
        daily[day]["costo"] += c
        daily[day]["venta"] += v
        daily[day]["utilidad"] += u

    days_sorted = sorted(days_set)

    recipes_out: list[MatrixRecipeRow] = []
    grand = {"harina_lbs": 0.0, "costo": 0.0, "venta": 0.0, "utilidad": 0.0}

    for data in by_recipe.values():
        tot: dict = {"harina_lbs": 0.0, "costo": 0.0, "venta": 0.0, "utilidad": 0.0}
        days_cells: dict[str, DayCell] = {}
        for d, cell in data["day_cells"].items():
            days_cells[str(d)] = DayCell(**cell)
            for k in tot:
                tot[k] += cell[k]
        for k in grand:
            grand[k] += tot[k]
        recipes_out.append(MatrixRecipeRow(
            recipe_id=data["recipe_id"],
            recipe_name=data["recipe_name"],
            sell_price=data["sell_price"],
            days=days_cells,
            totals=DayCell(**tot),
        ))

    recipes_out.sort(key=lambda r: r.totals.harina_lbs, reverse=True)

    return MatrixResponse(
        year=year,
        month=month,
        days=days_sorted,
        recipes=recipes_out,
        daily_totals={str(d): DayCell(**v) for d, v in daily.items()},
        grand_totals=DayCell(**grand),
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
