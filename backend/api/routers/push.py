"""
Push Notification Subscriptions
- POST   /api/push/subscriptions     → Guardar o actualizar suscripción del dispositivo actual
- DELETE /api/push/subscriptions     → Eliminar suscripción del dispositivo actual (logout/opt-out)
- GET    /api/push/vapid-public-key  → Devuelve la VAPID public key para que el SW la use
"""
import uuid
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, delete

from db.session import get_session
from api.deps import get_current_tenant_id, current_active_user
from models.platform_config import PushSubscription
from models.users import User
from core.config import settings
from core.limiter import limiter
from pydantic import BaseModel

router = APIRouter(tags=["Push Notifications"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionCreate(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Endpoint público — devuelve solo la clave pública VAPID."""
    return {"vapid_public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def save_subscription(
    request: Request,
    body: SubscriptionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    user_agent = request.headers.get("user-agent", "")[:300]

    result = await session.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        existing.user_agent = user_agent
        session.add(existing)
    else:
        sub = PushSubscription(
            user_id=user.id,
            tenant_id=tenant_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            user_agent=user_agent,
        )
        session.add(sub)

    await session.commit()


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def delete_subscription(
    request: Request,
    body: SubscriptionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    await session.commit()
