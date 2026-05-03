import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from pydantic import BaseModel
from sqlmodel import select

from db.session import get_session
from models import Module, Tenant, Subscription # <- Cambio aquí
from models.schemas import ModuleRead, ModuleCreate, ModuleUpdate
from api.deps import fastapi_users

current_superuser = fastapi_users.current_user(active=True, superuser=True)
router = APIRouter(tags=["SuperAdmin: Módulos (Suscripciones)"])

# ... (Mantén intacto tu bloque de CRUD DE MÓDULOS GLOBALES que ya tenías) ...

@router.get("/", response_model=List[ModuleRead])
async def list_modules(session: AsyncSession = Depends(get_session), user = Depends(current_superuser)):
    result = await session.execute(select(Module).order_by(Module.code))
    return result.scalars().all()

@router.post("/", response_model=ModuleRead, status_code=status.HTTP_201_CREATED)
async def create_module(body: ModuleCreate, session: AsyncSession = Depends(get_session), user = Depends(current_superuser)):
    existing = await session.execute(select(Module).where(Module.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe un módulo con ese código")
    mod = Module(name=body.name, code=body.code.strip().upper(), description=body.description)
    session.add(mod)
    await session.commit()
    await session.refresh(mod)
    return mod

@router.patch("/{module_id}", response_model=ModuleRead)
async def update_module(module_id: uuid.UUID, body: ModuleUpdate, session: AsyncSession = Depends(get_session), user = Depends(current_superuser)):
    result = await session.execute(select(Module).where(Module.id == module_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    if body.name is not None: mod.name = body.name
    if body.code is not None: mod.code = body.code.strip().upper()
    if body.description is not None: mod.description = body.description
    if body.is_active is not None: mod.is_active = body.is_active
    session.add(mod)
    await session.commit()
    await session.refresh(mod)
    await session.refresh(mod)
    return mod

class HardDeleteModuleRequest(BaseModel):
    password: str

@router.post("/{module_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_module(module_id: uuid.UUID, body: HardDeleteModuleRequest, session: AsyncSession = Depends(get_session)):
    from core.security_utils import verify_superadmin_password
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        
    result = await session.execute(select(Module).where(Module.id == module_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
        
    # Borrar relaciones de suscripción a módulos
    await session.execute(delete(Subscription).where(Subscription.module_id == module_id))
    
    # Borrar relaciones en PlanModule
    from models import PlanModule
    await session.execute(delete(PlanModule).where(PlanModule.module_id == module_id))
    
    # Borrar vinculación en RoleModuleAccess
    from models import RoleModuleAccess
    await session.execute(delete(RoleModuleAccess).where(RoleModuleAccess.module_id == module_id))

    await session.delete(mod)
    await session.commit()
    return None

# ==========================================
# ASIGNACIÓN A EMPRESAS (USANDO SUBSCRIPTION)
# ==========================================

@router.get("/tenant/{tenant_id}", response_model=List[ModuleRead])
async def list_tenant_modules(
    tenant_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user = Depends(current_superuser),
):
    result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
        
    # Usamos Subscription en lugar de TenantModuleLink
    links = await session.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))
    module_ids = [l.module_id for l in links.scalars().all()]
    if not module_ids:
        return []
        
    result = await session.execute(select(Module).where(Module.id.in_(module_ids), Module.is_active == True))
    return result.scalars().all()

@router.put("/tenant/{tenant_id}", response_model=List[ModuleRead])
async def set_tenant_modules(
    tenant_id: uuid.UUID,
    body: List[uuid.UUID],
    session: AsyncSession = Depends(get_session),
    user = Depends(current_superuser),
):
    result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
        
    # Borramos suscripciones anteriores
    await session.execute(delete(Subscription).where(Subscription.tenant_id == tenant_id))
    
    # Creamos las nuevas suscripciones
    for mid in body:
        mod = await session.execute(select(Module).where(Module.id == mid))
        if mod.scalar_one_or_none():
            # Tu modelo Subscription asigna status='active' e id por defecto
            session.add(Subscription(tenant_id=tenant_id, module_id=mid))
            
    await session.commit()
    
    links = await session.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))
    module_ids = [l.module_id for l in links.scalars().all()]
    if not module_ids:
        return []
        
    result = await session.execute(select(Module).where(Module.id.in_(module_ids)))
    return result.scalars().all()