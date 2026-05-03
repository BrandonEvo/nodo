import json
import os
from passlib.context import CryptContext
from fastapi import HTTPException
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_superadmin_password(plain_password: str) -> bool:
    hashed_password = settings.SUPERADMIN_PASSWORD_HASH
    
    if not hashed_password:
        raise HTTPException(status_code=500, detail="Mistery Vault missing hashed value")
        
    return pwd_context.verify(plain_password, hashed_password)
