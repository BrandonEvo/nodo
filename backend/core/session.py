"""Helpers de sesión compartidos: emisión de cookies httpOnly (JWT + refresh).

Fuente única de verdad para el par de cookies de autenticación. Lo usan tanto el
login por password (api.routers.auth) como el login por Google (auth_google) y el
login por passkey/WebAuthn (api.routers.webauthn).
"""
import hashlib
import os

from fastapi import Response

from core.config import settings

JWT_LIFETIME = 3600 * 2   # 2 horas
REFRESH_DAYS = 7          # 7 días


def new_refresh_token() -> tuple[str, str]:
    """Devuelve (token_raw, token_hash). Guardar solo el hash en BD."""
    raw = os.urandom(32).hex()
    h   = hashlib.sha256(raw.encode()).hexdigest()
    return raw, h


def set_auth_cookies(response: Response, jwt: str, refresh_raw: str) -> None:
    secure = settings.COOKIE_SECURE
    response.set_cookie(
        key="access_token", value=jwt,
        httponly=True, max_age=JWT_LIFETIME, samesite="lax", secure=secure,
    )
    response.set_cookie(
        key="refresh_token", value=refresh_raw,
        httponly=True, max_age=REFRESH_DAYS * 86400, samesite="lax", secure=secure,
        path="/api/auth/refresh",
    )
