import hashlib
import hmac
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
from models.invitations import Invitation
from models.schemas import MemberRegisterRequest
from passlib.context import CryptContext
from core.limiter import limiter
from core.auth import get_jwt_strategy
from core.config import settings
from api.manager import get_user_manager

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_JWT_LIFETIME = 3600 * 2   # 2 horas
_REFRESH_DAYS = 7          # 7 días


def _new_refresh_token() -> tuple[str, str]:
    """Devuelve (token_raw, token_hash). Guardar solo el hash en BD."""
    raw = os.urandom(32).hex()
    h   = hashlib.sha256(raw.encode()).hexdigest()
    return raw, h


def _set_auth_cookies(response: Response, jwt: str, refresh_raw: str) -> None:
    secure = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="access_token", value=jwt,
        httponly=True, max_age=_JWT_LIFETIME, samesite="lax", secure=secure,
    )
    response.set_cookie(
        key="refresh_token", value=refresh_raw,
        httponly=True, max_age=_REFRESH_DAYS * 86400, samesite="lax", secure=secure,
        path="/api/auth/refresh",
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

@router.post("/register-workspace", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_workspace(
    request: Request,
    response: Response,
    payload: WorkspaceRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    _validate_password(payload.password)

    existing_user = (await session.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.")

    new_tenant = Tenant(name=payload.tenant_name, is_active=True)
    session.add(new_tenant)
    await session.flush()

    new_user = User(
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password),
        is_active=True,
        is_superuser=False,
        is_verified=True,
        onboarding_completed=False,
    )
    session.add(new_user)
    await session.flush()

    session.add(TenantMember(
        user_id=new_user.id,
        tenant_id=new_tenant.id,
        member_type="owner",
    ))
    await session.commit()
    await session.refresh(new_user)
    await session.refresh(new_tenant)

    # Auto-login: emitir JWT + refresh token en la misma respuesta
    jwt = await get_jwt_strategy().write_token(new_user)
    refresh_raw, refresh_hash = _new_refresh_token()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(RefreshToken(
        user_id=new_user.id,
        token_hash=refresh_hash,
        expires_at=now + timedelta(days=_REFRESH_DAYS),
    ))
    await session.commit()
    _set_auth_cookies(response, jwt, refresh_raw)

    return WorkspaceRegisterResponse(
        tenant_id=new_tenant.id,
        user_id=new_user.id,
        email=new_user.email,
        tenant_name=new_tenant.name,
        message="Workspace creado con éxito.",
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


@router.post("/register-as-member", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register_as_member(
    request: Request,
    response: Response,
    payload: MemberRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Registro exclusivo para empleados/miembros invitados.
    A diferencia de register-workspace, NO crea un Tenant propio.
    Valida el invite_token, crea el User, acepta la invitación y emite cookies.
    Si el usuario ya existe, simplemente lo une al tenant y emite cookies.
    """
    _validate_password(payload.password)

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Validar invite_token
    inv_result = await session.execute(
        select(Invitation).where(
            Invitation.token  == payload.invite_token,
            Invitation.status == "pending",
        )
    )
    invitation = inv_result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=400, detail="Invitación no válida o ya utilizada.")
    if now > invitation.expires_at:
        invitation.status = "expired"
        session.add(invitation)
        await session.commit()
        raise HTTPException(status_code=400, detail="La invitación ha expirado.")
    if invitation.email.lower() != payload.email.lower():
        raise HTTPException(status_code=400, detail="El correo no coincide con la invitación.")

    # Buscar si el usuario ya existe
    user_result = await session.execute(select(User).where(User.email == payload.email.lower()))
    user = user_result.scalar_one_or_none()

    if user:
        # Ya tiene cuenta — solo crear membresía si no existe
        mem_result = await session.execute(
            select(TenantMember).where(
                TenantMember.user_id   == user.id,
                TenantMember.tenant_id == invitation.tenant_id,
            )
        )
        if not mem_result.scalar_one_or_none():
            session.add(TenantMember(
                user_id=user.id,
                tenant_id=invitation.tenant_id,
                member_type=invitation.member_type,
            ))
        invitation.status = "accepted"
        session.add(invitation)
        await session.commit()
    else:
        # Cuenta nueva: crear User + TenantMember, sin crear Tenant propio
        user = User(
            email=payload.email.lower().strip(),
            hashed_password=pwd_context.hash(payload.password),
            full_name=payload.full_name,
            is_active=True,
            is_superuser=False,
            is_verified=True,
            onboarding_completed=True,  # no necesita onboarding de empresa
        )
        session.add(user)
        await session.flush()

        session.add(TenantMember(
            user_id=user.id,
            tenant_id=invitation.tenant_id,
            member_type=invitation.member_type,
        ))
        invitation.status = "accepted"
        session.add(invitation)
        await session.commit()

    # Emitir JWT + refresh token (misma lógica que cookie_login)
    jwt = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = _new_refresh_token()
    session.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=now + timedelta(days=_REFRESH_DAYS),
    ))
    await session.commit()

    _set_auth_cookies(response, jwt, refresh_raw)
    return {"ok": True}


# ── Password Reset ─────────────────────────────────────────────────────────────

_RESET_TOKEN_LIFETIME = timedelta(hours=1)


def _make_reset_token(user_id: uuid.UUID, expires_ts: int) -> str:
    """Genera un token firmado HMAC-SHA256: {user_id}.{expires_ts}.{sig}"""
    payload = f"{user_id}.{expires_ts}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), "sha256").hexdigest()
    return f"{payload}.{sig}"


def _verify_reset_token(token: str) -> uuid.UUID:
    """Verifica firma y expiración. Retorna user_id o lanza HTTPException."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail="Token inválido.")
    user_id_str, expires_str, sig = parts
    payload = f"{user_id_str}.{expires_str}"
    expected = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), "sha256").hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="Token inválido.")
    if int(expires_str) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=400, detail="El enlace de recuperación ha expirado.")
    return uuid.UUID(user_id_str)


class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Genera token HMAC de recuperación (1h). Sin SMTP aún: retorna el token para MVP.
    TODO: eliminar reset_token del response y enviarlo por correo en producción.
    """
    result = await session.execute(select(User).where(User.email == body.email.lower().strip()))
    user = result.scalar_one_or_none()

    if not user or not user.is_active or user.google_id:
        return {"detail": "Si el correo existe en el sistema, recibirás instrucciones en breve."}

    expires_ts = int((datetime.now(timezone.utc) + _RESET_TOKEN_LIFETIME).timestamp())
    token = _make_reset_token(user.id, expires_ts)

    return {
        "detail": "Si el correo existe en el sistema, recibirás instrucciones en breve.",
        "reset_token": token,
    }


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    response: Response,
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """Verifica token HMAC, actualiza contraseña y emite nueva sesión automáticamente."""
    _validate_password(body.new_password)
    user_id = _verify_reset_token(body.token)

    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Token inválido.")
    if user.google_id:
        raise HTTPException(status_code=400, detail="Esta cuenta usa Google para autenticarse.")

    user.hashed_password = pwd_context.hash(body.new_password)
    session.add(user)

    # Revocar todos los refresh tokens activos del usuario
    rt_result = await session.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
    )
    for rt in rt_result.scalars().all():
        rt.revoked = True
        session.add(rt)

    await session.commit()

    # Auto-login con la nueva contraseña
    jwt = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = _new_refresh_token()
    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=now_dt + timedelta(days=_REFRESH_DAYS),
    ))
    await session.commit()

    _set_auth_cookies(response, jwt, refresh_raw)
    return {"ok": True, "detail": "Contraseña actualizada correctamente."}
