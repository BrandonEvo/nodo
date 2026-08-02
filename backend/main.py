import uuid
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi_users import FastAPIUsers
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Configuración interna
from core.config import settings
from core.limiter import limiter
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
from api.routers import roles as roles_router

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
    # Deja rastro en el panel del súper admin. Un 500 sólo existía si alguien abría
    # `docker logs`; ahora queda registrado y avisa. Nunca propaga: si el monitoreo
    # falla, el cliente igual recibe su 500.
    from api.services.error_monitor import record_exception
    await record_exception(request, exc)

    origin = request.headers.get("origin") or (origins[0] if origins else "*")
    if origins and origin not in origins:
        origin = origins[0]
    return JSONResponse(
        status_code=500,
        # `str(exc)` iba al cliente: un IntegrityError le mostraba nombres de tabla y
        # constraints, y un fallo de conexión la cadena de la base. El detalle vive en
        # el panel, no en la respuesta.
        content={"detail": "Ocurrió un error inesperado. Ya quedó registrado."},
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
from starlette.responses import JSONResponse as StarletteJSONResponse
from fastapi import Request
import time
from collections import defaultdict
import threading

# ── Login rate limiter (in-process, covers direct port-8000 access) ──────────
_login_attempts: dict[str, list[float]] = defaultdict(list)
_login_lock = threading.Lock()
_LOGIN_MAX = 10       # requests
_LOGIN_WINDOW = 60.0  # seconds

def _is_login_rate_limited(ip: str) -> bool:
    now = time.monotonic()
    with _login_lock:
        attempts = _login_attempts[ip]
        # Drop attempts outside the window
        _login_attempts[ip] = [t for t in attempts if now - t < _LOGIN_WINDOW]
        if len(_login_attempts[ip]) >= _LOGIN_MAX:
            return True
        _login_attempts[ip].append(now)
        return False


class LoginRateLimitMiddleware(BaseHTTPMiddleware):
    """Hard limit on the login endpoint independent of SlowAPI or nginx."""
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/auth/jwt/login" and request.method == "POST":
            ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
            ip = ip.split(",")[0].strip()
            if _is_login_rate_limited(ip):
                return StarletteJSONResponse(
                    status_code=429,
                    content={"detail": "Demasiados intentos. Espera un momento e intenta de nuevo."},
                )
        return await call_next(request)


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

app.add_middleware(LoginRateLimitMiddleware)
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

# --- Passkeys / WebAuthn (Face ID, huella, Windows Hello, PIN) ---
from api.routers import webauthn
app.include_router(
    webauthn.router,
    prefix="/api/auth/webauthn",
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

app.include_router(
    roles_router.router,
    prefix="/api/admin/roles",
)

# ==========================================
# MÓDULOS OPERATIVOS
# ==========================================
from api.routers import bodega as bodega_router
from api.routers import recetas as recetas_router
from api.routers import cocina as cocina_router
from api.routers import mostrador as mostrador_router
from api.routers import cierre as cierre_router
from api.routers import autos as autos_router
from api.routers import gastos as gastos_router
from api.routers import reportes as reportes_router
from api.routers import personal_shopper as personal_shopper_router
from api.routers import shopper_trips as shopper_trips_router
from api.routers import shopper_catalog as shopper_catalog_router
from api.routers import og as og_router
from api.routers import public_tracking as public_tracking_router
from api.routers import ventas as ventas_router
from api.routers import store_public as store_public_router
from api.routers import citas as citas_router
from api.routers import booking_public as booking_public_router

app.include_router(bodega_router.router, prefix="/api/bodega")
app.include_router(recetas_router.router, prefix="/api/recetas")
app.include_router(cocina_router.router, prefix="/api/cocina")
app.include_router(mostrador_router.router, prefix="/api/mostrador")
app.include_router(cierre_router.router, prefix="/api/cierre")
app.include_router(autos_router.router, prefix="/api/autos")
app.include_router(gastos_router.router, prefix="/api/gastos")
app.include_router(reportes_router.router, prefix="/api/reportes")
app.include_router(personal_shopper_router.router, prefix="/api/personal-shopper")
app.include_router(shopper_trips_router.router, prefix="/api/shopper-trips")
app.include_router(shopper_catalog_router.router, prefix="/api/shopper-catalog")
# Sin /api adelante: la URL de la imagen se ve en el HTML que lee el scraper.
app.include_router(og_router.router, prefix="/og")
app.include_router(public_tracking_router.router, prefix="/api/tracking")
app.include_router(ventas_router.router, prefix="/api/ventas")
app.include_router(store_public_router.router, prefix="/api/store")
app.include_router(citas_router.router, prefix="/api/citas")
app.include_router(booking_public_router.router, prefix="/api/booking")

from api.routers import billing as billing_router
app.include_router(billing_router.router, prefix="/api/billing")

from api.routers import amazon_scrape as amazon_scrape_router
app.include_router(amazon_scrape_router.router, prefix="/api/amazon")

from api.routers import importaciones as importaciones_router
app.include_router(importaciones_router.router, prefix="/api/importaciones")

from api.routers import import_catalog as import_catalog_router
app.include_router(import_catalog_router.router, prefix="/api/import-catalog")

from api.routers import push as push_router
app.include_router(push_router.router, prefix="/api/push")

from api.routers import presence as presence_router
app.include_router(presence_router.router, prefix="/api/presence")

from api.routers import system as system_router
app.include_router(system_router.router, prefix="/api/admin/system")

from api.routers import backups as backups_router
app.include_router(backups_router.router, prefix="/api/admin/backups")

from api.routers import public_plans as public_plans_router
app.include_router(public_plans_router.router, prefix="/api/public")