import uuid
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi_users import FastAPIUsers
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Configuración interna
from core.config import settings
from core.auth import auth_backend
from api.manager import get_user_manager
from db.session import get_session

# Modelos y Esquemas
from models import User
from models.schemas import UserRead, UserCreate, UserUpdate

# --- Routers Refactorizados ---
# Importamos el router de tenants que ya está adaptado a la arquitectura M:N
from api.routers import tenants, tenant_members, modules, tenant_modules, auth, plans

# --- Nuevos Routers (Onboarding + Invitaciones + Config) ---
from api.routers import session as session_router
from api.routers import invitations as invitations_router
from api.routers import onboarding as onboarding_router
from api.routers import platform_config as platform_config_router

logger = logging.getLogger(__name__)

# --- CORS Dinámico ---
origins = settings.cors_origins_list

def _cors_headers():
    return {
        "Access-Control-Allow-Origin": origins[0] if origins else "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }

# --- Rate Limiting ---
# Limita a 100 peticiones por minuto por IP por defecto para proteger de DDoS
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

app = FastAPI(
    title="Nodo API Enterprise",
    version="2.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

# Configurar Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Añadir el middleware de SlowAPI para aplicar los límites globales
app.add_middleware(SlowAPIMiddleware)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled exception: %s", exc)
    origin = request.headers.get("origin") or (origins[0] if origins else "*")
    if origins and origin not in origins:
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

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

class CookieToBearerMiddleware(BaseHTTPMiddleware):
    """
    Middleware que extrae el token JWT de la cookie 'access_token' 
    (seteada por el flujo de OAuth) y lo inyecta en el header Authorization
    para que fastapi_users pueda validarlo usando su estrategia Bearer actual.
    """
    async def dispatch(self, request: Request, call_next):
        token = request.cookies.get("access_token")
        if token and "Authorization" not in request.headers:
            # Modificamos los headers a nivel scope (ASGI)
            headers = dict(request.scope["headers"])
            headers[b"authorization"] = f"Bearer {token}".encode("latin-1")
            request.scope["headers"] = [(k, v) for k, v in headers.items()]
            
        response = await call_next(request)
        return response

app.add_middleware(CookieToBearerMiddleware)

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

# ==========================================
# SISTEMA DE AUTENTICACIÓN (JWT)
# ==========================================
from api.deps import fastapi_users

app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["Auth: Login/Logout"],
)

app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["Auth: Registro Global"],
)

app.include_router(
    auth.router,
    prefix="/api/auth",
)

# --- Sesión Enriquecida (Onboarding + Invitaciones) ---
app.include_router(
    session_router.router,
    prefix="/api/auth",
)

# --- Google OAuth Router ---
from api.routers import auth_google
app.include_router(
    auth_google.router,
    prefix="/api/auth/google",
    tags=["Auth: Google OAuth"]
)

app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), 
    prefix="/api/users",
    tags=["Users: Perfil"],
)

# ==========================================
# RUTAS DE NEGOCIO (M:N Architecture)
# ==========================================
current_user_active = fastapi_users.current_user(active=True)

from api.routers.tenant_me import create_tenant_me_router
app.include_router(
    create_tenant_me_router(current_user_active),
    prefix="/api",
)
app.include_router(
    tenants.router,
    prefix="/api/tenants",
)

# --- RUTAS DE EMPRESA (TENANT SCOPED) ---

# --- RUTAS DE EMPRESA (TENANT SCOPED) ---
app.include_router(
    tenant_members.router,
    prefix="/api/members",
)

# --- RUTAS SUPERADMIN (MÓDULOS) ---
app.include_router(
    modules.router,
    prefix="/api/admin/modules",
)

app.include_router(
    plans.router,
    prefix="/api/plans",
)

# --- RUTAS DE EMPRESA (TENANT SCOPED) ---
app.include_router(
    tenant_modules.router,
    prefix="/api/tenant-modules",
)

# ==========================================
# ONBOARDING + INVITACIONES + CONFIG
# ==========================================
app.include_router(
    invitations_router.router,
    prefix="/api/invitations",
)

app.include_router(
    onboarding_router.router,
    prefix="/api/onboarding",
)

app.include_router(
    platform_config_router.router,
    prefix="/api/admin/config",
)

# ==========================================
# MÓDULOS OPERATIVOS DE PANADERÍA
# ==========================================
from api.routers import bodega as bodega_router
from api.routers import recetas as recetas_router
from api.routers import cocina as cocina_router
from api.routers import mostrador as mostrador_router
from api.routers import cierre as cierre_router
from api.routers import autos as autos_router

app.include_router(bodega_router.router, prefix="/api/bodega")
app.include_router(recetas_router.router, prefix="/api/recetas")
app.include_router(cocina_router.router, prefix="/api/cocina")
app.include_router(mostrador_router.router, prefix="/api/mostrador")
app.include_router(cierre_router.router, prefix="/api/cierre")
app.include_router(autos_router.router, prefix="/api/autos")