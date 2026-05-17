"""
MÓDULO 5: CIERRE — Transición de Turno
- GET  /api/cierre/summary   → Resumen de ventas del día (para mostrar en pantalla)
- POST /api/cierre/           → Cerrar turno (registra ShiftRegister)
- GET  /api/cierre/           → Historial de cierres del tenant
"""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import Sale, ShiftRegister
from models.schemas import ShiftSummary, ShiftClose, ShiftRegisterRead

router = APIRouter(tags=["Cierre (Transición de Turno)"])


async def _today_summary(tenant_id: uuid.UUID, session: AsyncSession) -> ShiftSummary:
    today_start = datetime.combine(date.today(), datetime.min.time())

    result = await session.execute(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            Sale.created_at >= today_start,
        )
    )
    sales = result.scalars().all()

    efectivo = sum(s.total for s in sales if s.payment_method == "efectivo")
    tarjeta = sum(s.total for s in sales if s.payment_method != "efectivo")
    total = efectivo + tarjeta
    tickets = len(sales)
    promedio = (total / tickets) if tickets > 0 else 0.0

    return ShiftSummary(
        efectivo=efectivo,
        tarjeta=tarjeta,
        total=total,
        tickets=tickets,
        promedio=promedio,
    )


@router.get("/summary", response_model=ShiftSummary)
async def get_summary(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await _today_summary(tenant_id, session)


@router.post("/", response_model=ShiftRegisterRead, status_code=status.HTTP_201_CREATED)
async def close_shift(
    body: ShiftClose,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    summary = await _today_summary(tenant_id, session)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    shift = ShiftRegister(
        tenant_id=tenant_id,
        expected_cash=summary.efectivo,
        actual_cash=body.actual_cash,
        difference=body.actual_cash - summary.efectivo,
        card_total=summary.tarjeta,
        total_sales=summary.total,
        ticket_count=summary.tickets,
        notes=body.notes,
        closed_at=now,
    )
    session.add(shift)
    await session.commit()
    await session.refresh(shift)
    return shift


@router.get("/", response_model=list[ShiftRegisterRead])
async def list_shifts(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShiftRegister)
        .where(ShiftRegister.tenant_id == tenant_id, ShiftRegister.is_active == True)
        .order_by(ShiftRegister.closed_at.desc())
        .limit(30)
    )
    return result.scalars().all()
