"""
Tests de integración end-to-end: validación contra golden masters del Excel.

Valores de referencia (derivados del Excel de ingeniería inversa):
  Frances 1 quintal (100 lbs harina):
    - total_masa_lbs      = 168.75
    - panes_de_1oz        = 3600
    - costo_formulacion   = 446.14  (ingredientes + mano obra + gas)
    - costo_por_pan       ≈ 0.12393
    - venta_total         = 900.00  (3600 × Q0.25)
    - utilidad_total      ≈ 453.86

Ingredientes Frances (Baker's %, costos en unit_cost_override):
  Harina   100%  Q2.41/lb
  Levadura   1%  Q10.00/lb
  Sal        2%  Q0.40/lb
  Azucar     3%  Q1.96/lb
  Manteca  2.5%  Q3.92/lb
  Mejorador 0.25% Q76.00/lb
  Agua      60%  Q0.00/lb
"""
import pytest
from datetime import date


# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: Cálculo de receta Frances — golden master del Excel
# ─────────────────────────────────────────────────────────────────────────────

async def test_recipe_calculation_frances(client, auth_headers, inventory_ids):
    """
    Crea la receta Frances con sus ingredientes (Baker's % + unit_cost_override)
    y valida que el endpoint /calculate devuelve los valores del golden master.
    """
    # 1. Crear receta
    recipe_resp = await client.post("/api/recetas/", json={
        "name": "Pan Francés (test)",
        "base_unit": "unidades",
        "sell_price": 0.25,
        "panes_por_libra_harina": 36,
        "estimated_yield": 3600.0,
    }, headers=auth_headers)
    assert recipe_resp.status_code == 201, recipe_resp.text
    recipe_id = recipe_resp.json()["id"]

    # 2. Añadir ingredientes con Baker's % y costos del Excel
    frances_ings = [
        ("harina",    100.0,   2.41),
        ("levadura",    1.0,  10.00),
        ("sal",         2.0,   0.40),
        ("azucar",      3.0,   1.96),
        ("manteca",     2.5,   3.92),
        ("mejorador",   0.25, 76.00),
        ("agua",       60.0,   0.00),
    ]
    for key, bp, cost in frances_ings:
        ing_resp = await client.post(
            f"/api/recetas/{recipe_id}/ingredients",
            json={
                "inventory_item_id": inventory_ids[key],
                "bakers_percent": bp,
                "unit_cost_override": cost,
            },
            headers=auth_headers,
        )
        assert ing_resp.status_code == 201, f"Ingrediente {key}: {ing_resp.text}"

    # 3. Llamar al endpoint de cálculo
    calc_resp = await client.get(
        f"/api/recetas/{recipe_id}/calculate",
        headers=auth_headers,
    )
    assert calc_resp.status_code == 200, calc_resp.text
    out = calc_resp.json()

    # 4. Validar golden masters del Excel
    assert abs(out["total_masa_lbs"] - 168.75) < 0.01,          f"masa: {out['total_masa_lbs']}"
    assert out["panes_de_1oz"] == 3600,                           f"panes: {out['panes_de_1oz']}"
    assert abs(out["costo_por_pan"] - 0.12393) < 0.001,          f"costo_pan: {out['costo_por_pan']}"
    assert abs(out["venta_total_qq"] - 900.0) < 0.01,            f"venta: {out['venta_total_qq']}"
    assert abs(out["utilidad_total_qq"] - 453.86) < 1.0,         f"utilidad: {out['utilidad_total_qq']}"
    assert abs(out["costo_formulacion_qq"] - 446.14) < 1.0,      f"costo_form: {out['costo_formulacion_qq']}"

    # Devolver recipe_id para reusar en test de producción
    return recipe_id


# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: Cálculo de métricas diarias al completar orden de producción
# ─────────────────────────────────────────────────────────────────────────────

async def test_production_daily_calculation(client, auth_headers, inventory_ids):
    """
    Crea una orden de 3600 panes (= 1 quintal de harina con 36 panes/lb),
    la completa con actual_units=3600 y valida los campos calculados.

    Golden master (1 quintal):
      harina_lbs      = 100.0   (3600 / 36)
      costo_produccion ≈ 446.14  (costo_formulacion_qq / 100 × 100 lbs)
      venta_esperada   = 900.0   (3600 × Q0.25)
      utilidad_diaria  ≈ 453.86
    """
    # 1. Crear receta Frances con ingredientes
    recipe_resp = await client.post("/api/recetas/", json={
        "name": "Frances Producción (test)",
        "sell_price": 0.25,
        "panes_por_libra_harina": 36,
    }, headers=auth_headers)
    assert recipe_resp.status_code == 201
    recipe_id = recipe_resp.json()["id"]

    frances_ings = [
        ("harina",    100.0,   2.41),
        ("levadura",    1.0,  10.00),
        ("sal",         2.0,   0.40),
        ("azucar",      3.0,   1.96),
        ("manteca",     2.5,   3.92),
        ("mejorador",   0.25, 76.00),
        ("agua",       60.0,   0.00),
    ]
    for key, bp, cost in frances_ings:
        r = await client.post(
            f"/api/recetas/{recipe_id}/ingredients",
            json={"inventory_item_id": inventory_ids[key], "bakers_percent": bp, "unit_cost_override": cost},
            headers=auth_headers,
        )
        assert r.status_code == 201

    # 2. Crear orden de producción (3600 = 1 quintal de panes)
    order_resp = await client.post("/api/cocina/orders", json={
        "recipe_id": recipe_id,
        "quantity": 3600,
    }, headers=auth_headers)
    assert order_resp.status_code == 201
    order_id = order_resp.json()["id"]

    # 3. Completar la orden con las unidades reales
    complete_resp = await client.patch(
        f"/api/cocina/orders/{order_id}/complete",
        json={"actual_units": 3600},
        headers=auth_headers,
    )
    assert complete_resp.status_code == 200, complete_resp.text
    order = complete_resp.json()

    # 4. Validar métricas diarias
    assert order["status"] == "completed"
    assert order["actual_units"] == 3600
    assert order["production_date"] is not None

    assert abs(order["harina_lbs"] - 100.0) < 0.1, \
        f"harina_lbs esperada=100.0, obtenida={order['harina_lbs']}"

    assert abs(order["costo_produccion"] - 446.14) < 1.0, \
        f"costo_produccion esperado≈446.14, obtenido={order['costo_produccion']}"

    assert abs(order["venta_esperada"] - 900.0) < 0.01, \
        f"venta_esperada esperada=900.0, obtenida={order['venta_esperada']}"

    assert abs(order["utilidad_diaria"] - 453.86) < 1.0, \
        f"utilidad_diaria esperada≈453.86, obtenida={order['utilidad_diaria']}"

    # 5. Validar resumen diario del mismo día
    today = date.today().isoformat()
    summary_resp = await client.get(
        f"/api/cocina/daily-summary?date={today}",
        headers=auth_headers,
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["orders_count"] >= 1
    assert summary["harina_total_lbs"] >= 100.0


# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: Consolidación del reporte mensual
# ─────────────────────────────────────────────────────────────────────────────

async def test_monthly_report_consolidation(client, auth_headers):
    """
    Crea un gasto operativo del mes actual y verifica que el reporte mensual:
      - Devuelve la estructura correcta (products, expenses, totals).
      - Incluye la categoría operating_expense.
      - Calcula utilidad_neta = utilidad_bruta - total_gastos.
    """
    today = date.today()
    month_str = today.strftime("%Y-%m")

    # 1. Registrar un gasto operativo
    gasto_resp = await client.post("/api/gastos/", json={
        "category": "operating_expense",
        "concept": "Sueldo Administrador (test)",
        "qty": 1,
        "unit_cost": 4392.37,
        "month": f"{month_str}-01",
    }, headers=auth_headers)
    assert gasto_resp.status_code == 201, gasto_resp.text

    # 2. Generar reporte mensual
    report_resp = await client.get(
        f"/api/reportes/mensual?year={today.year}&month={today.month}",
        headers=auth_headers,
    )
    assert report_resp.status_code == 200, report_resp.text
    report = report_resp.json()

    # 3. Validar estructura del reporte
    assert "products" in report, "Falta campo 'products'"
    assert "totals"   in report, "Falta campo 'totals'"

    totals = report["totals"]
    assert "utilidad_operativa" in totals
    assert "opex_total"         in totals
    assert "utilidad_neta"      in totals

    # 4. Validar coherencia numérica: utilidad_neta = utilidad_operativa - opex_total
    assert abs(
        totals["utilidad_neta"] - (totals["utilidad_operativa"] - totals["opex_total"])
    ) < 0.01, "utilidad_neta debe ser utilidad_operativa - opex_total"

    # 5. Con al menos el gasto registrado, opex_operativo >= 4392.37
    assert totals["opex_operativo"] >= 4392.37, \
        f"opex_operativo esperado >= 4392.37, obtenido={totals['opex_operativo']}"
