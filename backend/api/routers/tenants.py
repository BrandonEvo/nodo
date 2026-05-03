import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel

from db.session import get_session
from models import Tenant, User, TenantMember, Role
from models.schemas import TenantRead, TenantCreate, TenantUpdate
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["Tenants (Empresas)"])

class TenantUserCreate(BaseModel):
    email: str
    password: Optional[str] = None
    is_superuser: Optional[bool] = False
    is_active: Optional[bool] = True

class TenantUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_superuser: bool
    is_verified: bool
    tenant_id: uuid.UUID

class RoleCreateSimple(BaseModel):
    name: str

class RoleResponseSimple(BaseModel):
    id: uuid.UUID
    name: str
    is_custom: bool
    is_active: bool
    tenant_id: Optional[uuid.UUID]

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
    from models import TenantMember, Role, Subscription, User
    from sqlalchemy import delete
    
    # 1. Borramos suscripciones de la empresa
    await session.execute(delete(Subscription).where(Subscription.tenant_id == tenant_id))
    
    # 2. Borramos las membresías de los usuarios a esta empresa
    await session.execute(delete(TenantMember).where(TenantMember.tenant_id == tenant_id))
    
    # 3. Borramos los roles que pertenecen exclusivamente a esta empresa (y sus permisos)
    from models import RoleModuleAccess
    roles_result = await session.execute(select(Role).where(Role.tenant_id == tenant_id))
    for r in roles_result.scalars().all():
        await session.execute(delete(RoleModuleAccess).where(RoleModuleAccess.role_id == r.id))
    await session.execute(delete(Role).where(Role.tenant_id == tenant_id))
    
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
            tenant_id=member.tenant_id
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
        # get any role for this tenant just to associate
        role_query = select(Role).where(Role.tenant_id == tenant_id)
        role = (await session.execute(role_query)).scalars().first()
        # if no role exists for tenant, try global role
        if not role:
             role_query = select(Role).where(Role.tenant_id == None)
             role = (await session.execute(role_query)).scalars().first()
             
        new_member = TenantMember(
            user_id=existing_user.id,
            tenant_id=tenant_id,
            role_id=role.id if role else uuid.uuid4() # Mock/fallback if completely empty DB (shouldn't happen with seed)
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
        tenant_id=member.tenant_id
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
    from sqlalchemy import delete
    from models import TenantMember
    
    # Borramos sus membresías en esta o todas las empresas
    await session.execute(delete(TenantMember).where(TenantMember.user_id == user_id))
    
    # Finalmente borramos al usuario (FastAPI users lo elimina limpiamente)
    await session.delete(user)
    await session.commit()
    return None

@router.get("/{tenant_id}/roles", response_model=List[RoleResponseSimple])
async def list_tenant_roles(tenant_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    query = select(Role).where(Role.tenant_id == tenant_id)
    result = await session.execute(query)
    return result.scalars().all()

@router.post("/{tenant_id}/roles", response_model=RoleResponseSimple, status_code=status.HTTP_201_CREATED)
async def create_tenant_role(tenant_id: uuid.UUID, role_in: RoleCreateSimple, session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    new_role = Role(
        name=role_in.name,
        tenant_id=tenant_id,
        is_custom=True
    )
    session.add(new_role)
    await session.commit()
    await session.refresh(new_role)
    return new_role

class RoleUpdateSimple(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

@router.put("/{tenant_id}/roles/{role_id}", response_model=RoleResponseSimple)
async def update_tenant_role(tenant_id: uuid.UUID, role_id: uuid.UUID, role_in: RoleUpdateSimple, session: AsyncSession = Depends(get_session)):
    query = select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
    role = (await session.execute(query)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found in this tenant")
    
    if role_in.name is not None:
        role.name = role_in.name
    if role_in.is_active is not None:
        role.is_active = role_in.is_active
        
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return role

@router.delete("/{tenant_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_role(tenant_id: uuid.UUID, role_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    query = select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
    role = (await session.execute(query)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found in this tenant")
    
    role.is_active = False
    session.add(role)
    await session.commit()
    return None

class HardDeleteRoleRequest(BaseModel):
    password: str

@router.post("/{tenant_id}/roles/{role_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_tenant_role(tenant_id: uuid.UUID, role_id: uuid.UUID, body: HardDeleteRoleRequest, session: AsyncSession = Depends(get_session)):
    from core.security_utils import verify_superadmin_password
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        
    query = select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
    role = (await session.execute(query)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found in this tenant")
    
    from models import RoleModuleAccess
    accesses = await session.execute(select(RoleModuleAccess).where(RoleModuleAccess.role_id == role_id))
    for acc in accesses.scalars().all():
        await session.delete(acc)
        
    await session.delete(role)
    await session.commit()
    return None