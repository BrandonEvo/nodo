"""Login con passkeys — WebAuthn / FIDO2 (Face ID, huella, Windows Hello, PIN).

No es un login nuevo: el passkey es una credencial adicional colgada del User
existente. El login por passkey termina emitiendo la MISMA sesión httpOnly
(JWT 2h + refresh 7d) que el login por password, vía core.session.set_auth_cookies.

El challenge se guarda entre begin/complete en una cookie httpOnly firmada con
HMAC (sin estado en servidor, no requiere Redis).
"""
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AttestationConveyancePreference,
)

from db.session import get_session
from models import User
from models.iam import RefreshToken
from models.webauthn import WebAuthnCredential
from core.auth import get_jwt_strategy
from core.config import settings
from core.limiter import limiter
from core.session import new_refresh_token, set_auth_cookies, REFRESH_DAYS
from api.deps import current_active_user

router = APIRouter(tags=["Auth: Passkeys / WebAuthn"])


def _expected_origin():
    """WEBAUTHN_ORIGIN admite varios orígenes separados por coma (apex + www)."""
    origins = [o.strip() for o in settings.WEBAUTHN_ORIGIN.split(",") if o.strip()]
    return origins if len(origins) > 1 else origins[0]


_CHALLENGE_COOKIE = "webauthn_challenge"
_CHALLENGE_TTL = 300  # 5 min
_CHALLENGE_PATH = "/api/auth/webauthn"


# ── Challenge firmado en cookie httpOnly ───────────────────────────────────────

def _make_challenge_token(purpose: str, challenge_b64: str, user_id: str = "") -> str:
    """Firma HMAC-SHA256: {purpose}.{user_id}.{challenge_b64}.{exp}.{sig}"""
    exp = int(time.time()) + _CHALLENGE_TTL
    payload = f"{purpose}.{user_id}.{challenge_b64}.{exp}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), "sha256").hexdigest()
    return f"{payload}.{sig}"


def _read_challenge_token(token: str, purpose: str, user_id: str = "") -> bytes:
    """Verifica firma, expiración y propósito. Devuelve el challenge en bytes."""
    parts = token.split(".")
    if len(parts) != 5:
        raise HTTPException(status_code=400, detail="Sesión de registro inválida. Reintenta.")
    p_purpose, p_user, p_challenge, p_exp, sig = parts
    payload = f"{p_purpose}.{p_user}.{p_challenge}.{p_exp}"
    expected = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), "sha256").hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="Sesión de registro inválida. Reintenta.")
    if int(p_exp) < int(time.time()):
        raise HTTPException(status_code=400, detail="La sesión de registro expiró. Reintenta.")
    if p_purpose != purpose or (user_id and p_user != user_id):
        raise HTTPException(status_code=400, detail="Sesión de registro inválida. Reintenta.")
    return base64url_to_bytes(p_challenge)


def _set_challenge_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_CHALLENGE_COOKIE, value=token,
        httponly=True, max_age=_CHALLENGE_TTL, samesite="lax",
        secure=settings.COOKIE_SECURE, path=_CHALLENGE_PATH,
    )


def _clear_challenge_cookie(response: Response) -> None:
    response.delete_cookie(_CHALLENGE_COOKIE, path=_CHALLENGE_PATH, samesite="lax")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterCompleteRequest(BaseModel):
    credential: dict
    device_name: str | None = None


class LoginCompleteRequest(BaseModel):
    credential: dict


# ── Registro (enrolar un passkey — usuario ya logueado) ────────────────────────

@router.post("/register/begin")
@limiter.limit("10/minute")
async def register_begin(
    request: Request,
    response: Response,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    existing = (await session.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
    )).scalars().all()

    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.full_name or user.email,
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in existing
        ],
    )

    token = _make_challenge_token("register", bytes_to_base64url(options.challenge), str(user.id))
    _set_challenge_cookie(response, token)
    return json.loads(options_to_json(options))


@router.post("/register/complete")
@limiter.limit("10/minute")
async def register_complete(
    request: Request,
    response: Response,
    body: RegisterCompleteRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    token = request.cookies.get(_CHALLENGE_COOKIE)
    if not token:
        raise HTTPException(status_code=400, detail="Sesión de registro inválida. Reintenta.")
    expected_challenge = _read_challenge_token(token, "register", str(user.id))

    try:
        verification = verify_registration_response(
            credential=json.dumps(body.credential),
            expected_challenge=expected_challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=_expected_origin(),
            require_user_verification=False,
        )
    except Exception:
        _clear_challenge_cookie(response)
        raise HTTPException(status_code=400, detail="No se pudo registrar el dispositivo. Reintenta.")

    credential_id = bytes_to_base64url(verification.credential_id)

    # Idempotencia: si ya existe esa credencial, no duplicar.
    dup = (await session.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )).scalar_one_or_none()
    if dup is None:
        transports = body.credential.get("response", {}).get("transports") or []
        session.add(WebAuthnCredential(
            user_id=user.id,
            credential_id=credential_id,
            public_key=bytes_to_base64url(verification.credential_public_key),
            sign_count=verification.sign_count,
            transports=",".join(transports) if transports else None,
            device_name=(body.device_name or "").strip()[:120] or None,
            backed_up=bool(verification.credential_backed_up),
        ))
        await session.commit()

    _clear_challenge_cookie(response)
    return {"ok": True}


# ── Login por passkey (público, usernameless / discoverable) ───────────────────

@router.post("/login/begin")
@limiter.limit("10/minute")
async def login_begin(request: Request, response: Response):
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    token = _make_challenge_token("login", bytes_to_base64url(options.challenge))
    _set_challenge_cookie(response, token)
    return json.loads(options_to_json(options))


@router.post("/login/complete")
@limiter.limit("10/minute")
async def login_complete(
    request: Request,
    response: Response,
    body: LoginCompleteRequest,
    session: AsyncSession = Depends(get_session),
):
    token = request.cookies.get(_CHALLENGE_COOKIE)
    if not token:
        raise HTTPException(status_code=400, detail="No se pudo iniciar sesión. Reintenta.")
    expected_challenge = _read_challenge_token(token, "login")

    raw_id = body.credential.get("id") or body.credential.get("rawId")
    stored = None
    if raw_id:
        stored = (await session.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.credential_id == raw_id)
        )).scalar_one_or_none()
    if stored is None:
        _clear_challenge_cookie(response)
        raise HTTPException(status_code=400, detail="No se pudo iniciar sesión. Reintenta.")

    try:
        verification = verify_authentication_response(
            credential=json.dumps(body.credential),
            expected_challenge=expected_challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=_expected_origin(),
            credential_public_key=base64url_to_bytes(stored.public_key),
            credential_current_sign_count=stored.sign_count,
            require_user_verification=False,
        )
    except Exception:
        _clear_challenge_cookie(response)
        raise HTTPException(status_code=400, detail="No se pudo iniciar sesión. Reintenta.")

    user = await session.get(User, stored.user_id)
    if not user or not user.is_active:
        _clear_challenge_cookie(response)
        raise HTTPException(status_code=400, detail="No se pudo iniciar sesión. Reintenta.")

    # Actualizar contador anti-clonación y última vez usado.
    stored.sign_count = verification.new_sign_count
    stored.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(stored)

    # Emitir la misma sesión que el login por password.
    jwt = await get_jwt_strategy().write_token(user)
    refresh_raw, refresh_hash = new_refresh_token()
    session.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=REFRESH_DAYS),
    ))
    await session.commit()

    _clear_challenge_cookie(response)
    set_auth_cookies(response, jwt, refresh_raw)
    return {"ok": True}


# ── Gestión de passkeys (desde el perfil) ──────────────────────────────────────

@router.get("/credentials")
async def list_credentials(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    creds = (await session.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.user_id == user.id)
        .order_by(WebAuthnCredential.created_at.desc())
    )).scalars().all()
    return [
        {
            "id": str(c.id),
            "device_name": c.device_name,
            "backed_up": c.backed_up,
            "created_at": c.created_at.isoformat(),
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
        }
        for c in creds
    ]


@router.delete("/credentials/{credential_id}")
async def delete_credential(
    credential_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    cred = (await session.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.id == credential_id,
            WebAuthnCredential.user_id == user.id,
        )
    )).scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=404, detail="Passkey no encontrado.")
    await session.delete(cred)
    await session.commit()
    return {"ok": True}
