"""
MÓDULO 7: REPORTES (P&L Mensual)
- GET /api/reportes/mensual?year=2024&month=11  → MonthlyReportGenerator.generate()
"""
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_session
from api.deps import get_current_tenant_id
from api.services.monthly_report import MonthlyReportGenerator
from models.schemas import MonthlyReportResponse

router = APIRouter(tags=["Reportes (P&L)"])


@router.get("/mensual", response_model=MonthlyReportResponse)
async def get_monthly_report(
    year: int = Query(..., ge=2020, le=2099, description="Año (ej: 2024)"),
    month: int = Query(..., ge=1, le=12, description="Mes 1-12"),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await MonthlyReportGenerator.generate(
        db=session,
        tenant_id=tenant_id,
        year=year,
        month=month,
    )
