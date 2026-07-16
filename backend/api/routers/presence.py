"""
MÓDULO: PRESENCE — Usuarios conectados en tiempo casi-real

  POST /api/presence/ping    → Heartbeat del frontend (cada 60s + cambio de app)
  GET  /api/presence/online  → Snapshot para el panel superadmin

El heartbeat es infraestructura (no datos de negocio): escribe vía get_session
con el tenant resuelto de la membresía activa, igual que hace la sesión.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from core.limiter import limiter
from models import User, Tenant
from models.iam import TenantMember
from models.presence import UserPresence

router = APIRouter(tags=["Presence"])

ONLINE_WINDOW_MINUTES = 2


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PresencePing(BaseModel):
    app_key: Optional[str] = None


class PresenceUser(BaseModel):
    email: str
    full_name: Optional[str] = None
    tenant_name: Optional[str] = None
    app_key: Optional[str] = None
    last_seen: datetime
    is_superuser: bool = False


class PresenceAppCount(BaseModel):
    app_key: str
    count: int


class PresenceTenantCount(BaseModel):
    tenant_name: str
    count: int


class PresenceSnapshot(BaseModel):
    total_online: int
    window_minutes: int
    apps: list[PresenceAppCount]
    tenants: list[PresenceTenantCount]
    users: list[PresenceUser]


@router.post("/ping", status_code=204)
@limiter.limit("30/minute")
async def ping(
    request: Request,
    body: PresencePing,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    member_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == user.id,
            TenantMember.is_active == True,
        )
    )
    membership = member_result.scalars().first()
    tenant_id = membership.tenant_id if membership else None

    now = _now()
    existing_result = await session.execute(
        select(UserPresence).where(UserPresence.user_id == user.id)
    )
    presence = existing_result.scalar_one_or_none()
    if presence:
        presence.tenant_id = tenant_id
        presence.app_key = body.app_key
        presence.last_seen = now
        presence.updated_at = now
    else:
        presence = UserPresence(
            user_id=user.id,
            tenant_id=tenant_id,
            app_key=body.app_key,
            last_seen=now,
        )
    session.add(presence)
    await session.commit()


@router.get("/online", response_model=PresenceSnapshot)
async def online(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Acceso restringido.")

    since = _now() - timedelta(minutes=ONLINE_WINDOW_MINUTES)
    result = await session.execute(
        select(UserPresence, User, Tenant)
        .join(User, UserPresence.user_id == User.id)
        .join(Tenant, UserPresence.tenant_id == Tenant.id, isouter=True)
        .where(UserPresence.last_seen >= since)
        .order_by(UserPresence.last_seen.desc())
    )
    rows = result.all()

    apps: dict[str, int] = {}
    tenants: dict[str, int] = {}
    users: list[PresenceUser] = []
    for presence, presence_user, tenant in rows:
        app = presence.app_key or "home"
        apps[app] = apps.get(app, 0) + 1
        tname = tenant.name if tenant else ("Nodo Core" if presence_user.is_superuser else "—")
        tenants[tname] = tenants.get(tname, 0) + 1
        users.append(PresenceUser(
            email=presence_user.email,
            full_name=getattr(presence_user, "full_name", None),
            tenant_name=tname,
            app_key=presence.app_key,
            last_seen=presence.last_seen,
            is_superuser=presence_user.is_superuser,
        ))

    return PresenceSnapshot(
        total_online=len(rows),
        window_minutes=ONLINE_WINDOW_MINUTES,
        apps=sorted(
            (PresenceAppCount(app_key=k, count=v) for k, v in apps.items()),
            key=lambda a: -a.count,
        ),
        tenants=sorted(
            (PresenceTenantCount(tenant_name=k, count=v) for k, v in tenants.items()),
            key=lambda t: -t.count,
        ),
        users=users,
    )
