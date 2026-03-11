import uuid
from typing import Optional
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import User
from db.session import get_session

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = "SECRET_TEMPORAL_RESET" # Debería ir en .env
    verification_token_secret = "SECRET_TEMPORAL_VERIFY"

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"User {user.id} has registered.")

# Dependencia para obtener el adaptador de la base de datos
async def get_user_db(session: AsyncSession = Depends(get_session)):
    yield SQLAlchemyUserDatabase(session, User)

# Dependencia para obtener el manager
async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)