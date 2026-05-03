import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import get_tenant_session
from models import Role
from models.schemas import RoleRead, RoleCreate, RoleUpdate

router = APIRouter(tags=["Roles (RBAC - Protegido por RLS)"])

@router.post("/", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_in: RoleCreate,
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    session: AsyncSession = Depends(get_tenant_session)
):
    # El middleware ya validó el JWT y seteó el contexto RLS.
    # Creamos el rol asignándolo directamente a la empresa del Header.
    db_role = Role(name=role_in.name, tenant_id=x_tenant_id, is_custom=True)
    session.add(db_role)
    await session.commit()
    await session.refresh(db_role)
    return db_role

@router.get("/", response_model=List[RoleRead])
async def list_roles(session: AsyncSession = Depends(get_tenant_session)):
    # MAGIA RLS: Un simple 'SELECT * FROM roles'. 
    # PostgreSQL intercepta la consulta y solo devuelve los roles que coinciden 
    # con el x-tenant-id inyectado por la dependencia en la conexión.
    result = await session.execute(select(Role))
    return result.scalars().all()

@router.put("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: uuid.UUID,
    role_in: RoleUpdate,
    session: AsyncSession = Depends(get_tenant_session)
):
    role = await session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    if role_in.name is not None:
        role.name = role_in.name
    if role_in.is_active is not None:
        role.is_active = role_in.is_active
        
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return role

@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: uuid.UUID,
    session: AsyncSession = Depends(get_tenant_session)
):
    role = await session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    role.is_active = False
    session.add(role)
    await session.commit()
    return None