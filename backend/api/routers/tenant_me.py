"""
Router para el admin del tenant: roles y asignación a empleados.
Solo usuarios con is_tenant_admin=True (o superuser) del mismo tenant.
"""
import uuid
from typing import List, Callable, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from models import User, Role, Tenant, TenantMember
from models.schemas import UserRead, RoleRead, RoleCreate, RoleUpdate


def _tenant_admin_or_superuser(user: User) -> bool:
    return user.is_superuser or user.is_tenant_admin


def create_tenant_me_router(
    current_user_active: Callable[..., Any],
) -> APIRouter:
    """
    current_user_active: dependencia que devuelve el usuario actual (activo).
    Las rutas comprueban is_tenant_admin o is_superuser y tenant_id.
    """
    router = APIRouter(prefix="/me/tenant", tags=["tenant-admin"])

    @router.get("/", response_model=dict)
    async def get_my_tenant(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        """Devuelve el tenant del usuario actual (para selector de org en frontend)."""
        mem_result = await session.execute(
            select(TenantMember).where(TenantMember.user_id == current_user.id)
        )
        member = mem_result.scalars().first()
        if not member:
            raise HTTPException(status_code=404, detail="User has no tenant")
            
        result = await session.execute(select(Tenant).where(Tenant.id == member.tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        return {"id": str(tenant.id), "name": tenant.name}

    @router.get("/roles", response_model=List[RoleRead])
    async def list_my_tenant_roles(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        if not _tenant_admin_or_superuser(current_user):
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede gestionar roles")
        result = await session.execute(
            select(Role).where(Role.tenant_id == current_user.tenant_id, Role.is_active == True).order_by(Role.code)
        )
        return result.scalars().all()

    @router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
    async def create_my_tenant_role(
        body: RoleCreate,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        if not _tenant_admin_or_superuser(current_user):
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede crear roles")
        code = body.code.strip().upper()
        existing = await session.execute(
            select(Role).where(Role.tenant_id == current_user.tenant_id, Role.code == code)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Ya existe un rol con ese code en esta empresa")
        role = Role(name=body.name, code=code, tenant_id=current_user.tenant_id)
        session.add(role)
        await session.commit()
        await session.refresh(role)
        return role

    @router.patch("/roles/{role_id}", response_model=RoleRead)
    async def update_my_tenant_role(
        role_id: uuid.UUID,
        body: RoleUpdate,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        if not _tenant_admin_or_superuser(current_user):
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede editar roles")
        result = await session.execute(
            select(Role).where(Role.id == role_id, Role.tenant_id == current_user.tenant_id)
        )
        role = result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=404, detail="Rol no encontrado")
        if body.name is not None:
            role.name = body.name
        if body.code is not None:
            role.code = body.code.strip().upper()
        if body.is_active is not None:
            role.is_active = body.is_active
        session.add(role)
        await session.commit()
        await session.refresh(role)
        return role

    @router.get("/users", response_model=List[UserRead])
    async def list_my_tenant_users(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        if not _tenant_admin_or_superuser(current_user):
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede listar usuarios")
        result = await session.execute(
            select(User).where(User.tenant_id == current_user.tenant_id).order_by(User.email)
        )
        users = result.scalars().all()
        return [UserRead.model_validate(u) for u in users]

    @router.patch("/users/{user_id}/role")
    async def set_user_role(
        user_id: uuid.UUID,
        body: dict,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        if not _tenant_admin_or_superuser(current_user):
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede asignar roles")
        role_id = body.get("role_id")
        result = await session.execute(
            select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if role_id is not None:
            role_result = await session.execute(
                select(Role).where(Role.id == role_id, Role.tenant_id == current_user.tenant_id)
            )
            if role_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Rol no encontrado")
        user.role_id = role_id
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return {"id": str(user.id), "role_id": str(user.role_id) if user.role_id else None}

    return router
