import uuid
from typing import List
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import get_tenant_session, fastapi_users
from models import Module, Subscription, TenantMember, TenantMemberModuleAccess
from models.schemas import ModuleRead

router = APIRouter(tags=["Tenant: Mis Módulos Activos"])
current_user_active = fastapi_users.current_user(active=True)

@router.get("/my-modules", response_model=List[ModuleRead])
async def get_my_active_modules(
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: "User" = Depends(current_user_active) # type: ignore
):
    # Find membership
    mem_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.tenant_id == x_tenant_id,
            TenantMember.is_active == True
        )
    )
    membership = mem_result.scalar_one_or_none()
    
    if not membership and not current_user.is_superuser:
        return []

    # Check member type
    is_admin = current_user.is_superuser or (membership and membership.member_type in ("owner", "admin"))

    if is_admin:
        statement = (
            select(Module)
            .join(Subscription, Module.id == Subscription.module_id)
            .where(Subscription.tenant_id == x_tenant_id)
            .where(Module.is_active == True)
            .where(Subscription.status == "active")
        )
    else:
        # Employee filtering
        statement = (
            select(Module)
            .join(Subscription, Module.id == Subscription.module_id)
            .join(TenantMemberModuleAccess, Module.id == TenantMemberModuleAccess.module_id)
            .where(Subscription.tenant_id == x_tenant_id)
            .where(TenantMemberModuleAccess.tenant_member_id == membership.id)
            .where(Module.is_active == True)
            .where(Subscription.status == "active")
        )

    result = await session.execute(statement)
    return result.scalars().all()