"""
Script de seed para gastos generales (OPEX).
Carga ~70 líneas representativas del Excel de panadería para un mes base.

Uso:
    python seed_gastos.py --tenant-id <UUID> --month 2024-11

Las líneas están basadas en las categorías del Excel original.
Ajusta los valores de unit_cost para que coincidan con tu Excel.
"""
import asyncio
import argparse
import sys
from datetime import date
from decimal import Decimal
from uuid import UUID

# Datos del Excel mapeados a ExpenseLine
# Formato: (category, cost_center, concept, qty, unit_cost)
EXPENSE_SEEDS = [
    # ── OPERATING EXPENSE: Administrativos ────────────────────────────────────
    ("operating_expense", "administrativos", "Sueldo Administrador",          1,  4392.37),
    ("operating_expense", "administrativos", "Sueldo Vendedor 1",             1,  3200.00),
    ("operating_expense", "administrativos", "Sueldo Vendedor 2",             1,  3200.00),
    ("operating_expense", "administrativos", "Sueldo Cajero",                 1,  2800.00),
    ("operating_expense", "administrativos", "Sueldo Panadero Principal",     1,  4800.00),
    ("operating_expense", "administrativos", "Sueldo Ayudante Panadería 1",   1,  2500.00),
    ("operating_expense", "administrativos", "Sueldo Ayudante Panadería 2",   1,  2500.00),
    ("operating_expense", "administrativos", "Sueldo Repartidor",             1,  2800.00),
    ("operating_expense", "administrativos", "Bono 14 provisión mensual",     1,  2575.03),
    ("operating_expense", "administrativos", "Aguinaldo provisión mensual",   1,  2575.03),
    ("operating_expense", "administrativos", "Indemnización provisión",       1,  1287.51),
    ("operating_expense", "administrativos", "IGSS patronal (12.67%)",        1,  3267.55),
    ("operating_expense", "administrativos", "Alquiler local",                1,  8500.00),
    ("operating_expense", "administrativos", "Energía eléctrica",             1,  2100.00),
    ("operating_expense", "administrativos", "Agua potable",                  1,   380.00),
    ("operating_expense", "administrativos", "Internet + teléfono",           1,   450.00),
    ("operating_expense", "administrativos", "Contabilidad",                  1,   750.00),
    ("operating_expense", "administrativos", "Publicidad y redes sociales",   1,   500.00),
    ("operating_expense", "administrativos", "Mantenimiento maquinaria",      1,   800.00),
    ("operating_expense", "administrativos", "Limpieza e insumos",            1,   350.00),
    ("operating_expense", "administrativos", "Uniformes y equipo de trabajo", 1,   200.00),
    ("operating_expense", "administrativos", "Transporte y combustible",      1,  1200.00),
    ("operating_expense", "administrativos", "Impuesto de circulación",       1,   150.00),
    ("operating_expense", "administrativos", "Papelería y útiles",            1,   180.00),
    ("operating_expense", "administrativos", "Seguro de local",               1,   420.00),
    ("operating_expense", "administrativos", "Imprevistos administrativos",   1,   600.00),
    # ── OPERATING EXPENSE: Empaques ───────────────────────────────────────────
    ("operating_expense", "empaques", "Bolsas de pan francés (paquete)",      10,   85.00),
    ("operating_expense", "empaques", "Bolsas champurradas (paquete)",        5,    95.00),
    ("operating_expense", "empaques", "Cajas para tortas (unidad)",           50,    4.50),
    ("operating_expense", "empaques", "Papel encerado (rollo)",               8,    45.00),
    ("operating_expense", "empaques", "Cinta adhesiva (rollo)",               12,    8.00),
    ("operating_expense", "empaques", "Etiquetas precio (millar)",            2,    75.00),
    ("operating_expense", "empaques", "Bolsas plásticas medianas",            5,    55.00),
    ("operating_expense", "empaques", "Cajas de cartón medianas",             30,   12.00),
    # ── OPERATING EXPENSE: Producción / Insumos ───────────────────────────────
    ("operating_expense", "produccion", "Gas propano cilindro 100 lbs",       12,  545.10),
    ("operating_expense", "produccion", "Aceite vegetal",                     4,   145.00),
    ("operating_expense", "produccion", "Desinfectante industria alimentaria", 3,   185.00),
    ("operating_expense", "produccion", "Moldes y latas reposición",          1,   450.00),
    ("operating_expense", "produccion", "Herramientas y utensilios",          1,   200.00),
    # ── OPERATING EXPENSE: Ventas ─────────────────────────────────────────────
    ("operating_expense", "ventas", "Comisión plataformas delivery (3%)",     1,   890.00),
    ("operating_expense", "ventas", "Bolsas de despacho mostrador",          10,    45.00),
    ("operating_expense", "ventas", "Servilletas (paquete x 500)",            8,    22.00),
    # ── OPERATING EXPENSE: Mantenimiento ──────────────────────────────────────
    ("operating_expense", "mantenimiento", "Mantenimiento horno principal",   1,   650.00),
    ("operating_expense", "mantenimiento", "Mantenimiento batidora",          1,   350.00),
    ("operating_expense", "mantenimiento", "Reparación menor general",        1,   400.00),
    ("operating_expense", "mantenimiento", "Fumigación local",                1,   250.00),
    # ── OWNER DRAWING ─────────────────────────────────────────────────────────
    ("owner_drawing", None, "Retiro mensual propietario principal",  1, 15000.00),
    ("owner_drawing", None, "Retiro mensual socio",                  1,  8000.00),
    ("owner_drawing", None, "Gastos personales propietario",         1,  3500.00),
    ("owner_drawing", None, "Colegio hijos propietario",             1,  2800.00),
    ("owner_drawing", None, "Gasolina vehículo personal",            1,   750.00),
    ("owner_drawing", None, "Seguro médico familia propietario",     1,  1200.00),
    ("owner_drawing", None, "Ropa y gastos personales",              1,  1200.00),
    ("owner_drawing", None, "Vacaciones / viajes",                   1,  1821.00),
    # ── FINANCING COST ────────────────────────────────────────────────────────
    ("financing_cost", None, "Cuota préstamo banco A (capital)",     1,  3500.00),
    ("financing_cost", None, "Intereses préstamo banco A",           1,   875.00),
    ("financing_cost", None, "Cuota préstamo banco B (capital)",     1,  2000.00),
    ("financing_cost", None, "Intereses préstamo banco B",           1,   480.00),
    ("financing_cost", None, "Comisión mantenimiento cuenta",        1,   125.00),
    ("financing_cost", None, "Comisión transferencias",              1,    85.00),
    ("financing_cost", None, "Intereses tarjeta de crédito empresa", 1,   435.00),
    ("financing_cost", None, "Leasing equipo de refrigeración",      1,  1500.00),
    ("financing_cost", None, "Seguro de préstamo",                   1,   200.00),
    ("financing_cost", None, "Comisiones bancarias varias",          1,   100.00),
    ("financing_cost", None, "Diferencial cambiario préstamo USD",   1,   700.00),
]


async def run(tenant_id: UUID, month: date):
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from db.session import get_engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.ext.asyncio import AsyncSession as SAAsyncSession

    from models.bakery import ExpenseLine

    engine = get_engine()
    async with SAAsyncSession(engine) as session:
        inserted = 0
        for (cat, cost_center, concept, qty, unit_cost) in EXPENSE_SEEDS:
            line = ExpenseLine(
                tenant_id=tenant_id,
                category=cat,
                cost_center=cost_center,
                concept=concept,
                qty=Decimal(str(qty)),
                unit_cost=Decimal(str(unit_cost)),
                month=month,
            )
            session.add(line)
            inserted += 1
        await session.commit()
        print(f"✓ {inserted} líneas de gasto insertadas para tenant {tenant_id}, mes {month.strftime('%Y-%m')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed de gastos generales")
    parser.add_argument("--tenant-id", required=True, help="UUID del tenant")
    parser.add_argument("--month", required=True, help="Mes en formato YYYY-MM (ej: 2024-11)")
    args = parser.parse_args()

    try:
        tenant_uuid = UUID(args.tenant_id)
        parts = args.month.split("-")
        month_date = date(int(parts[0]), int(parts[1]), 1)
    except (ValueError, IndexError) as e:
        print(f"Error en parámetros: {e}")
        sys.exit(1)

    asyncio.run(run(tenant_uuid, month_date))
