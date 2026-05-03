import uuid
from fastapi import Header, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi_users import FastAPIUsers

from db.session import get_session
from models import User
from core.auth import auth_backend
from api.manager import get_user_manager

# 1. Mudamos la instancia de seguridad aquí para evitar dependencias circulares
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# 2. Dependencia para exigir usuario logueado
current_active_user = fastapi_users.current_user(active=True)

# 3. Middleware RLS
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
        await session.execute(text(f"SET LOCAL app.current_tenant = '{str(x_tenant_id)}'"))
        yield session
    finally:
        await session.execute(text("RESET app.current_tenant"))