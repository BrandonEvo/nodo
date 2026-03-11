# backend/core/auth.py
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from core.config import settings

# CAMBIO CRÍTICO: Añadir el prefijo "/api/" al inicio de la URL
bearer_transport = BearerTransport(tokenUrl="/api/auth/jwt/login") 

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.SECRET_KEY, 
        lifetime_seconds=3600 * 24 
    )

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)