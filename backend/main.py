from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi_users import FastAPIUsers
import uuid
import logging

logger = logging.getLogger(__name__)

# Configuración interna
from core.config import settings
from core.auth import auth_backend
from api.manager import get_user_manager
from db.session import get_session

# Modelos y Esquemas
from models.models import User
from models.schemas import UserRead, UserCreate, UserUpdate

# --- Router de Empresas (SuperAdmin) ---
from api.routers.tenants import create_router
from api.routers.modules import create_modules_router, create_tenant_modules_router
from api.routers.tenant_me import create_tenant_me_router

# --- CORS: orígenes permitidos ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

def _cors_headers():
    return {
        "Access-Control-Allow-Origin": origins[0] if origins else "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }

app = FastAPI(
    title="Nodo API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

# Manejador global para que las respuestas de error incluyan CORS (evita "CORS missing" en 500)
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled exception: %s", exc)
    origin = request.headers.get("origin") or origins[0]
    if origin not in origins:
        origin = origins[0]
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={**_cors_headers(), "Access-Control-Allow-Origin": origin},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_session)):
    """Verifica la salud del servidor y la conexión a PostgreSQL"""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {
        "status": "ok", 
        "environment": settings.ENVIRONMENT,
        "database": db_status
    }

# --- SISTEMA DE AUTENTICACIÓN ---
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# 1. Login y Logout (JWT)
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["auth"],
)

# 2. Registro de Usuarios
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)

# 3. Gestión de Perfil (/me) y CRUD de Usuarios
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), 
    prefix="/api/users",
    tags=["users"],
)

# --- Gestión de Empresas (Tenants) para el SuperAdmin ---
current_superuser = fastapi_users.current_user(active=True, superuser=True)
current_user_active = fastapi_users.current_user(active=True)

app.include_router(
    create_router(current_superuser),
    prefix="/api",
)
app.include_router(
    create_modules_router(current_superuser),
    prefix="/api",
)
app.include_router(
    create_tenant_modules_router(current_superuser),
    prefix="/api",
)
# Admin del tenant: roles y asignación a empleados (is_tenant_admin o superuser)
app.include_router(
    create_tenant_me_router(current_user_active),
    prefix="/api",
)