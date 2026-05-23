"""
MÓDULO 6: GASTOS GENERALES (OPEX)
- GET    /api/gastos/?month=YYYY-MM         → Listar gastos del mes agrupados por categoría
- POST   /api/gastos/                       → Crear línea de gasto
- PATCH  /api/gastos/{id}                   → Editar línea
- DELETE /api/gastos/{id}                   → Soft-delete
- GET    /api/gastos/summary?month=YYYY-MM  → Totales por categoría
"""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import ExpenseLine, ExpenseCategory
from models.schemas import (
    ExpenseLineCreate, ExpenseLineUpdate, ExpenseLineRead,
    ExpenseSummary, ExpenseCategoryTotals,
)

router = APIRouter(tags=["Gastos Generales (OPEX)"])


def _parse_month(month_str: str) -> date:
    """Convierte 'YYYY-MM' al primer día del mes como date."""
    try:
        parts = month_str.split("-")
        return date(int(parts[0]), int(parts[1]), 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail="Formato de mes inválido. Use YYYY-MM (ej: 2024-11)")


def _to_read(line: ExpenseLine) -> ExpenseLineRead:
    return ExpenseLineRead(
        id=line.id,
        tenant_id=line.tenant_id,
        category=ExpenseCategory(line.category),
        cost_center=line.cost_center,
        concept=line.concept,
        qty=float(line.qty),
        unit_cost=float(line.unit_cost),
        total=round(float(line.qty) * float(line.unit_cost), 2),
        month=line.month,
        notes=line.notes,
        is_active=line.is_active,
        created_at=line.created_at,
    )


@router.get("/summary", response_model=ExpenseSummary)
async def get_summary(
    month: str = Query(..., description="Mes en formato YYYY-MM"),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    month_date = _parse_month(month)
    result = await session.execute(
        select(ExpenseLine).where(
            ExpenseLine.tenant_id == tenant_id,
            ExpenseLine.month == month_date,
            ExpenseLine.is_active == True,
        ).order_by(ExpenseLine.category, ExpenseLine.cost_center, ExpenseLine.concept)
    )
    lines = result.scalars().all()

    grouped: dict[str, list[ExpenseLineRead]] = {
        "operating_expense": [],
        "owner_drawing": [],
        "financing_cost": [],
    }
    totals = ExpenseCategoryTotals()

    for line in lines:
        read = _to_read(line)
        cat = ExpenseCategory(line.category).value
        grouped[cat].append(read)
        setattr(totals, cat, round(getattr(totals, cat) + read.total, 2))

    totals.total = round(totals.operating_expense + totals.owner_drawing + totals.financing_cost, 2)

    return ExpenseSummary(month=month_date, expenses=grouped, totals=totals)


@router.get("/", response_model=ExpenseSummary)
async def list_expenses(
    month: str = Query(..., description="Mes en formato YYYY-MM"),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await get_summary(month=month, tenant_id=tenant_id, session=session)


@router.post("/", response_model=ExpenseLineRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: ExpenseLineCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # Normalizar month al primer día del mes
    month_normalized = date(body.month.year, body.month.month, 1)
    line = ExpenseLine(
        tenant_id=tenant_id,
        category=body.category.value,
        cost_center=body.cost_center,
        concept=body.concept,
        qty=body.qty,
        unit_cost=body.unit_cost,
        month=month_normalized,
        notes=body.notes,
    )
    session.add(line)
    await session.commit()
    await session.refresh(line)
    return _to_read(line)


@router.patch("/{expense_id}", response_model=ExpenseLineRead)
async def update_expense(
    expense_id: uuid.UUID,
    body: ExpenseLineUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(ExpenseLine, expense_id)
    if not line or line.tenant_id != tenant_id or not line.is_active:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    data = body.model_dump(exclude_none=True)
    if "category" in data:
        data["category"] = data["category"].value
    if "month" in data:
        m = data["month"]
        data["month"] = date(m.year, m.month, 1)

    for field, value in data.items():
        setattr(line, field, value)
    line.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(line)
    await session.commit()
    await session.refresh(line)
    return _to_read(line)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(ExpenseLine, expense_id)
    if not line or line.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    line.is_active = False
    line.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(line)
    await session.commit()
