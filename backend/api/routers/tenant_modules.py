import uuid
from typing import List
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import get_tenant_session
from models import Module, Subscription # <- Cambio aquí
from models.schemas import ModuleRead

router = APIRouter(tags=["Tenant: Mis Módulos Activos"])

@router.get("/my-modules", response_model=List[ModuleRead])
async def get_my_active_modules(
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    session: AsyncSession = Depends(get_tenant_session)
):
    statement = (
        select(Module)
        .join(Subscription, Module.id == Subscription.module_id) # <- Cambio aquí
        .where(Subscription.tenant_id == x_tenant_id)            # <- Cambio aquí
        .where(Module.is_active == True)
        .where(Subscription.status == "active")                  # Extra validación genial gracias a tu modelo
    )
    result = await session.execute(statement)
    return result.scalars().all()