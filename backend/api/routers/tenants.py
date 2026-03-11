"""
Router de Tenants (empresas) para el Panel SuperAdmin.
Solo accesible por usuarios con is_superuser=True.
"""
import uuid
from typing import List, Callable, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from models.models import Tenant, User
from models.schemas import TenantRead, TenantCreate, TenantUpdate, UserRead, UserCreate, TenantUserCreate
from api.manager import get_user_manager
from fastapi_users import BaseUserManager


def create_router(current_superuser: Callable[..., Any]) -> APIRouter:
    """Crea el router de tenants inyectando la dependencia de superusuario."""
    router = APIRouter(prefix="/tenants", tags=["tenants"])

    @router.get("/", response_model=List[TenantRead])
    async def list_tenants(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_superuser),
    ):
        """Lista todos los tenants (solo SuperAdmin)."""
        result = await session.execute(select(Tenant).where(Tenant.is_active == True).order_by(Tenant.created_at))
        return result.scalars().all()

    @router.post("/", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
    async def create_tenant(
        body: TenantCreate,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_superuser),
    ):
        """Crea un nuevo tenant (empresa)."""
        tenant = Tenant(name=body.name)
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        return tenant

    @router.get("/{tenant_id}", response_model=TenantRead)
    async def get_tenant(
        tenant_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_superuser),
    ):
        """Obtiene un tenant por ID."""
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        return tenant

    @router.patch("/{tenant_id}", response_model=TenantRead)
    async def update_tenant(
        tenant_id: uuid.UUID,
        body: TenantUpdate,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_superuser),
    ):
        """Actualiza un tenant (nombre y/o is_active)."""
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        if body.name is not None:
            tenant.name = body.name
        if body.is_active is not None:
            tenant.is_active = body.is_active
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        return tenant

    @router.get("/{tenant_id}/users", response_model=List[UserRead])
    async def list_tenant_users(
        tenant_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_superuser),
    ):
        """Lista los usuarios de un tenant."""
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        result = await session.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.email))
        users = result.scalars().all()
        return [UserRead.model_validate(u) for u in users]

    @router.post("/{tenant_id}/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
    async def create_tenant_user(
        tenant_id: uuid.UUID,
        body: TenantUserCreate,
        session: AsyncSession = Depends(get_session),
        user_manager: BaseUserManager[User, uuid.UUID] = Depends(get_user_manager),
        current_user: User = Depends(current_superuser),
    ):
        """Crea un usuario dentro del tenant (el backend asigna tenant_id)."""
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        user_create = UserCreate(
            email=body.email,
            password=body.password,
            tenant_id=tenant_id,
        )
        user = await user_manager.create(user_create, safe=False)
        await session.commit()
        await session.refresh(user)
        return UserRead.model_validate(user)

    return router
