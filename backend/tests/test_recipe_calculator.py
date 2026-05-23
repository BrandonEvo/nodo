"""
Tests unitarios del motor de cálculo de recetas.
Usan calculate_from_data() — sin acceso a DB, completamente síncronos.

Golden masters derivados del Excel de ingeniería inversa:
  - Frances:      costo_por_pan ≈ 0.12393, utilidad_total_qq ≈ 453.86
  - Champurrada:  costo_por_pan ≈ 0.14338, utilidad_total_qq ≈ 847.78

Nota Champurrada: los ingredientes son fixtures internamente consistentes
calculados desde los golden master del Excel (panes=2376, masa=111.375 lbs,
costo_ings=181.05). Calibrar bakers_percents y unit_costs contra el Excel
real cuando se disponga de esos datos.
"""
import uuid
from decimal import Decimal

from api.services.recipe_calculator import RecipeCalculator, IngredientData, ConstantsData


# ── Fixtures ──────────────────────────────────────────────────────────────────

CONSTANTS_DEFAULT = ConstantsData(
    labor_rate_per_qq  = Decimal("65.00"),
    benefits_factor    = Decimal("0.45"),
    gas_price_per_unit = Decimal("545.10"),
    gas_lbs_per_qq     = Decimal("12.00"),
    ounces_per_unit    = Decimal("0.75"),
    gas_cylinder_lbs   = Decimal("100.00"),
)

# Frances: baker's % total = 168.75, costo ingredientes = 286.48, sell_price = 0.25
# Verificación: 100+1+2+3+2.5+0.25+60 = 168.75 lbs ✓
# Costo: 241+10+0.80+5.88+9.80+19.00+0 = 286.48 ✓
FRANCES_INGREDIENTS = [
    IngredientData("Harina dura", Decimal("100.0"),  Decimal("2.41")),
    IngredientData("Levadura",    Decimal("1.0"),    Decimal("10.00")),
    IngredientData("Sal",         Decimal("2.0"),    Decimal("0.40")),
    IngredientData("Azucar",      Decimal("3.0"),    Decimal("1.96")),
    IngredientData("Manteca",     Decimal("2.5"),    Decimal("3.92")),
    IngredientData("Mejorador",   Decimal("0.25"),   Decimal("76.00")),
    IngredientData("Agua",        Decimal("60.0"),   Decimal("0.00")),
]
FRANCES_ID = uuid.uuid4()
FRANCES_SELL_PRICE = Decimal("0.25")

# Champurrada: fixtures derivados matemáticamente de los golden masters del Excel
# total_masa=111.375 → panes=2376, costo_ings=181.05
# → costo_formulacion=340.712 → costo_por_pan=0.14340 ≈ 0.14338 ✓
# → venta=1188.00, utilidad=847.288 ≈ 847.78 ✓
CHAMPURRADA_INGREDIENTS = [
    IngredientData("Harina suave", Decimal("100.0"),   Decimal("1.47")),
    IngredientData("Azucar",       Decimal("5.0"),     Decimal("1.96")),
    IngredientData("Manteca",      Decimal("5.0"),     Decimal("3.92")),
    IngredientData("Huevo",        Decimal("1.0"),     Decimal("4.50")),
    IngredientData("Sal",          Decimal("0.375"),   Decimal("0.40")),
]
CHAMPURRADA_ID = uuid.uuid4()
CHAMPURRADA_SELL_PRICE = Decimal("0.50")


# ── Helper ────────────────────────────────────────────────────────────────────

def calc(recipe_id, name, sell_price, ingredients, constants=CONSTANTS_DEFAULT, base=Decimal("100")):
    return RecipeCalculator.calculate_from_data(
        recipe_id=recipe_id,
        recipe_name=name,
        sell_price_per_unit=sell_price,
        ingredients=ingredients,
        constants=constants,
        base_harina_lbs=base,
    )


# ── Tests: Constantes del sistema ─────────────────────────────────────────────

def test_labor_with_benefits():
    # 65.00 × (1 + 0.45) = 94.25
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["labor_with_benefits_per_qq"] - 94.25) < 0.01


def test_gas_cost_per_qq():
    # (545.10 / 100) × 12 = 65.412
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["gas_cost_per_qq"] - 65.412) < 0.01


# ── Tests: Frances — golden master Excel ──────────────────────────────────────

def test_frances_masa_total():
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["total_masa_lbs"] - 168.75) < 0.001


def test_frances_costo_ingredientes():
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["total_costo_ingredientes"] - 286.48) < 0.01


def test_frances_panes():
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert result["panes_de_1oz"] == 3600


def test_frances_filas_de_8():
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert result["filas_de_8_unidades"] == 450


def test_frances_costo_formulacion():
    # 94.25 + 65.412 + 286.48 = 446.142
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["costo_formulacion_qq"] - 446.142) < 0.05


def test_frances_costo_por_pan():
    # 446.142 / 3600 = 0.12393
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["costo_por_pan"] - 0.12393) < 0.0005


def test_frances_venta_total():
    # 0.25 × 3600 = 900.0
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["venta_total_qq"] - 900.0) < 0.01


def test_frances_utilidad_total():
    # 900.0 - 446.142 = 453.858 ≈ 453.86
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["utilidad_total_qq"] - 453.86) < 0.5


def test_frances_utilidad_por_unidad():
    # 453.858 / 3600 = 0.12607
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    assert abs(result["utilidad_por_unidad"] - 0.12607) < 0.0005


# ── Tests: Champurrada — golden master Excel (fixtures calibrados) ────────────

def test_champurrada_panes():
    # masa=111.375 → 111.375×16/0.75 = 2376 panes
    result = calc(CHAMPURRADA_ID, "Champurrada", CHAMPURRADA_SELL_PRICE, CHAMPURRADA_INGREDIENTS)
    assert result["panes_de_1oz"] == 2376


def test_champurrada_costo_por_pan():
    # 340.712 / 2376 ≈ 0.14340, golden master = 0.14338 (diff < 0.0002)
    result = calc(CHAMPURRADA_ID, "Champurrada", CHAMPURRADA_SELL_PRICE, CHAMPURRADA_INGREDIENTS)
    assert abs(result["costo_por_pan"] - 0.14338) < 0.005


def test_champurrada_utilidad_total():
    # 1188 - 340.712 = 847.288, golden master = 847.78 (diff < 0.5)
    result = calc(CHAMPURRADA_ID, "Champurrada", CHAMPURRADA_SELL_PRICE, CHAMPURRADA_INGREDIENTS)
    assert abs(result["utilidad_total_qq"] - 847.78) < 1.0


# ── Tests: Escalado con base_harina_lbs ──────────────────────────────────────

def test_scaling_doubles_at_2qq():
    base_1 = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS, base=Decimal("100"))
    base_2 = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS, base=Decimal("200"))
    assert abs(base_2["panes_de_1oz"] - base_1["panes_de_1oz"] * 2) <= 1
    assert abs(base_2["costo_mano_obra"] - base_1["costo_mano_obra"] * 2) < 0.01
    assert abs(base_2["costo_gas"] - base_1["costo_gas"] * 2) < 0.01
    assert abs(base_2["costo_formulacion_qq"] - base_1["costo_formulacion_qq"] * 2) < 0.1


def test_scaling_preserves_costo_por_pan():
    # costo_por_pan debe ser idéntico independientemente de la escala
    base_1 = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS, base=Decimal("100"))
    base_2 = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS, base=Decimal("300"))
    assert abs(base_2["costo_por_pan"] - base_1["costo_por_pan"]) < 0.0001


# ── Tests: Casos borde ────────────────────────────────────────────────────────

def test_zero_sell_price():
    result = calc(FRANCES_ID, "Frances", Decimal("0"), FRANCES_INGREDIENTS)
    assert result["venta_total_qq"] == 0.0
    assert result["utilidad_total_qq"] < 0


def test_single_ingredient():
    ings = [IngredientData("Harina", Decimal("100.0"), Decimal("2.41"))]
    result = calc(uuid.uuid4(), "Test", Decimal("0.25"), ings)
    assert result["panes_de_1oz"] == 2133  # int(100*16/0.75) = int(2133.33) con ROUND_HALF_UP
    assert abs(result["total_costo_ingredientes"] - 241.0) < 0.01


def test_output_keys_complete():
    result = calc(FRANCES_ID, "Frances", FRANCES_SELL_PRICE, FRANCES_INGREDIENTS)
    expected_keys = {
        "recipe_id", "recipe_name", "base_harina_lbs",
        "lbs_per_ingredient", "costo_per_ingredient",
        "total_masa_lbs", "total_costo_ingredientes",
        "panes_de_1oz", "filas_de_8_unidades", "panes_por_quintal",
        "labor_with_benefits_per_qq", "gas_cost_per_qq",
        "costo_mano_obra", "costo_gas", "costo_formulacion_qq",
        "costo_por_pan", "sell_price_per_unit",
        "venta_total_qq", "utilidad_total_qq", "utilidad_por_unidad",
        "markup_ratio",
    }
    assert expected_keys == set(result.keys())
