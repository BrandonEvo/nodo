import os
import secrets
import hashlib
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from models import User, Tenant, TenantMember
from models.iam import RefreshToken
from models.invitations import Invitation
from core.auth import get_jwt_strategy
from core.config import settings
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_JWT_LIFETIME = 3600 * 2   # 2h — igual que cookie_login
_REFRESH_DAYS = 7

router = APIRouter()

AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL         = "https://oauth2.googleapis.com/token"
USERINFO_URL      = "https://www.googleapis.com/oauth2/v3/userinfo"


def _redirect_uri() -> str:
    return f"{settings.BACKEND_URL}/api/auth/google/callback"


def _new_refresh_token() -> tuple[str, str]:
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


@router.get("/login", summary="Inicia el flujo de Google OAuth")
async def google_login(request: Request, invite_token: str | None = None):
    """
    Genera state anti-CSRF y redirige a Google.
    Si se pasa invite_token como query param, lo incluye en el state para
    recuperarlo en el callback y asociar la cuenta al tenant invitante.
    """
    state = secrets.token_urlsafe(32)
    # Codificar invite_token dentro del state separado por ":"
    state_payload = f"{state}:{invite_token}" if invite_token else state

    url = (
        f"{AUTHORIZATION_URL}?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={_redirect_uri()}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"access_type=offline&"
        f"state={state_payload}&"
        f"prompt=consent"
    )

    redirect = RedirectResponse(url=url)
    redirect.set_cookie(
        key="oauth_state", value=state,
        httponly=True, max_age=600, samesite="lax",
    )
    return redirect


@router.get("/callback", summary="Callback del flujo de Google OAuth")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_session),
):
    """
    Árbol de decisión:
    1. Usuario NO existe + tiene invitación → crear cuenta + aceptar invitación (sin crear tenant)
    2. Usuario NO existe + sin invitación   → crear cuenta + tenant provisional (onboarding pendiente)
    3. Usuario SÍ existe                   → actualizar foto/nombre de Google
    En todos los casos emite JWT (2h) + refresh token (7d) en httpOnly cookies.
    """
    if not code or not state:
        raise HTTPException(status_code=400, detail="Parámetros OAuth incompletos.")

    # Validación CSRF: el state puede ser "base_state" o "base_state:invite_token"
    state_parts   = state.split(":", 1)
    base_state    = state_parts[0]
    invite_token  = state_parts[1] if len(state_parts) > 1 else None

    oauth_state = request.cookies.get("oauth_state")
    if not oauth_state or oauth_state != base_state:
        raise HTTPException(status_code=400, detail="CSRF validation failed.")

    # Intercambiar code por access_token de Google
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(TOKEN_URL, data={
            "client_id":     settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code":          code,
            "grant_type":    "authorization_code",
            "redirect_uri":  _redirect_uri(),
        })
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Error al obtener token de Google.")
        google_access_token = token_resp.json().get("access_token")

        userinfo_resp = await client.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {google_access_token}"}
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Error al obtener perfil de Google.")
        user_info = userinfo_resp.json()

    email     = user_info.get("email")
    full_name = user_info.get("name")
    picture   = user_info.get("picture")
    google_id = user_info.get("sub")

    if not email:
        raise HTTPException(status_code=400, detail="Google no proporcionó un correo.")

    try:
        result = await db.execute(select(User).where(User.email == email))
        user   = result.scalars().first()

        if user:
            # Usuario existente: actualizar datos de Google
            user.full_name = full_name or user.full_name
            user.picture   = picture   or user.picture
            if not user.google_id:
                user.google_id = google_id
            await db.commit()
        else:
            # Usuario nuevo: resolver si viene de invitación o es orgánico
            invitation = None
            if invite_token:
                inv_result = await db.execute(
                    select(Invitation).where(
                        Invitation.token  == invite_token,
                        Invitation.email  == email,
                        Invitation.status == "pending",
                    )
                )
                invitation = inv_result.scalars().first()

            if not invitation:
                # Buscar invitación por email aunque no haya token explícito
                inv_result = await db.execute(
                    select(Invitation).where(
                        Invitation.email  == email,
                        Invitation.status == "pending",
                    )
                )
                invitation = inv_result.scalars().first()

            # Contraseña: bcrypt de un secret aleatorio — OAuth no usa password
            dummy_pw = _pwd_context.hash(os.urandom(32).hex())

            user = User(
                email=email,
                hashed_password=dummy_pw,
                full_name=full_name,
                picture=picture,
                google_id=google_id,
                is_verified=True,
                is_superuser=False,
                onboarding_completed=True if invitation else False,
            )
            db.add(user)
            await db.flush()

            if invitation:
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                if now > invitation.expires_at:
                    invitation.status = "expired"
                    db.add(invitation)
                    # Crear tenant provisional igual que si no tuviera invitación
                    invitation = None
                else:
                    member = TenantMember(
                        user_id=user.id,
                        tenant_id=invitation.tenant_id,
                        member_type=invitation.member_type,
                        assigned_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                    db.add(member)
                    invitation.status = "accepted"
                    db.add(invitation)

            if not invitation:
                # Orgánico: tenant provisional, onboarding completará el nombre
                new_tenant = Tenant(
                    name=f"Empresa de {full_name or email}",
                    billing_status="trialing",
                )
                db.add(new_tenant)
                await db.flush()
                db.add(TenantMember(
                    user_id=user.id,
                    tenant_id=new_tenant.id,
                    member_type="owner",
                    assigned_at=datetime.now(timezone.utc).replace(tzinfo=None),
                ))

            await db.commit()

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en la transacción: {str(e)}")

    # Emitir JWT (2h) + refresh token (7d)
    jwt_token   = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = _new_refresh_token()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=now + timedelta(days=_REFRESH_DAYS),
    ))
    await db.commit()

    # Redirigir al frontend (raíz del SPA)
    redirect = RedirectResponse(url=settings.FRONTEND_URL)
    redirect.delete_cookie("oauth_state")
    _set_auth_cookies(redirect, jwt_token, refresh_raw)
    return redirect
