import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel

from db.session import get_session
from models import Tenant, User, TenantMember
from models.iam import RefreshToken
from passlib.context import CryptContext
from core.limiter import limiter
from core.auth import get_jwt_strategy
from api.manager import get_user_manager

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_SECURE_COOKIE = False       # True en producción con HTTPS
_JWT_LIFETIME   = 3600 * 2   # 2 horas
_REFRESH_DAYS   = 7          # 7 días


def _new_refresh_token() -> tuple[str, str]:
    """Devuelve (token_raw, token_hash). Guardar solo el hash en BD."""
    raw = os.urandom(32).hex()
    h   = hashlib.sha256(raw.encode()).hexdigest()
    return raw, h


def _set_auth_cookies(response: Response, jwt: str, refresh_raw: str) -> None:
    response.set_cookie(
        key="access_token", value=jwt,
        httponly=True, max_age=_JWT_LIFETIME, samesite="lax", secure=_SECURE_COOKIE,
    )
    response.set_cookie(
        key="refresh_token", value=refresh_raw,
        httponly=True, max_age=_REFRESH_DAYS * 86400, samesite="lax", secure=_SECURE_COOKIE,
        path="/api/auth/refresh",   # solo disponible para el endpoint de refresh
    )

router = APIRouter(tags=["Auth: Custom SaaS Flows"])

# ── Password policy ───────────────────────────────────────────────────────────

_COMMON_PASSWORDS = {
    "123456", "password", "12345678", "qwerty", "abc123",
    "111111", "123123", "admin", "letmein", "welcome",
    "monkey", "dragon", "master", "sunshine", "princess",
    "nodo123", "nodo1234", "nodo2026",
}

def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe tener al menos 8 caracteres.",
        )
    if not re.search(r"[A-Za-z]", password):
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe contener al menos una letra.",
        )
    if not re.search(r"\d", password):
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe contener al menos un número.",
        )
    if password.lower() in _COMMON_PASSWORDS:
        raise HTTPException(
            status_code=422,
            detail="Esa contraseña es demasiado común. Elige una más segura.",
        )


# ── Schemas ───────────────────────────────────────────────────────────────────

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


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register-workspace", response_model=WorkspaceRegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_workspace(
    request: Request,
    payload: WorkspaceRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    _validate_password(payload.password)

    user_query = select(User).where(User.email == payload.email)
    existing_user = (await session.execute(user_query)).scalar_one_or_none()
    if existing_user:
        # Mensaje genérico para no revelar si el email existe (user enumeration)
        raise HTTPException(status_code=400, detail="No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.")

    new_tenant = Tenant(name=payload.tenant_name, is_active=True)
    session.add(new_tenant)
    await session.commit()
    await session.refresh(new_tenant)

    new_user = User(
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password),
        is_active=True,
        is_superuser=False,
        is_verified=True,
        onboarding_completed=False,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    new_member = TenantMember(
        user_id=new_user.id,
        tenant_id=new_tenant.id,
        member_type="owner",
    )
    session.add(new_member)
    await session.commit()

    return WorkspaceRegisterResponse(
        tenant_id=new_tenant.id,
        user_id=new_user.id,
        email=new_user.email,
        tenant_name=new_tenant.name,
        message="Workspace creado con éxito. Ya puedes iniciar sesión.",
    )


@router.post("/cookie-login")
@limiter.limit("10/minute")
async def cookie_login(
    request: Request,
    response: Response,
    credentials: OAuth2PasswordRequestForm = Depends(),
    user_manager=Depends(get_user_manager),
    session: AsyncSession = Depends(get_session),
):
    """Login seguro: JWT 2h + refresh token 7d, ambos en httpOnly cookies."""
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Credenciales incorrectas. Verifica tu correo y contraseña.")

    jwt = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = _new_refresh_token()

    session.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=_REFRESH_DAYS),
    ))
    await session.commit()

    _set_auth_cookies(response, jwt, refresh_raw)
    return {"ok": True}


@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    user_manager=Depends(get_user_manager),
    session: AsyncSession = Depends(get_session),
):
    """Rota el JWT usando el refresh token. Emite un nuevo par de cookies."""
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status_code=401, detail="Sin refresh token.")

    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > now,
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado.")

    # Rotación: revocar el actual y emitir uno nuevo
    rt.revoked = True
    session.add(rt)

    user = await user_manager.get(rt.user_id)
    if not user or not user.is_active:
        await session.commit()
        raise HTTPException(status_code=401, detail="Usuario inactivo.")

    new_jwt = await get_jwt_strategy().write_token(user)
    new_raw, new_hash = _new_refresh_token()

    session.add(RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        expires_at=now + timedelta(days=_REFRESH_DAYS),
    ))
    await session.commit()

    _set_auth_cookies(response, new_jwt, new_raw)
    return {"ok": True}


@router.post("/cookie-logout")
async def cookie_logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """Revoca el refresh token y borra ambas cookies."""
    raw = request.cookies.get("refresh_token")
    if raw:
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        result = await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        rt = result.scalar_one_or_none()
        if rt:
            rt.revoked = True
            session.add(rt)
            await session.commit()

    response.delete_cookie("access_token", samesite="lax")
    response.delete_cookie("refresh_token", path="/api/auth/refresh", samesite="lax")
    return {"ok": True}
