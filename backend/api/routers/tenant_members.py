import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import get_tenant_session
from models import TenantMember, User, Role
from models.schemas import TenantMemberRead, TenantMemberCreate

router = APIRouter(tags=["Membresías (Asignar Empleados)"])

@router.post("/", response_model=TenantMemberRead, status_code=status.HTTP_201_CREATED)
async def add_employee_to_tenant(
    member_in: TenantMemberCreate,
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    session: AsyncSession = Depends(get_tenant_session)
):
    # 1. Validar que el usuario a invitar exista a nivel global
    user = await session.get(User, member_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario global no encontrado")

    # 2. Validar que el Rol exista. 
    # (Nota Enterprise: Como usamos get_tenant_session, si el rol es de OTRA empresa, 
    # PostgreSQL lo ocultará por RLS y esto devolverá None automáticamente. ¡Magia de seguridad!)
    role = await session.get(Role, member_in.role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado o acceso denegado")

    # 3. Crear el vínculo M:N
    db_member = TenantMember(
        user_id=member_in.user_id,
        tenant_id=x_tenant_id,
        role_id=member_in.role_id
    )
    session.add(db_member)
    await session.commit()
    await session.refresh(db_member)
    return db_member

@router.get("/", response_model=List[TenantMemberRead])
async def list_tenant_employees(session: AsyncSession = Depends(get_tenant_session)):
    # RLS filtrará automáticamente para devolver solo los empleados de x-tenant-id
    result = await session.execute(select(TenantMember))
    return result.scalars().all()