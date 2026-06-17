"""
Configuración global de la plataforma — Solo Súper Admin.
GET  /api/admin/config     → Listar todas las configuraciones
PATCH /api/admin/config/{key} → Actualizar un valor
POST /api/admin/config/seed   → Sembrar valores por defecto (idempotente)
"""
from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from core.config import settings
from models import User
from models.platform_config import PlatformConfig
from models.schemas import PlatformConfigRead, PlatformConfigUpdate

router = APIRouter(tags=["Admin: Platform Config"])

# Valores por defecto
DEFAULT_CONFIGS = [
    {
        "key": "invitation_token_validity_days",
        "value": "7",
        "description": "Días de validez de un token de invitación antes de que expire automáticamente.",
    },
    {
        "key": "max_pending_invitations_per_tenant",
        "value": "50",
        "description": "Límite máximo de invitaciones pendientes por empresa según su suscripción.",
    },
    {
        "key": "default_trial_days",
        "value": "14",
        "description": "Días de prueba gratuita que recibe automáticamente una empresa al registrarse.",
    },
]


def _require_superuser(user: User):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo el Súper Admin puede acceder a esta configuración")


@router.get("/status")
async def platform_status(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Estado de salud (API, base de datos, entorno) + hora del servidor. Solo Súper Admin."""
    _require_superuser(current_user)
    try:
        await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    now = datetime.now(timezone.utc)
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "server_time": now.isoformat(),  # ISO 8601 en UTC
        "server_timezone": "UTC",
    }


@router.get("/", response_model=List[PlatformConfigRead])
async def list_configs(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Lista todas las configuraciones de la plataforma."""
    _require_superuser(current_user)
    result = await session.execute(select(PlatformConfig).order_by(PlatformConfig.key))
    return result.scalars().all()


@router.patch("/{key}", response_model=PlatformConfigRead)
async def update_config(
    key: str,
    body: PlatformConfigUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Actualiza el valor de una configuración."""
    _require_superuser(current_user)
    config = await session.get(PlatformConfig, key)
    if not config:
        raise HTTPException(status_code=404, detail=f"Configuración '{key}' no encontrada")
    config.value = body.value
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return config


@router.post("/seed", status_code=201)
async def seed_default_configs(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Siembra las configuraciones por defecto (idempotente)."""
    _require_superuser(current_user)
    created = 0
    for cfg in DEFAULT_CONFIGS:
        existing = await session.get(PlatformConfig, cfg["key"])
        if not existing:
            session.add(PlatformConfig(**cfg))
            created += 1
    await session.commit()
    return {"detail": f"{created} configuraciones creadas, {len(DEFAULT_CONFIGS) - created} ya existían"}
