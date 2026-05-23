"""
MÓDULO 2: RECETAS — Base de Producción
- GET    /api/recetas/                          → Listar recetas
- POST   /api/recetas/                          → Crear receta
- GET    /api/recetas/{id}                      → Detalle con ingredientes
- PATCH  /api/recetas/{id}                      → Editar receta
- DELETE /api/recetas/{id}                      → Baja lógica
- POST   /api/recetas/{id}/ingredients          → Añadir ingrediente
- DELETE /api/recetas/{id}/ingredients/{ing_id} → Quitar ingrediente
- GET    /api/recetas/constants                 → Listar constantes vigentes
- PATCH  /api/recetas/constants/{key}           → Actualizar constante (versionado temporal)
"""
import uuid
from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import Recipe, RecipeIngredient, InventoryItem, RecipeConstants
from models.schemas import (
    RecipeCreate, RecipeUpdate, RecipeRead, RecipeWithIngredients,
    RecipeIngredientCreate, RecipeIngredientUpdate, RecipeIngredientRead,
    RecipeConstantRead, RecipeConstantUpdate,
)
from api.helpers import recalculate_recipe_cost as _recalculate_cost
from api.services.recipe_calculator import RecipeCalculator
from models.schemas import RecipeCalculationOutputs

router = APIRouter(tags=["Recetas (Base de Producción)"])


# ── Constantes Globales ─────────────────────────────────────────────────────

@router.get("/constants", response_model=list[RecipeConstantRead])
async def list_constants(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    today = date.today()
    result = await session.execute(
        select(RecipeConstants).where(
            and_(
                RecipeConstants.tenant_id == tenant_id,
                RecipeConstants.is_active == True,
                RecipeConstants.effective_from <= today,
                or_(
                    RecipeConstants.effective_to == None,
                    RecipeConstants.effective_to >= today,
                ),
            )
        ).order_by(RecipeConstants.constant_key)
    )
    return result.scalars().all()


@router.patch("/constants/{key}", response_model=RecipeConstantRead)
async def update_constant(
    key: str,
    body: RecipeConstantUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    today = date.today()
    new_effective_from = body.effective_from or today

    # Buscar la constante activa vigente
    result = await session.execute(
        select(RecipeConstants).where(
            and_(
                RecipeConstants.tenant_id == tenant_id,
                RecipeConstants.constant_key == key,
                RecipeConstants.is_active == True,
                RecipeConstants.effective_from <= today,
                or_(
                    RecipeConstants.effective_to == None,
                    RecipeConstants.effective_to >= today,
                ),
            )
        ).order_by(RecipeConstants.effective_from.desc()).limit(1)
    )
    current = result.scalar_one_or_none()

    if current is None:
        raise HTTPException(status_code=404, detail=f"Constante '{key}' no encontrada")

    # Cerrar el registro vigente el día anterior al nuevo effective_from
    current.effective_to = new_effective_from - timedelta(days=1)
    current.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(current)

    description = body.description if body.description is not None else current.description
    new_constant = RecipeConstants(
        tenant_id=tenant_id,
        constant_key=key,
        value=body.value,
        description=description,
        effective_from=new_effective_from,
        effective_to=None,
    )
    session.add(new_constant)
    await session.commit()
    await session.refresh(new_constant)
    return new_constant


def _build_ingredient_read(ing: RecipeIngredient, item: InventoryItem) -> RecipeIngredientRead:
    bp = float(ing.bakers_percent)
    effective_cost = float(ing.unit_cost_override) if ing.unit_cost_override is not None else item.last_unit_cost
    # subtotal = costo proporcional por libra de harina (bp/100 × cost_por_unidad)
    subtotal = round((bp / 100.0) * effective_cost, 4)
    return RecipeIngredientRead(
        id=ing.id,
        inventory_item_id=ing.inventory_item_id,
        item_name=item.name,
        item_unit=item.unit,
        bakers_percent=bp,
        quantity=bp,  # alias retrocompatible
        unit_cost=effective_cost,
        unit_cost_override=float(ing.unit_cost_override) if ing.unit_cost_override is not None else None,
        subtotal=subtotal,
    )


@router.get("/", response_model=list[RecipeRead])
async def list_recipes(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Recipe)
        .where(Recipe.tenant_id == tenant_id, Recipe.is_active == True)
        .order_by(Recipe.name)
    )
    return result.scalars().all()


@router.post("/", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    body: RecipeCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = Recipe(**body.model_dump(), tenant_id=tenant_id)
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)
    return recipe


@router.get("/{recipe_id}", response_model=RecipeWithIngredients)
async def get_recipe(
    recipe_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, recipe_id)
    if not recipe or recipe.tenant_id != tenant_id or not recipe.is_active:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    ing_result = await session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == recipe_id,
            RecipeIngredient.is_active == True,
        )
    )
    ings = ing_result.scalars().all()

    ingredients_read = []
    calculated_cost = 0.0
    for ing in ings:
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item:
            read = _build_ingredient_read(ing, item)
            ingredients_read.append(read)
            calculated_cost += read.subtotal

    if recipe.estimated_cost != calculated_cost:
        recipe.estimated_cost = calculated_cost
        recipe.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(recipe)
        await session.commit()

    return RecipeWithIngredients(
        id=recipe.id,
        tenant_id=recipe.tenant_id,
        name=recipe.name,
        base_unit=recipe.base_unit,
        estimated_yield=recipe.estimated_yield,
        estimated_cost=calculated_cost,
        sell_price=recipe.sell_price,
        description=recipe.description,
        instructions=recipe.instructions,
        bake_temp=recipe.bake_temp,
        bake_time=recipe.bake_time,
        difficulty=recipe.difficulty,
        panes_por_libra_harina=recipe.panes_por_libra_harina,
        is_active=recipe.is_active,
        created_at=recipe.created_at,
        ingredients=ingredients_read,
    )


@router.patch("/{recipe_id}", response_model=RecipeRead)
async def update_recipe(
    recipe_id: uuid.UUID,
    body: RecipeUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, recipe_id)
    if not recipe or recipe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(recipe, field, value)
    recipe.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)
    return recipe


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(
    recipe_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, recipe_id)
    if not recipe or recipe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    recipe.is_active = False
    recipe.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(recipe)
    await session.commit()


@router.post("/{recipe_id}/ingredients", response_model=RecipeIngredientRead, status_code=status.HTTP_201_CREATED)
async def add_ingredient(
    recipe_id: uuid.UUID,
    body: RecipeIngredientCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    recipe = await session.get(Recipe, recipe_id)
    if not recipe or recipe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    item = await session.get(InventoryItem, body.inventory_item_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    ing = RecipeIngredient(
        recipe_id=recipe_id,
        inventory_item_id=body.inventory_item_id,
        bakers_percent=body.bakers_percent,
        unit_cost_override=body.unit_cost_override,
        tenant_id=tenant_id,
    )
    session.add(ing)
    await session.commit()
    await session.refresh(ing)
    await _recalculate_cost(recipe, session)
    await session.commit()
    return _build_ingredient_read(ing, item)


@router.patch("/{recipe_id}/ingredients/{ingredient_id}", response_model=RecipeIngredientRead)
async def update_ingredient(
    recipe_id: uuid.UUID,
    ingredient_id: uuid.UUID,
    body: RecipeIngredientUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    ing = await session.get(RecipeIngredient, ingredient_id)
    if not ing or ing.recipe_id != recipe_id or ing.tenant_id != tenant_id or not ing.is_active:
        raise HTTPException(status_code=404, detail="Ingrediente no encontrado")
    if body.bakers_percent is not None:
        ing.bakers_percent = body.bakers_percent
    if body.unit_cost_override is not None:
        ing.unit_cost_override = body.unit_cost_override
    ing.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(ing)
    await session.commit()
    item = await session.get(InventoryItem, ing.inventory_item_id)
    recipe = await session.get(Recipe, recipe_id)
    if recipe:
        await _recalculate_cost(recipe, session)
        await session.commit()
    return _build_ingredient_read(ing, item)


@router.delete("/{recipe_id}/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_ingredient(
    recipe_id: uuid.UUID,
    ingredient_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    ing = await session.get(RecipeIngredient, ingredient_id)
    if not ing or ing.recipe_id != recipe_id or ing.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Ingrediente no encontrado")
    ing.is_active = False
    ing.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(ing)
    await session.commit()
    recipe = await session.get(Recipe, recipe_id)
    if recipe:
        await _recalculate_cost(recipe, session)
        await session.commit()


# ── Motor de Cálculo ────────────────────────────────────────────────────────

@router.get("/{recipe_id}/calculate", response_model=RecipeCalculationOutputs)
async def calculate_recipe(
    recipe_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await RecipeCalculator.calculate(
            db=session,
            recipe_id=recipe_id,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return result
