import uuid
from fastapi import Header, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi_users import FastAPIUsers
from sqlmodel import select

from db.session import get_session
from models import User, Tenant
from models.iam import TenantMember
from core.auth import auth_backend
from core.trial import compute_access
from api.manager import get_user_manager

# Métodos que escriben — bloqueados en periodo de gracia (solo lectura)
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# 1. Mudamos la instancia de seguridad aquí para evitar dependencias circulares
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# 2. Dependencia para exigir usuario logueado
current_active_user = fastapi_users.current_user(active=True)

# 3. Resuelve el tenant_id activo y activa RLS para el resto del request
async def get_current_tenant_id(
    request: Request,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> uuid.UUID:
    result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.is_active == True,
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin membresía activa en ninguna empresa",
        )

    tenant_id = membership.tenant_id

    # Enforcement de trial (medio con gracia). Los superadmin nunca se bloquean.
    # locked → todo bloqueado; grace → solo lectura (se bloquean las escrituras).
    if not current_user.is_superuser:
        tenant = await session.get(Tenant, tenant_id)
        if tenant:
            state = compute_access(tenant)["access_state"]
            if state == "locked":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="Tu periodo de prueba terminó. Suscríbete a un plan para seguir usando los módulos. Tus datos siguen guardados.",
                )
            if state == "grace" and request.method in _WRITE_METHODS:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="Tu prueba venció (periodo de gracia, solo lectura). Suscríbete para volver a guardar cambios.",
                )

    # Activar RLS: cambiar al rol limitado y fijar el contexto de tenant.
    # SET LOCAL aplica solo al transaction actual (este request).
    # nodo_admin bypassa RLS; nodo_app no — esto activa las políticas.
    await session.execute(text("SET LOCAL ROLE nodo_app"))
    await session.execute(text(f"SET LOCAL app.current_tenant = '{tenant_id}'"))

    return tenant_id

# 4. Middleware RLS (legacy — mantiene compatibilidad con routers existentes)
async def get_tenant_session(
    x_tenant_id: uuid.UUID = Header(..., description="ID de la empresa activa"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_active_user) 
) -> AsyncSession:
    """
    Dependencia Enterprise RLS: 
    1. Valida el JWT (user).
    2. Extrae el Tenant ID del header.
    3. Configura la variable de PostgreSQL a nivel local.
    """
    try:
        await session.execute(text("SET LOCAL ROLE nodo_app"))
        await session.execute(text(f"SET LOCAL app.current_tenant = '{str(x_tenant_id)}'"))
        yield session
    finally:
        await session.execute(text("RESET app.current_tenant"))