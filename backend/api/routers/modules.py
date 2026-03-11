"""
Router de Módulos para el Panel SuperAdmin.
Asignación de módulos a tenants según lo que paguen.
"""
import uuid
from typing import List, Callable, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from sqlmodel import select

from db.session import get_session
from models.models import Module, Tenant, TenantModuleLink
from models.schemas import ModuleRead, ModuleCreate, ModuleUpdate


def create_modules_router(current_superuser: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/modules", tags=["modules"])

    @router.get("/", response_model=List[ModuleRead])
    async def list_modules(
        session: AsyncSession = Depends(get_session),
        current_user=Depends(current_superuser),
    ):
        result = await session.execute(select(Module).where(Module.is_active == True).order_by(Module.code))
        return result.scalars().all()

    @router.post("/", response_model=ModuleRead, status_code=status.HTTP_201_CREATED)
    async def create_module(
        body: ModuleCreate,
        session: AsyncSession = Depends(get_session),
        current_user=Depends(current_superuser),
    ):
        existing = await session.execute(select(Module).where(Module.code == body.code))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Ya existe un módulo con ese code")
        mod = Module(name=body.name, code=body.code.strip().upper(), description=body.description)
        session.add(mod)
        await session.commit()
        await session.refresh(mod)
        return mod

    @router.patch("/{module_id}", response_model=ModuleRead)
    async def update_module(
        module_id: uuid.UUID,
        body: ModuleUpdate,
        session: AsyncSession = Depends(get_session),
        current_user=Depends(current_superuser),
    ):
        result = await session.execute(select(Module).where(Module.id == module_id))
        mod = result.scalar_one_or_none()
        if not mod:
            raise HTTPException(status_code=404, detail="Módulo no encontrado")
        if body.name is not None:
            mod.name = body.name
        if body.code is not None:
            mod.code = body.code.strip().upper()
        if body.description is not None:
            mod.description = body.description
        if body.is_active is not None:
            mod.is_active = body.is_active
        session.add(mod)
        await session.commit()
        await session.refresh(mod)
        return mod

    return router


def create_tenant_modules_router(current_superuser: Callable[..., Any]) -> APIRouter:
    """Asignar módulos a un tenant (SuperAdmin)."""
    router = APIRouter(prefix="/tenants", tags=["tenant-modules"])

    @router.get("/{tenant_id}/modules", response_model=List[ModuleRead])
    async def list_tenant_modules(
        tenant_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
        current_user=Depends(current_superuser),
    ):
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        links = await session.execute(select(TenantModuleLink).where(TenantModuleLink.tenant_id == tenant_id))
        module_ids = [l.module_id for l in links.scalars().all()]
        if not module_ids:
            return []
        result = await session.execute(select(Module).where(Module.id.in_(module_ids), Module.is_active == True))
        return result.scalars().all()

    @router.put("/{tenant_id}/modules", response_model=List[ModuleRead])
    async def set_tenant_modules(
        tenant_id: uuid.UUID,
        body: List[uuid.UUID],
        session: AsyncSession = Depends(get_session),
        current_user=Depends(current_superuser),
    ):
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        await session.execute(delete(TenantModuleLink).where(TenantModuleLink.tenant_id == tenant_id))
        for mid in body:
            mod = await session.execute(select(Module).where(Module.id == mid))
            if mod.scalar_one_or_none():
                session.add(TenantModuleLink(tenant_id=tenant_id, module_id=mid))
        await session.commit()
        links = await session.execute(select(TenantModuleLink).where(TenantModuleLink.tenant_id == tenant_id))
        module_ids = [l.module_id for l in links.scalars().all()]
        if not module_ids:
            return []
        result = await session.execute(select(Module).where(Module.id.in_(module_ids)))
        return result.scalars().all()

    return router
