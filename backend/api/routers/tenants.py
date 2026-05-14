import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel

from db.session import get_session
from models import Tenant, User, TenantMember
from models.schemas import TenantRead, TenantCreate, TenantUpdate
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["Tenants (Empresas)"])

class TenantUserCreate(BaseModel):
    email: str
    password: Optional[str] = None
    is_superuser: Optional[bool] = False
    is_active: Optional[bool] = True
    member_type: Optional[str] = "employee"

class TenantUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_superuser: bool
    is_verified: bool
    tenant_id: uuid.UUID
    member_type: Optional[str] = "employee"

@router.post("/", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def create_tenant(tenant_in: TenantCreate, session: AsyncSession = Depends(get_session)):
    db_tenant = Tenant(name=tenant_in.name)
    session.add(db_tenant)
    await session.commit()
    await session.refresh(db_tenant)
    return db_tenant

@router.get("/", response_model=List[TenantRead])
async def list_tenants(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Tenant).order_by(Tenant.name))
    return result.scalars().all()

@router.patch("/{tenant_id}", response_model=TenantRead)
async def update_tenant(tenant_id: uuid.UUID, tenant_in: TenantUpdate, session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
        
    if tenant_in.name is not None:
        tenant.name = tenant_in.name
    if tenant_in.is_active is not None:
        tenant.is_active = tenant_in.is_active
        
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant

class TenantPlanAssign(BaseModel):
    plan_id: uuid.UUID

@router.put("/{tenant_id}/plan", response_model=TenantRead)
async def assign_tenant_plan(
    tenant_id: uuid.UUID, 
    body: TenantPlanAssign, 
    session: AsyncSession = Depends(get_session)
):
    from sqlalchemy import delete
    from models import Subscription, PlanModule, SubscriptionPlan
    
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
        
    plan = await session.get(SubscriptionPlan, body.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
        
    # 1. Borrar todas las suscripciones actuales del tenant
    await session.execute(delete(Subscription).where(Subscription.tenant_id == tenant_id))
    
    # 2. Obtener modulos del plan
    plan_modules = await session.execute(select(PlanModule).where(PlanModule.plan_id == body.plan_id))
    module_ids = [pm.module_id for pm in plan_modules.scalars().all()]
    
    # 3. Asignar modulos al tenant
    for mid in module_ids:
        session.add(Subscription(tenant_id=tenant_id, module_id=mid))
        
    # 4. Guardar plan_id en el tenant
    tenant.plan_id = body.plan_id
    session.add(tenant)
    
    await session.commit()
    await session.refresh(tenant)
    return tenant


class HardDeleteRequest(BaseModel):
    password: str

@router.post("/{tenant_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_tenant(tenant_id: uuid.UUID, body: HardDeleteRequest, session: AsyncSession = Depends(get_session)):
    from core.security_utils import verify_superadmin_password
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
        
    # Cascadas explícitas de buenas prácticas para proteger la BBDD
    from models import TenantMember, Subscription, User, TenantMemberModuleAccess, Invitation
    from sqlalchemy import delete
    
    # 0. Borramos invitaciones de la empresa
    await session.execute(delete(Invitation).where(Invitation.tenant_id == tenant_id))

    # 1. Borramos suscripciones de la empresa
    await session.execute(delete(Subscription).where(Subscription.tenant_id == tenant_id))
    
    # 2. Borramos los permisos de los miembros de esta empresa
    members_result = await session.execute(select(TenantMember.id).where(TenantMember.tenant_id == tenant_id))
    member_ids = members_result.scalars().all()
    if member_ids:
        await session.execute(delete(TenantMemberModuleAccess).where(TenantMemberModuleAccess.tenant_member_id.in_(member_ids)))
    
    # 3. Borramos las membresías de los usuarios a esta empresa
    await session.execute(delete(TenantMember).where(TenantMember.tenant_id == tenant_id))
    
    # 4. Finalmente, borramos la empresa
    await session.delete(tenant)
    await session.commit()
    return None

@router.get("/{tenant_id}/users", response_model=List[TenantUserResponse])
async def list_tenant_users(tenant_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    query = select(User, TenantMember).join(TenantMember, TenantMember.user_id == User.id).where(TenantMember.tenant_id == tenant_id)
    result = await session.execute(query)
    users = []
    for user, member in result:
        users.append(TenantUserResponse(
            id=user.id,
            email=user.email,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            is_verified=user.is_verified,
            tenant_id=member.tenant_id,
            member_type=member.member_type
        ))
    return users

@router.post("/{tenant_id}/users", response_model=TenantUserResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_user(tenant_id: uuid.UUID, user_in: TenantUserCreate, session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    query = select(User).where(User.email == user_in.email)
    existing_user = (await session.execute(query)).scalar_one_or_none()
    
    if not existing_user:
        if not user_in.password:
            raise HTTPException(status_code=400, detail="Password required for new users")
        new_user = User(
            email=user_in.email,
            hashed_password=pwd_context.hash(user_in.password),
            is_active=user_in.is_active,
            is_superuser=user_in.is_superuser,
            is_verified=True, 
        )
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)
        existing_user = new_user
    else:
        existing_user.is_superuser = user_in.is_superuser
        existing_user.is_active = user_in.is_active
        if user_in.password:
            existing_user.hashed_password = pwd_context.hash(user_in.password)
        session.add(existing_user)
        await session.commit()

    # Create membership if it doesn't exist
    mem_query = select(TenantMember).where(TenantMember.user_id == existing_user.id, TenantMember.tenant_id == tenant_id)
    member = (await session.execute(mem_query)).scalar_one_or_none()
    
    if not member:
        new_member = TenantMember(
            user_id=existing_user.id,
            tenant_id=tenant_id,
            member_type=user_in.member_type or "employee"
        )
        session.add(new_member)
        await session.commit()
        await session.refresh(new_member)
        member = new_member
        
    return TenantUserResponse(
        id=existing_user.id,
        email=existing_user.email,
        is_active=existing_user.is_active,
        is_superuser=existing_user.is_superuser,
        is_verified=existing_user.is_verified,
        tenant_id=member.tenant_id,
        member_type=member.member_type
    )

class HardDeleteUserRequest(BaseModel):
    password: str

@router.post("/{tenant_id}/users/{user_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_tenant_user(tenant_id: uuid.UUID, user_id: uuid.UUID, body: HardDeleteUserRequest, session: AsyncSession = Depends(get_session)):
    from core.security_utils import verify_superadmin_password
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        
    query = select(User).where(User.id == user_id)
    user = (await session.execute(query)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    # Cascada manual de buenas prácticas para usuarios
    from sqlalchemy import delete, update
    from models import TenantMember, TenantMemberModuleAccess, Invitation, Tenant, Subscription, Module
    
    # 1. Borramos sus invitaciones
    await session.execute(delete(Invitation).where(Invitation.created_by == user_id))
    
    # 2. Desvinculamos registros de auditoría (created_by)
    await session.execute(update(Tenant).where(Tenant.created_by == user_id).values(created_by=None))
    await session.execute(update(Subscription).where(Subscription.created_by == user_id).values(created_by=None))
    await session.execute(update(Module).where(Module.created_by == user_id).values(created_by=None))
    await session.execute(update(TenantMember).where(TenantMember.created_by == user_id).values(created_by=None))
    await session.execute(update(TenantMemberModuleAccess).where(TenantMemberModuleAccess.created_by == user_id).values(created_by=None))

    # 3. Borramos sus accesos a módulos
    members_result = await session.execute(select(TenantMember.id).where(TenantMember.user_id == user_id))
    member_ids = members_result.scalars().all()
    if member_ids:
         await session.execute(delete(TenantMemberModuleAccess).where(TenantMemberModuleAccess.tenant_member_id.in_(member_ids)))

    # 4. Borramos sus membresías en esta o todas las empresas
    await session.execute(delete(TenantMember).where(TenantMember.user_id == user_id))
    
    # Finalmente borramos al usuario (FastAPI users lo elimina limpiamente)
    await session.delete(user)
    await session.commit()
    return None

@router.get("/{tenant_id}/users/{user_id}/modules", response_model=List[uuid.UUID])
async def get_tenant_user_modules(tenant_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    mem_query = select(TenantMember).where(TenantMember.user_id == user_id, TenantMember.tenant_id == tenant_id)
    member = (await session.execute(mem_query)).scalar_one_or_none()
    if not member:
        return []
    
    from models import TenantMemberModuleAccess
    mod_query = select(TenantMemberModuleAccess.module_id).where(TenantMemberModuleAccess.tenant_member_id == member.id)
    result = await session.execute(mod_query)
    return result.scalars().all()

@router.put("/{tenant_id}/users/{user_id}/modules", response_model=List[uuid.UUID])
async def update_tenant_user_modules(tenant_id: uuid.UUID, user_id: uuid.UUID, module_ids: List[uuid.UUID], session: AsyncSession = Depends(get_session)):
    mem_query = select(TenantMember).where(TenantMember.user_id == user_id, TenantMember.tenant_id == tenant_id)
    member = (await session.execute(mem_query)).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Membresía no encontrada")
        
    from sqlalchemy import delete
    from models import TenantMemberModuleAccess
    
    await session.execute(delete(TenantMemberModuleAccess).where(TenantMemberModuleAccess.tenant_member_id == member.id))
    
    for mid in module_ids:
        session.add(TenantMemberModuleAccess(tenant_member_id=member.id, module_id=mid))
        
    await session.commit()
    return module_ids