import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel

from db.session import get_session
from models import Tenant, User, TenantMember
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["Auth: Custom SaaS Flows"])

class WorkspaceRegisterRequest(BaseModel):
    tenant_name: str
    email: str
    password: str

class WorkspaceRegisterResponse(BaseModel):
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    tenant_name: str
    message: str

@router.post("/register-workspace", response_model=WorkspaceRegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_workspace(payload: WorkspaceRegisterRequest, session: AsyncSession = Depends(get_session)):
    # 1. Validar que el email no exista
    user_query = select(User).where(User.email == payload.email)
    existing_user = (await session.execute(user_query)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado.")
    
    # 2. Crear Empresa (Tenant)
    # Por defecto creamos la empresa sin restricciones
    new_tenant = Tenant(name=payload.tenant_name, is_active=True)
    session.add(new_tenant)
    await session.commit()
    await session.refresh(new_tenant)

    # 4. Crear Usuario (Dueño orgánico — necesita completar onboarding)
    new_user = User(
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password),
        is_active=True,
        is_superuser=False,
        is_verified=True, # Puede ser false si hay verificación de email
        onboarding_completed=False,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # 5. Ligar Empleado a Empresa
    new_member = TenantMember(
        user_id=new_user.id,
        tenant_id=new_tenant.id,
        member_type="owner"
    )
    session.add(new_member)
    await session.commit()

    return WorkspaceRegisterResponse(
        tenant_id=new_tenant.id,
        user_id=new_user.id,
        email=new_user.email,
        tenant_name=new_tenant.name,
        message="Workspace creado con éxito. Ya puedes iniciar sesión."
    )
