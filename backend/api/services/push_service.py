"""
Servicio de Web Push Notifications (VAPID).

Uso:
    from api.services.push_service import send_push_to_tenant

    await send_push_to_tenant(
        session=session,
        tenant_id=tenant_id,
        title="Stock bajo",
        body="Harina 000 — quedan 2 kg",
        data={"module": "bodega"},   # opcional, llega al SW
    )
"""
import json
import logging
from uuid import UUID

from pywebpush import webpush, WebPushException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.config import settings

logger = logging.getLogger(__name__)

# Importación diferida para evitar circular imports — el modelo se importa solo al usar el módulo
def _get_model():
    from models.platform_config import PushSubscription  # importado aquí
    return PushSubscription


def _build_payload(title: str, body: str, data: dict | None = None) -> str:
    payload = {"title": title, "body": body}
    if data:
        payload["data"] = data
    return json.dumps(payload)


def _send_one(endpoint: str, p256dh: str, auth: str, payload: str) -> bool:
    """
    Envía una notificación push a una sola suscripción.
    Retorna False si el endpoint expiró (410 Gone) — el caller debe eliminar la suscripción.
    """
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY_PEM,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CONTACT_EMAIL}"},
        )
        return True
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            return False  # suscripción expirada
        logger.warning("push error endpoint=%s err=%s", endpoint[:60], e)
        return True  # error transitorio, no eliminar


async def send_push_to_user(
    session: AsyncSession,
    user_id: UUID,
    tenant_id: UUID,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Envía notificación a todas las suscripciones activas de un usuario específico."""
    if not settings.VAPID_PRIVATE_KEY_PEM:
        return

    PushSubscription = _get_model()
    result = await session.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.tenant_id == tenant_id,
        )
    )
    subs = result.scalars().all()
    payload = _build_payload(title, body, data)
    expired_ids = []

    for sub in subs:
        alive = _send_one(sub.endpoint, sub.p256dh, sub.auth, payload)
        if not alive:
            expired_ids.append(sub.id)

    for sub_id in expired_ids:
        sub = await session.get(PushSubscription, sub_id)
        if sub:
            await session.delete(sub)
    if expired_ids:
        await session.commit()


async def send_push_to_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Envía notificación a todos los usuarios suscritos del tenant."""
    if not settings.VAPID_PRIVATE_KEY_PEM:
        return

    PushSubscription = _get_model()
    result = await session.execute(
        select(PushSubscription).where(PushSubscription.tenant_id == tenant_id)
    )
    subs = result.scalars().all()
    payload = _build_payload(title, body, data)
    expired_ids = []

    for sub in subs:
        alive = _send_one(sub.endpoint, sub.p256dh, sub.auth, payload)
        if not alive:
            expired_ids.append(sub.id)

    for sub_id in expired_ids:
        sub = await session.get(PushSubscription, sub_id)
        if sub:
            await session.delete(sub)
    if expired_ids:
        await session.commit()
