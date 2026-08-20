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

`pywebpush` es SÍNCRONO (usa `requests`). Llamarlo desde una corrutina bloquea el
event loop ENTERO del worker: mientras una reserva mandaba sus N avisos, ese worker
no atendía nada más — ni al dueño publicando un producto, ni al resto de clientes
mirando el catálogo. Y sin timeout, un endpoint de push colgado lo dejaba muerto
para siempre. De ahí las tres reglas de este módulo:

  1. Cada envío corre en un hilo (`to_thread`), nunca en el loop.
  2. Siempre con timeout.
  3. El request NO espera la entrega: un aviso no puede retrasar una venta.
"""
import asyncio
import json
import logging
from uuid import UUID

import anyio.to_thread
from pywebpush import webpush, WebPushException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.config import settings
from db.session import async_session_maker

logger = logging.getLogger(__name__)

# Un push que tarda más que esto es un push perdido: al dueño le sirve el aviso ahora,
# no dentro de un minuto. `requests` sin timeout espera para siempre.
PUSH_TIMEOUT_SECONDS = 5.0

# asyncio sólo guarda una referencia débil a las tasks: sin esto el GC puede matarlas
# a mitad de vuelo y el aviso se pierde en silencio.
_background: set[asyncio.Task] = set()


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
    Envía una notificación push a una sola suscripción. BLOQUEANTE: llamar sólo dentro
    de un hilo (`anyio.to_thread.run_sync`), nunca directo desde una corrutina.
    Retorna False si el endpoint expiró (410 Gone) — el caller elimina la suscripción.
    """
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY_PEM,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CONTACT_EMAIL}"},
            timeout=PUSH_TIMEOUT_SECONDS,
        )
        return True
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            return False  # suscripción expirada
        logger.warning("push error endpoint=%s err=%s", endpoint[:60], e)
        return True  # error transitorio, no eliminar
    except Exception as e:                      # timeout, DNS, TLS: nunca tumbar al caller
        logger.warning("push falló endpoint=%s err=%s", endpoint[:60], e)
        return True


async def _deliver(subs: list[tuple[UUID, str, str, str]], payload: str) -> None:
    """Manda todos los avisos en paralelo (un hilo cada uno) y limpia los muertos."""
    try:
        results = await asyncio.gather(*[
            anyio.to_thread.run_sync(_send_one, endpoint, p256dh, auth, payload)
            for _, endpoint, p256dh, auth in subs
        ], return_exceptions=True)

        expired_ids = [
            sub_id for (sub_id, *_), alive in zip(subs, results)
            if alive is False
        ]
        if not expired_ids:
            return

        # Sesión propia: la del request ya se cerró cuando esta tarea corre.
        PushSubscription = _get_model()
        async with async_session_maker() as session:
            for sub_id in expired_ids:
                sub = await session.get(PushSubscription, sub_id)
                if sub:
                    await session.delete(sub)
            await session.commit()
    except Exception:
        logger.exception("no se pudo entregar el lote de push")


def _dispatch(rows, payload: str) -> None:
    """Dispara la entrega y NO la espera. El push es un aviso, no parte de la
    transacción: que tarde no puede alargar el request ni retener su conexión a la BD."""
    subs = [(s.id, s.endpoint, s.p256dh, s.auth) for s in rows]
    if not subs:
        return
    task = asyncio.create_task(_deliver(subs, payload))
    _background.add(task)
    task.add_done_callback(_background.discard)


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
    _dispatch(result.scalars().all(), _build_payload(title, body, data))


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
    _dispatch(result.scalars().all(), _build_payload(title, body, data))
