import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
from datetime import datetime

from db.session import get_session
from models import User, Tenant, TenantMember
from api.deps import fastapi_users

current_superuser = fastapi_users.current_user(active=True, superuser=True)
router = APIRouter(tags=["SuperAdmin: Auditoría de Roles"])


class RoleAuditEntry(BaseModel):
    member_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_full_name: Optional[str]
    is_superuser: bool
    tenant_id: uuid.UUID
    tenant_name: str
    member_type: str
    is_active: bool
    assigned_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("/", response_model=List[RoleAuditEntry])
async def list_roles_audit(
    member_type: Optional[str] = Query(None, description="Filtrar por tipo: owner, admin, employee"),
    tenant_id: Optional[uuid.UUID] = Query(None, description="Filtrar por empresa"),
    session: AsyncSession = Depends(get_session),
    _user=Depends(current_superuser),
):
    query = (
        select(TenantMember, User, Tenant)
        .join(User, User.id == TenantMember.user_id)
        .join(Tenant, Tenant.id == TenantMember.tenant_id)
        .order_by(Tenant.name, TenantMember.member_type, User.email)
    )

    if member_type:
        query = query.where(TenantMember.member_type == member_type)
    if tenant_id:
        query = query.where(TenantMember.tenant_id == tenant_id)

    result = await session.execute(query)
    rows = result.all()

    return [
        RoleAuditEntry(
            member_id=member.id,
            user_id=user.id,
            user_email=user.email,
            user_full_name=user.full_name,
            is_superuser=user.is_superuser,
            tenant_id=tenant.id,
            tenant_name=tenant.name,
            member_type=member.member_type,
            is_active=member.is_active,
            assigned_at=member.created_at,
        )
        for member, user, tenant in rows
    ]
