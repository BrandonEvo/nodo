import uuid
from typing import Optional
from fastapi import Depends, Request
from fastapi import HTTPException, status
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from models import User
from db.session import get_session

from core.config import settings

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.RESET_PASSWORD_SECRET
    verification_token_secret = settings.VERIFICATION_TOKEN_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"User {user.id} has registered.")

    async def update(self, user_update, user: User, safe: bool = False, request: Optional[Request] = None):
        # Superadmins cannot be deactivated or stripped of superuser status via API
        update_dict = user_update.model_dump(exclude_unset=True) if hasattr(user_update, 'model_dump') else user_update.dict(exclude_unset=True)
        if user.is_superuser:
            if update_dict.get("is_active") is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Las cuentas de súper administrador no pueden desactivarse.",
                )
            if update_dict.get("is_superuser") is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No se puede revocar el rol de súper administrador.",
                )
        return await super().update(user_update, user, safe=safe, request=request)

# Dependencia para obtener el adaptador de la base de datos
async def get_user_db(session: AsyncSession = Depends(get_session)):
    yield SQLAlchemyUserDatabase(session, User)

# Dependencia para obtener el manager
async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)