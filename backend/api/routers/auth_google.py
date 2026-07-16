import uuid
import secrets
import httpx
import hmac
import hashlib
import base64
import json
import time
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from models import User, Tenant, TenantMember
from models.invitations import Invitation
from models.iam import RefreshToken
from core.auth import get_jwt_strategy
from api.routers.auth import _set_auth_cookies, _new_refresh_token, _REFRESH_DAYS

router = APIRouter()

from core.config import settings

# El CLIENT_ID no es secreto —viaja en la URL del navegador en cada login— pero
# vive en `settings` para tener una sola fuente de verdad al rotar el cliente
# OAuth. El CLIENT_SECRET sí lo es: llega por variable de entorno desde .env.
GOOGLE_CLIENT_ID = settings.GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET = settings.GOOGLE_CLIENT_SECRET
FRONTEND_URL = settings.FRONTEND_URL
BACKEND_URL  = settings.BACKEND_URL
REDIRECT_URI = f"{BACKEND_URL}/api/auth/google/callback"

# Scopes para obtener email y perfil básico
AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _sign_state() -> str:
    """State OAuth firmado con HMAC (sin estado, sin cookie).

    Anti-CSRF sin depender de una cookie: la cookie quedaba atada al host donde
    empezaba el login, pero Google siempre devuelve al host del redirect_uri
    (dominio nip.io). Si el usuario abría la app por la IP cruda, la cookie no
    viajaba de vuelta y fallaba "CSRF validation failed". Con un state firmado,
    el callback lo valida sin importar el host.
    """
    payload = base64.urlsafe_b64encode(
        json.dumps({"n": secrets.token_urlsafe(12), "t": int(time.time())}).encode()
    ).decode().rstrip("=")
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _verify_state(state: str, max_age_s: int = 600) -> bool:
    try:
        payload, sig = state.rsplit(".", 1)
        expected = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        padded = payload + "=" * (-len(payload) % 4)
        issued = int(json.loads(base64.urlsafe_b64decode(padded))["t"])
        return 0 <= (int(time.time()) - issued) <= max_age_s
    except Exception:
        return False

@router.get("/login", summary="Inicia el flujo de Google OAuth")
async def google_login():
    """
    Genera el state firmado (anti-CSRF) y redirige a la pantalla de Google.
    """
    state = _sign_state()
    url = (
        f"{AUTHORIZATION_URL}?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={REDIRECT_URI}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"access_type=offline&"
        f"state={state}&"
        f"prompt=consent"
    )
    return RedirectResponse(url=url)

@router.get("/callback", summary="Callback del flujo de Google OAuth")
async def google_callback(request: Request, code: str = None, state: str = None, db: AsyncSession = Depends(get_session)):
    """
    Maneja el retorno de Google, valida estado, obtiene tokens y aplica la lógica transaccional M:N.
    Árbol de decisión de enrutamiento inteligente:
    1. Usuario NO existe → checar invitaciones → crear como invitado o como orgánico.
    2. Usuario SÍ existe → actualizar datos de Google.
    """
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # Validación CSRF: el state debe estar firmado por nosotros y vigente (<10 min).
    # No depende de cookies, así que funciona cualquiera sea el host de inicio.
    if not _verify_state(state):
        raise HTTPException(status_code=400, detail="Invalid state parameter. CSRF validation failed.")

    # Intercambiar code por Access Token
    async with httpx.AsyncClient() as client:
        token_data = {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        }
        token_response = await client.post(TOKEN_URL, data=token_data)
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch token from Google: {token_response.text}")
            
        tokens = token_response.json()
        access_token = tokens.get("access_token")

        # Obtener información del usuario
        userinfo_response = await client.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user info from Google")
            
        user_info = userinfo_response.json()
    
    email = user_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email provided by Google")

    # Misma normalización que register-workspace: sin esto, un correo con
    # mayúsculas crearía un usuario duplicado en vez de reconocer al existente.
    email = email.strip().lower()


    full_name = user_info.get("name")
    picture = user_info.get("picture")
    google_id = user_info.get("sub")

    # ==========================================
    # LÓGICA TRANSACCIONAL CONDICIONAL M:N
    # (con Onboarding Inteligente)
    # ==========================================
    try:
        # 1. ¿Existe el correo en la tabla users?
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

        if user:
            # SÍ: Actualizar su foto/nombre de Google si es necesario
            user.full_name = full_name or user.full_name
            user.picture = picture or user.picture
            if not user.google_id:
                user.google_id = google_id
            await db.commit()
        else:
            # NO: Consultar invitaciones pendientes
            inv_result = await db.execute(
                select(Invitation).where(
                    Invitation.email == email,
                    Invitation.status == "pending"
                )
            )
            invitation = inv_result.scalars().first()

            # Crear el usuario base
            user = User(
                email=email,
                # En oauth no guardamos pass, pero fastapi_users necesita algo para el schema. 
                # Le pondremos un hash inválido para que no puedan entrar con contraseña tradicional
                hashed_password="oauth2_managed",
                full_name=full_name,
                picture=picture,
                google_id=google_id,
                is_verified=True,
                is_superuser=False,
                # El onboarding depende de si es invitado o es orgánico
                onboarding_completed=True if invitation else False,
            )
            db.add(user)
            await db.flush() # Para obtener user.id

            if invitation:
                # SÍ (Usuario invitado): Vincular al tenant especificado
                member = TenantMember(
                    user_id=user.id,
                    tenant_id=invitation.tenant_id,
                    member_type=invitation.member_type,
                    assigned_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                db.add(member)
                invitation.status = "accepted"
                db.add(invitation)
            else:
                # NO (Usuario orgánico): Crear Tenant provisional y asignarlo como Propietario
                new_tenant = Tenant(
                    name=f"Empresa de {full_name or email}",
                    billing_status="trialing"
                )
                db.add(new_tenant)
                await db.flush()

                member = TenantMember(
                    user_id=user.id,
                    tenant_id=new_tenant.id,
                    member_type="owner",
                    assigned_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                db.add(member)

                # Trial automático para el alta orgánica (mismo flujo que register-workspace)
                from api.services.trial_service import start_trial, get_default_trial_days
                await start_trial(db, new_tenant, await get_default_trial_days(db))

            await db.commit()
            
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")

    # ==========================================
    # CIERRE Y ENTREGA SEGURA DEL JWT
    # Mismo mecanismo que el login local: access (2h) + refresh (7d) en cookies
    # httpOnly. Así el usuario de Google no queda deslogueado al expirar el JWT,
    # y el flag Secure se controla con COOKIE_SECURE (funciona sobre HTTP plano).
    # ==========================================
    jwt_token = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = _new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=_REFRESH_DAYS),
    ))
    await db.commit()

    response_redirect = RedirectResponse(url=f"{FRONTEND_URL}/portal")
    response_redirect.delete_cookie("oauth_state")
    _set_auth_cookies(response_redirect, jwt_token, refresh_raw)
    return response_redirect
