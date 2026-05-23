"""
Seed script: carga las 22 recetas del Excel Pan.xlsx en la BD.

Uso:
    python seed_recetas.py --tenant-id <UUID>

Idempotente: no duplica recetas ni ingredientes si ya existen (match por nombre + tenant).
"""
import asyncio
import argparse
import sys
from decimal import Decimal
from uuid import UUID, uuid4

# ──────────────────────────────────────────────────────────────
# INVENTARIO: insumos únicos normalizados
# (name, unit, category)
# ──────────────────────────────────────────────────────────────
INVENTORY_SEEDS = [
    ("Harina Dura",       "lb", "harina"),
    ("Harina Suave",      "lb", "harina"),
    ("Harina Integral",   "lb", "harina"),
    ("Levadura",          "lb", "levadura"),
    ("Azúcar",            "lb", "endulzante"),
    ("Sal",               "lb", "condimento"),
    ("Manteca",           "lb", "grasa"),
    ("Margarina",         "lb", "grasa"),
    ("Agua",              "L",  "liquido"),
    ("Leche",             "L",  "liquido"),
    ("Polvo de Hornear",  "lb", "leudante"),
    ("Queso Seco",        "lb", "lacteo"),
    ("Huevo",             "lb", "proteina"),
    ("Canela",            "lb", "especia"),
    ("Anis",              "lb", "especia"),
    ("Pasas",             "lb", "fruta_seca"),
]

# Normalización: cómo los nombres del Excel mapean al inventario
NAME_MAP = {
    "harina dura":          "Harina Dura",
    "harina suave":         "Harina Suave",
    "harina suave (gasto)": "Harina Suave",
    "harina integral":      "Harina Integral",
    "levadura":             "Levadura",
    "azúcar":               "Azúcar",
    "azucar":               "Azúcar",
    "sal":                  "Sal",
    "manteca":              "Manteca",
    "margarina":            "Margarina",
    "agua":                 "Agua",
    "leche":                "Leche",
    "polvo de hornear":     "Polvo de Hornear",
    "royal":                "Polvo de Hornear",
    "queso seco":           "Queso Seco",
    "huevo":                "Huevo",
    "canela":               "Canela",
    "anis":                 "Anis",
    "pasas":                "Pasas",
}

# ──────────────────────────────────────────────────────────────
# RECETAS  (nombre_display, panes_por_libra, sell_price, ingredients)
# ingredients = [(nombre_excel, bakers_percent), ...]
# estimated_yield = panes_por_libra * 100  (por quintal)
# ──────────────────────────────────────────────────────────────
RECIPES = [
    ("Pan Francés", 36, 0.25, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 58.25),
    ]),
    ("Pirujo Pegado", 26, 0.35, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 52.0),
    ]),
    ("Desabrido", 18, 0.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 58.3),
    ]),
    ("Pirujon", 8, 1.25, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 39.5),
    ]),
    ("Campechana", 8, 1.75, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 39.5),
    ]),
    ("Lengua", 8, 1.25, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 39.5),
    ]),
    ("Dulce de Manteca", 40, 0.25, [
        ("Harina Dura", 100.0), ("Levadura", 2.0), ("Azúcar", 28.0),
        ("Sal", 1.5), ("Manteca", 12.0), ("Polvo de Hornear", 3.5),
        ("Agua", 39.5), ("Huevo", 1.0),
    ]),
    ("Tostado", 40, 0.30, [
        ("Harina Suave", 100.0), ("Polvo de Hornear", 3.5), ("Azúcar", 45.0),
        ("Sal", 1.0), ("Manteca", 20.0), ("Agua", 35.0),
    ]),
    ("Pan de Queso Gusano", 10, 2.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.66), ("Azúcar", 30.0),
        ("Sal", 1.2), ("Manteca", 20.0), ("Polvo de Hornear", 1.6),
        ("Queso Seco", 4.16), ("Agua", 20.0), ("Huevo", 15.0),
    ]),
    ("Pan de Queso Cortada", 10, 2.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.66), ("Azúcar", 30.0),
        ("Sal", 1.2), ("Manteca", 20.0), ("Polvo de Hornear", 1.6),
        ("Queso Seco", 4.16), ("Agua", 20.0), ("Huevo", 15.0),
    ]),
    ("Pan de Queso Tortita", 10, 2.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.66), ("Azúcar", 30.0),
        ("Sal", 1.2), ("Manteca", 20.0), ("Polvo de Hornear", 1.6),
        ("Queso Seco", 4.16), ("Agua", 20.0), ("Huevo", 15.0),
    ]),
    ("Integral Francés", 20, 0.50, [
        ("Harina Dura", 70.0), ("Harina Integral", 30.0), ("Levadura", 1.0),
        ("Azúcar", 2.0), ("Sal", 1.0), ("Manteca", 5.0), ("Agua", 60.0),
    ]),
    ("Integral Cortada", 7, 1.00, [
        ("Harina Integral", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.0), ("Manteca", 5.0), ("Pasas", 4.0), ("Agua", 50.0),
    ]),
    ("Pan de Leche", 25, 0.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 6.0),
        ("Sal", 1.0), ("Manteca", 7.0), ("Leche", 4.0), ("Agua", 50.0),
    ]),
    ("Encanelado", 12, 2.50, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 30.0),
        ("Sal", 1.0), ("Margarina", 25.0), ("Canela", 5.0),
        ("Agua", 40.0), ("Huevo", 8.0),
    ]),
    ("Sheca", 12, 2.00, [
        ("Harina Dura", 100.0), ("Levadura", 2.5), ("Azúcar", 30.0),
        ("Sal", 1.0), ("Manteca", 20.0), ("Anis", 2.5),
        ("Polvo de Hornear", 3.5), ("Agua", 50.0),
    ]),
    ("Torta Grande", 2, 15.00, [
        ("Harina Dura", 100.0), ("Levadura", 3.0), ("Harina Suave", 10.0),
        ("Azúcar", 35.0), ("Sal", 1.0), ("Manteca", 20.0),
        ("Polvo de Hornear", 3.5), ("Queso Seco", 4.0),
        ("Agua", 30.0), ("Huevo", 84.0),
    ]),
    ("Palitos de Queso", 34, 0.40, [
        ("Harina Dura", 100.0), ("Azúcar", 0.75), ("Sal", 0.6),
        ("Levadura", 2.5), ("Queso Seco", 4.0), ("Agua", 6.5),
        ("Margarina", 50.0),
    ]),
    ("Molletes", 20, 0.75, [
        ("Harina Dura", 100.0), ("Levadura", 2.0), ("Harina Suave", 10.0),
        ("Azúcar", 40.0), ("Sal", 1.5), ("Manteca", 20.0),
        ("Polvo de Hornear", 3.5), ("Agua", 40.0), ("Huevo", 5.0),
    ]),
    ("Pirujon Navideño", 2, 10.00, [
        ("Harina Dura", 100.0), ("Levadura", 1.0), ("Azúcar", 2.0),
        ("Sal", 1.5), ("Manteca", 6.0), ("Agua", 50.0),
    ]),
    ("Champurrada", 50, 0.31, [
        ("Harina Dura", 100.0), ("Polvo de Hornear", 3.5), ("Azúcar", 60.0),
        ("Sal", 1.0), ("Manteca", 30.0), ("Agua", 44.0),
    ]),
    ("Champurrada Integral", 50, 0.44, [
        ("Harina Suave", 100.0), ("Polvo de Hornear", 1.25), ("Azúcar", 62.0),
        ("Sal", 1.25), ("Manteca", 30.0), ("Agua", 44.0),
    ]),
]


async def run(tenant_id: UUID):
    import os, sys
    sys.path.insert(0, os.path.dirname(__file__))
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlmodel import select
    from models.bakery import InventoryItem, Recipe, RecipeIngredient

    DATABASE_URL = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://nodo_user:nodo_pass@localhost:5432/nodo_db",
    )
    engine = create_async_engine(DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        # ── 1. Crear/obtener inventory items ──────────────────────────────
        item_map: dict[str, UUID] = {}  # canonical_name → id

        for name, unit, category in INVENTORY_SEEDS:
            result = await session.execute(
                select(InventoryItem).where(
                    InventoryItem.tenant_id == tenant_id,
                    InventoryItem.name == name,
                )
            )
            item = result.scalar_one_or_none()
            if item is None:
                item = InventoryItem(
                    tenant_id=tenant_id,
                    name=name,
                    unit=unit,
                    category=category,
                    current_stock=0.0,
                    minimum_stock=0.0,
                    last_unit_cost=0.0,
                )
                session.add(item)
                await session.flush()
                print(f"  [+] Insumo: {name}")
            else:
                print(f"  [=] Insumo ya existe: {name}")
            item_map[name.lower()] = item.id

        await session.commit()

        # ── 2. Crear/obtener recetas + ingredientes ────────────────────────
        for recipe_name, ppl, sell_price, raw_ings in RECIPES:
            result = await session.execute(
                select(Recipe).where(
                    Recipe.tenant_id == tenant_id,
                    Recipe.name == recipe_name,
                )
            )
            recipe = result.scalar_one_or_none()

            if recipe is None:
                recipe = Recipe(
                    tenant_id=tenant_id,
                    name=recipe_name,
                    sell_price=sell_price,
                    panes_por_libra_harina=round(ppl),
                    estimated_yield=float(round(ppl) * 100),
                    base_unit="unidades",
                    estimated_cost=0.0,
                )
                session.add(recipe)
                await session.flush()
                print(f"  [+] Receta: {recipe_name}")
            else:
                print(f"  [=] Receta ya existe: {recipe_name}")
                continue  # skip ingredients if recipe already present

            # Insertar ingredientes
            for raw_name, bakers_pct in raw_ings:
                canonical = NAME_MAP.get(raw_name.lower().strip())
                if canonical is None:
                    print(f"      WARN: ingrediente no mapeado '{raw_name}' en {recipe_name}")
                    continue
                inv_id = item_map.get(canonical.lower())
                if inv_id is None:
                    print(f"      WARN: insumo no encontrado '{canonical}'")
                    continue
                ri = RecipeIngredient(
                    tenant_id=tenant_id,
                    recipe_id=recipe.id,
                    inventory_item_id=inv_id,
                    bakers_percent=Decimal(str(bakers_pct)),
                )
                session.add(ri)
            await session.flush()

        await session.commit()
        print("\n✓ Seed completo.")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-id", required=True, help="UUID del tenant")
    args = parser.parse_args()

    try:
        tid = UUID(args.tenant_id)
    except ValueError:
        print("ERROR: tenant-id no es un UUID válido")
        sys.exit(1)

    asyncio.run(run(tid))
