"""
MÓDULO 2: RECETAS — Base de Producción
- GET    /api/recetas/                          → Listar recetas
- POST   /api/recetas/                          → Crear receta
- GET    /api/recetas/{id}                      → Detalle con ingredientes
- PATCH  /api/recetas/{id}                      → Editar receta
- DELETE /api/recetas/{id}                      → Baja lógica
- POST   /api/recetas/{id}/ingredients          → Añadir ingrediente
- DELETE /api/recetas/{id}/ingredients/{ing_id} → Quitar ingrediente
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import Recipe, RecipeIngredient, InventoryItem
from models.schemas import (
    RecipeCreate, RecipeUpdate, RecipeRead, RecipeWithIngredients,
    RecipeIngredientCreate, RecipeIngredientRead,
)

router = APIRouter(tags=["Recetas (Base de Producción)"])


def _build_ingredient_read(ing: RecipeIngredient, item: InventoryItem) -> RecipeIngredientRead:
    return RecipeIngredientRead(
        id=ing.id,
        inventory_item_id=ing.inventory_item_id,
        item_name=item.name,
        item_unit=item.unit,
        quantity=ing.quantity,
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
    for ing in ings:
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item:
            ingredients_read.append(_build_ingredient_read(ing, item))

    return RecipeWithIngredients(
        id=recipe.id,
        tenant_id=recipe.tenant_id,
        name=recipe.name,
        base_unit=recipe.base_unit,
        estimated_yield=recipe.estimated_yield,
        estimated_cost=recipe.estimated_cost,
        sell_price=recipe.sell_price,
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
        quantity=body.quantity,
        tenant_id=tenant_id,
    )
    session.add(ing)
    await session.commit()
    await session.refresh(ing)
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
