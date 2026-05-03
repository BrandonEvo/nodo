import uuid
import secrets
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from models import User, Tenant, Role, TenantMember
from models.invitations import Invitation
from core.auth import get_jwt_strategy

router = APIRouter()

# --- Configuración proporcionada por el usuario ---
GOOGLE_CLIENT_ID = "833836638249-q9p0ahfn0l4h938ui8acd8psksb08no5.apps.googleusercontent.com"
# Nota: Por seguridad, el CLIENT_SECRET debería venir de variables de entorno.
# En la solicitud original el usuario no lo dio, usaré una variable vacía para que el admin lo llene
from core.config import settings
GOOGLE_CLIENT_SECRET = getattr(settings, "GOOGLE_CLIENT_SECRET", "")
FRONTEND_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000"
REDIRECT_URI = f"{BACKEND_URL}/api/auth/google/callback"

# Scopes para obtener email y perfil básico
AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

@router.get("/login", summary="Inicia el flujo de Google OAuth")
async def google_login(response: Response):
    """
    Genera el state para prevenir CSRF y redirige a la pantalla de Google.
    """
    # Generar un string criptográficamente seguro
    state = secrets.token_urlsafe(32)
    
    # Lo guardamos en una cookie temporal para validarlo a la vuelta
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        max_age=600, # 10 minutos
        samesite="lax"
    )
    
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
    
    # Redirigir enviando también las cookies
    # En FastAPI, no podemos retornar RedirectResponse directo si seteamos cookie en el Response inyectado
    # Por lo tanto, creamos el RedirectResponse explícito
    redirect = RedirectResponse(url=url)
    redirect.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        max_age=600,
        samesite="lax"
    )
    return redirect

@router.get("/callback", summary="Callback del flujo de Google OAuth")
async def google_callback(request: Request, code: str = None, state: str = None, db: AsyncSession = Depends(get_session)):
    """
    Maneja el retorno de Google, valida estado, obtiene tokens y aplica la lógica transaccional M:N.
    """
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # Validación CSRF
    oauth_state = request.cookies.get("oauth_state")
    if not oauth_state or oauth_state != state:
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
        
    full_name = user_info.get("name")
    picture = user_info.get("picture")
    google_id = user_info.get("sub")

    # ==========================================
    # LÓGICA TRANSACCIONAL CONDICIONAL M:N
    # ==========================================
    try:
        # 1. ¿Existe el correo en la tabla users?
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

        if user:
            # SÍ: Actualizar su foto/nombre de Google si es necesario (opcional)
            user.full_name = full_name or user.full_name
            user.picture = picture or user.picture
            if not user.google_id:
                user.google_id = google_id
            await db.commit()
        else:
            # NO: Consultar invitaciones
            inv_result = await db.execute(select(Invitation).where(Invitation.email == email, Invitation.is_accepted == False))
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
                is_superuser=False
            )
            db.add(user)
            await db.flush() # Para obtener user.id

            if invitation:
                # SÍ (Usuario invitado): Vincular al tenant especificado
                member = TenantMember(
                    user_id=user.id,
                    tenant_id=invitation.tenant_id,
                    role_id=invitation.role_id,
                    assigned_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                db.add(member)
                invitation.is_accepted = True
                db.add(invitation)
            else:
                # NO (Usuario orgánico): Crear Tenant y asignarlo como Admin
                new_tenant = Tenant(
                    name=f"Empresa de {full_name or email}",
                    billing_status="trialing"
                )
                db.add(new_tenant)
                await db.flush()

                # Crear un rol de SuperAdmin para este Tenant
                admin_role = Role(
                    tenant_id=new_tenant.id,
                    name="Super Administrador",
                    is_custom=False
                )
                db.add(admin_role)
                await db.flush()

                member = TenantMember(
                    user_id=user.id,
                    tenant_id=new_tenant.id,
                    role_id=admin_role.id,
                    assigned_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                db.add(member)

            await db.commit()
            
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")

    # ==========================================
    # CIERRE Y ENTREGA SEGURA DEL JWT
    # ==========================================
    # Generar token JWT con fastapi_users strategy
    strategy = get_jwt_strategy()
    jwt_token = await strategy.write_token(user)

    # Redirigir al frontend e inyectar cookie HttpOnly
    response_redirect = RedirectResponse(url=f"{FRONTEND_URL}/dashboard")
    
    # Limpiar cookie de state
    response_redirect.delete_cookie("oauth_state")
    
    # REGLA CRÍTICA: Entregar JWT en Cookie HttpOnly
    response_redirect.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        max_age=3600 * 24, # 1 día, que hace match con get_jwt_strategy()
        samesite="lax",
        secure=False, # Pon en True en producción con HTTPS
    )

    return response_redirect
