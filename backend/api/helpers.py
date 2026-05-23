"""
Helpers compartidos entre routers — sin importaciones circulares.
"""
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.bakery import Recipe, RecipeIngredient, InventoryItem, RecipeConstants, DEFAULT_CONSTANTS


async def recalculate_recipe_cost(recipe: Recipe, session: AsyncSession) -> None:
    """Recalcula estimated_cost usando Baker's %: Σ(bakers_percent/100 × effective_cost).
    effective_cost = unit_cost_override si está definido, sino last_unit_cost del insumo."""
    result = await session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == recipe.id,
            RecipeIngredient.is_active == True,
        )
    )
    total = 0.0
    for ing in result.scalars().all():
        item = await session.get(InventoryItem, ing.inventory_item_id)
        if item:
            effective_cost = (
                float(ing.unit_cost_override)
                if ing.unit_cost_override is not None
                else item.last_unit_cost
            )
            total += (float(ing.bakers_percent) / 100.0) * effective_cost
    recipe.estimated_cost = round(total, 4)
    recipe.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(recipe)


async def get_constant(
    tenant_id: UUID,
    key: str,
    session: AsyncSession,
    target_date: Optional[date] = None,
) -> Decimal:
    """Retorna el valor de una constante vigente para el tenant en la fecha dada."""
    if target_date is None:
        target_date = date.today()
    result = await session.execute(
        select(RecipeConstants)
        .where(
            and_(
                RecipeConstants.tenant_id == tenant_id,
                RecipeConstants.constant_key == key,
                RecipeConstants.is_active == True,
                RecipeConstants.effective_from <= target_date,
                or_(
                    RecipeConstants.effective_to == None,
                    RecipeConstants.effective_to >= target_date,
                ),
            )
        )
        .order_by(RecipeConstants.effective_from.desc())
        .limit(1)
    )
    constant = result.scalar_one_or_none()
    if constant is None:
        raise ValueError(f"Constante '{key}' no encontrada para el tenant {tenant_id} en {target_date}")
    return constant.value


async def seed_tenant_constants(tenant_id: UUID, session: AsyncSession) -> None:
    """Inserta las constantes por defecto para un tenant nuevo si aún no existen."""
    today = date.today()
    for defaults in DEFAULT_CONSTANTS:
        existing = await session.execute(
            select(RecipeConstants).where(
                RecipeConstants.tenant_id == tenant_id,
                RecipeConstants.constant_key == defaults["constant_key"],
            )
        )
        if existing.scalar_one_or_none() is None:
            session.add(RecipeConstants(
                tenant_id=tenant_id,
                constant_key=defaults["constant_key"],
                value=defaults["value"],
                description=defaults["description"],
                effective_from=today,
            ))
    await session.commit()


async def recalculate_recipes_using_item(item_id, tenant_id, session: AsyncSession) -> None:
    """Recalcula el costo de todas las recetas que usan el insumo dado."""
    ri_result = await session.execute(
        select(RecipeIngredient.recipe_id).where(
            RecipeIngredient.inventory_item_id == item_id,
            RecipeIngredient.is_active == True,
        ).distinct()
    )
    for recipe_id in ri_result.scalars().all():
        recipe = await session.get(Recipe, recipe_id)
        if recipe and recipe.tenant_id == tenant_id and recipe.is_active:
            await recalculate_recipe_cost(recipe, session)
