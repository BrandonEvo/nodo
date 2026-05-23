import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import get_tenant_session, current_active_user
from models import TenantMember, User
from models.schemas import TenantMemberRead, TenantMemberCreate

router = APIRouter(tags=["Membresías (Asignar Empleados)"])


async def _require_tenant_admin(user: User, tenant_id: uuid.UUID, session: AsyncSession) -> TenantMember:
    """Raises 403 unless user is owner/admin of tenant_id."""
    if user.is_superuser:
        return  # superusers bypass tenant-admin check
    result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == user.id,
            TenantMember.tenant_id == tenant_id,
            TenantMember.is_active == True,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership or membership.member_type not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores del tenant pueden gestionar membresías",
        )
    return membership


@router.post("/", response_model=TenantMemberRead, status_code=status.HTTP_201_CREATED)
async def add_employee_to_tenant(
    member_in: TenantMemberCreate,
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    await _require_tenant_admin(current_user, x_tenant_id, session)

    user = await session.get(User, member_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario global no encontrado")

    db_member = TenantMember(
        user_id=member_in.user_id,
        tenant_id=x_tenant_id,
        member_type=member_in.member_type,
    )
    session.add(db_member)
    await session.commit()
    await session.refresh(db_member)
    return db_member


@router.get("/", response_model=List[TenantMemberRead])
async def list_tenant_employees(
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    await _require_tenant_admin(current_user, x_tenant_id, session)
    result = await session.execute(
        select(TenantMember).where(TenantMember.tenant_id == x_tenant_id)
    )
    return result.scalars().all()
