"""
Motor de cálculo de recetas con patrón Baker's Percentage.
Implementa fórmulas F-R01 a F-R12.

Diseño en dos capas:
  - calculate_from_data(): lógica pura, sin I/O — testeable sin DB
  - calculate():           carga datos desde la DB y delega al método puro
"""
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID
from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.bakery import Recipe, RecipeIngredient, InventoryItem
from api.helpers import get_constant


# ── Tipos internos ────────────────────────────────────────────────────────────

class IngredientData:
    """Snapshot de un ingrediente para el cálculo (sin dependencia de ORM)."""
    __slots__ = ("name", "bakers_percent", "unit_cost")

    def __init__(self, name: str, bakers_percent: Decimal, unit_cost: Decimal):
        self.name = name
        self.bakers_percent = bakers_percent
        self.unit_cost = unit_cost


class ConstantsData:
    """Snapshot de constantes del tenant para el cálculo."""
    __slots__ = (
        "labor_rate_per_qq",
        "benefits_factor",
        "gas_price_per_unit",
        "gas_lbs_per_qq",
        "ounces_per_unit",
        "gas_cylinder_lbs",
    )

    def __init__(
        self,
        labor_rate_per_qq: Decimal,
        benefits_factor: Decimal,
        gas_price_per_unit: Decimal,
        gas_lbs_per_qq: Decimal,
        ounces_per_unit: Decimal,
        gas_cylinder_lbs: Decimal,
    ):
        self.labor_rate_per_qq = labor_rate_per_qq
        self.benefits_factor = benefits_factor
        self.gas_price_per_unit = gas_price_per_unit
        self.gas_lbs_per_qq = gas_lbs_per_qq
        self.ounces_per_unit = ounces_per_unit
        self.gas_cylinder_lbs = gas_cylinder_lbs


# ── Motor de cálculo ──────────────────────────────────────────────────────────

class RecipeCalculator:
    """Motor de cálculo de recetas con patrón Baker's Percentage."""

    @staticmethod
    def calculate_from_data(
        recipe_id: UUID,
        recipe_name: str,
        sell_price_per_unit: Decimal,
        ingredients: list[IngredientData],
        constants: ConstantsData,
        base_harina_lbs: Decimal = Decimal("100"),
    ) -> dict:
        """
        Lógica pura de cálculo — sin acceso a DB.
        Recibe snapshots de datos y retorna todos los outputs derivados.
        """
        # F-R01: libras por ingrediente
        lbs_per_ingredient: dict[str, float] = {}
        for ing in ingredients:
            lbs = (ing.bakers_percent / Decimal("100")) * base_harina_lbs
            lbs_per_ingredient[ing.name] = float(lbs.quantize(Decimal("0.0001"), ROUND_HALF_UP))

        # F-R02: costo por ingrediente
        costo_per_ingredient: dict[str, float] = {}
        for ing in ingredients:
            lbs = (ing.bakers_percent / Decimal("100")) * base_harina_lbs
            costo = lbs * ing.unit_cost
            costo_per_ingredient[ing.name] = float(costo.quantize(Decimal("0.0001"), ROUND_HALF_UP))

        # F-R03: totales de masa y costo de ingredientes
        total_masa_lbs = sum(
            (ing.bakers_percent / Decimal("100")) * base_harina_lbs
            for ing in ingredients
        )
        total_costo_ingredientes = sum(
            (ing.bakers_percent / Decimal("100")) * base_harina_lbs * ing.unit_cost
            for ing in ingredients
        )

        # F-R04: panes por quintal
        # total_masa_lbs × 16 oz/lb ÷ oz_por_pan
        total_oz = total_masa_lbs * Decimal("16")
        panes = (total_oz / constants.ounces_per_unit).to_integral_value(rounding=ROUND_HALF_UP)
        panes_de_1oz = int(panes)
        filas_de_8_unidades = panes_de_1oz // 8
        panes_por_quintal = panes_de_1oz  # base = 1 quintal por defecto

        # Factor de escala por si base_harina_lbs != 100
        factor_qq = base_harina_lbs / Decimal("100")

        # F-R07: mano de obra con prestaciones (por quintal base, luego escalada)
        labor_with_benefits_per_qq = constants.labor_rate_per_qq * (Decimal("1") + constants.benefits_factor)
        costo_mano_obra = labor_with_benefits_per_qq * factor_qq

        # F-R08: costo de gas (precio/lb_cilindro × lbs_por_quintal, escalado)
        gas_cost_per_qq = (constants.gas_price_per_unit / constants.gas_cylinder_lbs) * constants.gas_lbs_per_qq
        costo_gas = gas_cost_per_qq * factor_qq

        # F-R10: costo de formulación total
        costo_formulacion_qq = costo_mano_obra + costo_gas + total_costo_ingredientes

        # F-R11: costo por pan
        if panes_de_1oz == 0:
            costo_por_pan = Decimal("0")
        else:
            costo_por_pan = costo_formulacion_qq / Decimal(panes_de_1oz)

        # F-R12: métricas de rentabilidad
        venta_total_qq = sell_price_per_unit * Decimal(panes_de_1oz)
        utilidad_total_qq = venta_total_qq - costo_formulacion_qq
        if panes_de_1oz == 0:
            utilidad_por_unidad = Decimal("0")
            markup_ratio = Decimal("0")
        else:
            utilidad_por_unidad = utilidad_total_qq / Decimal(panes_de_1oz)
            markup_ratio = (
                utilidad_total_qq / costo_formulacion_qq
                if costo_formulacion_qq != 0
                else Decimal("0")
            )

        def _r(v: Decimal, places: int = 5) -> float:
            return float(v.quantize(Decimal(10) ** -places, ROUND_HALF_UP))

        return {
            "recipe_id": recipe_id,
            "recipe_name": recipe_name,
            "base_harina_lbs": float(base_harina_lbs),
            "lbs_per_ingredient": lbs_per_ingredient,
            "costo_per_ingredient": costo_per_ingredient,
            "total_masa_lbs": _r(total_masa_lbs),
            "total_costo_ingredientes": _r(total_costo_ingredientes),
            "panes_de_1oz": panes_de_1oz,
            "filas_de_8_unidades": filas_de_8_unidades,
            "panes_por_quintal": panes_por_quintal,
            "labor_with_benefits_per_qq": _r(labor_with_benefits_per_qq),
            "gas_cost_per_qq": _r(gas_cost_per_qq),
            "costo_mano_obra": _r(costo_mano_obra),
            "costo_gas": _r(costo_gas),
            "costo_formulacion_qq": _r(costo_formulacion_qq),
            "costo_por_pan": _r(costo_por_pan),
            "sell_price_per_unit": float(sell_price_per_unit),
            "venta_total_qq": _r(venta_total_qq),
            "utilidad_total_qq": _r(utilidad_total_qq),
            "utilidad_por_unidad": _r(utilidad_por_unidad),
            "markup_ratio": _r(markup_ratio),
        }

    @staticmethod
    async def calculate(
        db: AsyncSession,
        recipe_id: UUID,
        tenant_id: UUID,
        target_date: Optional[date] = None,
        base_harina_lbs: Decimal = Decimal("100"),
    ) -> dict:
        """Carga receta + ingredientes + constantes desde la DB y calcula."""
        recipe = await db.get(Recipe, recipe_id)
        if not recipe or recipe.tenant_id != tenant_id or not recipe.is_active:
            raise ValueError(f"Receta {recipe_id} no encontrada")

        ing_result = await db.execute(
            select(RecipeIngredient).where(
                RecipeIngredient.recipe_id == recipe_id,
                RecipeIngredient.is_active == True,
            )
        )
        raw_ings = ing_result.scalars().all()

        ingredients: list[IngredientData] = []
        for ing in raw_ings:
            item = await db.get(InventoryItem, ing.inventory_item_id)
            if item:
                unit_cost = (
                    ing.unit_cost_override
                    if ing.unit_cost_override is not None
                    else Decimal(str(item.last_unit_cost))
                )
                ingredients.append(IngredientData(
                    name=item.name,
                    bakers_percent=ing.bakers_percent,
                    unit_cost=unit_cost,
                ))

        if not ingredients:
            raise ValueError(f"La receta {recipe_id} no tiene ingredientes activos")

        td = target_date or date.today()
        constants = ConstantsData(
            labor_rate_per_qq   = await get_constant(tenant_id, "labor_rate_per_qq",  db, td),
            benefits_factor     = await get_constant(tenant_id, "benefits_factor",    db, td),
            gas_price_per_unit  = await get_constant(tenant_id, "gas_price_per_unit", db, td),
            gas_lbs_per_qq      = await get_constant(tenant_id, "gas_lbs_per_qq",     db, td),
            ounces_per_unit     = await get_constant(tenant_id, "ounces_per_unit",    db, td),
            gas_cylinder_lbs    = await get_constant(tenant_id, "gas_cylinder_lbs",   db, td),
        )

        return RecipeCalculator.calculate_from_data(
            recipe_id=recipe_id,
            recipe_name=recipe.name,
            sell_price_per_unit=Decimal(str(recipe.sell_price)),
            ingredients=ingredients,
            constants=constants,
            base_harina_lbs=base_harina_lbs,
        )
