from uuid import UUID
from datetime import date
from decimal import Decimal
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.bakery import ProductionOrder, Recipe, ExpenseLine

MERMA_RATE = Decimal("0.02")


class MonthlyReportGenerator:
    @staticmethod
    async def generate(
        db: AsyncSession,
        tenant_id: UUID,
        year: int,
        month: int,
    ) -> dict:
        month_start = date(year, month, 1)

        # 1. Completed production orders for the month
        result = await db.execute(
            select(ProductionOrder, Recipe.name)
            .join(Recipe, ProductionOrder.recipe_id == Recipe.id)
            .where(
                ProductionOrder.tenant_id == tenant_id,
                ProductionOrder.status == "completed",
                ProductionOrder.production_date != None,
                ProductionOrder.production_date >= date(year, month, 1),
                ProductionOrder.production_date < _next_month(year, month),
            )
        )
        rows = result.all()

        # 2. Group by recipe
        by_recipe: dict[UUID, dict] = {}
        for order, recipe_name in rows:
            rid = order.recipe_id
            if rid not in by_recipe:
                by_recipe[rid] = {
                    "recipe_id": rid,
                    "recipe_name": recipe_name,
                    "harina_total_lbs": Decimal("0"),
                    "costo_total": Decimal("0"),
                    "venta_total": Decimal("0"),
                }
            grp = by_recipe[rid]
            grp["harina_total_lbs"] += order.harina_lbs or Decimal("0")
            grp["costo_total"] += order.costo_produccion or Decimal("0")
            grp["venta_total"] += order.venta_esperada or Decimal("0")

        total_harina = sum(g["harina_total_lbs"] for g in by_recipe.values()) or Decimal("1")

        products = []
        total_costo = Decimal("0")
        total_venta = Decimal("0")
        total_merma = Decimal("0")

        for grp in by_recipe.values():
            merma = _round2(grp["costo_total"] * MERMA_RATE)
            utilidad = _round2(grp["venta_total"] - grp["costo_total"] - merma)
            participacion = _round4(grp["harina_total_lbs"] / total_harina)

            products.append({
                "recipe_id": str(grp["recipe_id"]),
                "recipe_name": grp["recipe_name"],
                "harina_total_lbs": float(grp["harina_total_lbs"]),
                "costo_total": float(_round2(grp["costo_total"])),
                "venta_total": float(_round2(grp["venta_total"])),
                "merma_al_costo": float(merma),
                "utilidad_producto": float(utilidad),
                "participacion_pct": float(participacion),
            })

            total_costo += grp["costo_total"]
            total_venta += grp["venta_total"]
            total_merma += merma

        products.sort(key=lambda p: p["venta_total"], reverse=True)

        # 3. Expense lines for the month
        exp_result = await db.execute(
            select(ExpenseLine).where(
                ExpenseLine.tenant_id == tenant_id,
                ExpenseLine.month == month_start,
                ExpenseLine.is_active == True,
            )
        )
        expense_lines = exp_result.scalars().all()

        opex_operativo = Decimal("0")
        owner_drawing = Decimal("0")
        financing_cost = Decimal("0")

        for line in expense_lines:
            total_line = (line.qty or Decimal("1")) * line.unit_cost
            cat = line.category if isinstance(line.category, str) else line.category.value
            if cat == "operating_expense":
                opex_operativo += total_line
            elif cat == "owner_drawing":
                owner_drawing += total_line
            elif cat == "financing_cost":
                financing_cost += total_line

        opex_total = opex_operativo + owner_drawing + financing_cost

        total_costo_r = _round2(total_costo)
        total_venta_r = _round2(total_venta)
        total_merma_r = _round2(total_merma)
        utilidad_operativa = _round2(total_venta_r - total_costo_r - total_merma_r)
        utilidad_neta = _round2(utilidad_operativa - opex_total)

        return {
            "year": year,
            "month": month,
            "products": products,
            "totals": {
                "harina_total_qq": float(_round2(total_harina / Decimal("100"))),
                "costo_total": float(total_costo_r),
                "venta_total": float(total_venta_r),
                "merma_total": float(total_merma_r),
                "utilidad_operativa": float(utilidad_operativa),
                "opex_operativo": float(_round2(opex_operativo)),
                "owner_drawing": float(_round2(owner_drawing)),
                "financing_cost": float(_round2(financing_cost)),
                "opex_total": float(_round2(opex_total)),
                "utilidad_neta": float(utilidad_neta),
            },
        }


def _next_month(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _round2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


def _round4(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.0001"))
