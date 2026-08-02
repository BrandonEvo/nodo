"""
Registro de errores no manejados (500) para el panel del súper admin.

Antes de esto, un 500 en producción sólo existía si alguien abría `docker logs`.
Ahora queda una fila agrupada por firma, con contador, y el súper admin recibe un
push la primera vez que una firma aparece (o cuando reaparece tras darla por
resuelta) — no en cada repetición, o un endpoint que se pollea vaciaría la batería
del teléfono en una tarde.

Regla de oro de este módulo: **nunca romper el request**. Está en el camino de una
respuesta de error que ya salió mal; si la captura falla, se traga la excepción y
el cliente igual recibe su 500. Un monitoreo que tumba el server es peor que no
tener monitoreo.
"""
import hashlib
import logging
import traceback as tb_module
from datetime import datetime, timezone

from sqlmodel import select

logger = logging.getLogger(__name__)

_MAX_TB = 20000
_MAX_MSG = 2000


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fingerprint(exc: BaseException, path: str, method: str, tb: str) -> str:
    """Agrupa por tipo + ruta + el último frame propio del traceback. Excluye el
    mensaje: un 'user 3f2a no encontrado' y un 'user 9b1c no encontrado' son el
    mismo bug y deben caer en la misma fila."""
    frames = [ln for ln in tb.splitlines() if ln.strip().startswith("File ")]
    origin = frames[-1] if frames else ""
    raw = f"{type(exc).__name__}|{method}|{path}|{origin}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _normalize_path(path: str) -> str:
    """Los UUID de la ruta convierten cada request en un bug distinto. Se colapsan
    para que /api/x/<uuid1> y /api/x/<uuid2> compartan firma."""
    parts = []
    for seg in path.split("/"):
        if len(seg) == 36 and seg.count("-") == 4:
            parts.append("{id}")
        elif seg.isdigit():
            parts.append("{n}")
        else:
            parts.append(seg)
    return "/".join(parts)[:500]


async def record_exception(request, exc: BaseException) -> None:
    """Persiste el error y avisa si la firma es nueva. Nunca propaga."""
    try:
        from db.session import async_session_maker
        from models import ErrorEvent

        tb = "".join(tb_module.format_exception(type(exc), exc, exc.__traceback__))[-_MAX_TB:]
        method = getattr(request, "method", "?")[:10]
        path = _normalize_path(str(getattr(getattr(request, "url", None), "path", "?")))
        fp = _fingerprint(exc, path, method, tb)
        now = _now()

        # Sesión propia: la del request viene de una transacción que ya reventó.
        async with async_session_maker() as session:
            existing = (await session.execute(
                select(ErrorEvent).where(ErrorEvent.fingerprint == fp)
            )).scalar_one_or_none()

            if existing is None:
                event = ErrorEvent(
                    fingerprint=fp,
                    exc_type=type(exc).__name__[:200],
                    message=str(exc)[:_MAX_MSG],
                    method=method,
                    path=path,
                    traceback=tb,
                    tenant_id=_ctx_tenant(request),
                    user_email=_ctx_email(request),
                    first_seen_at=now,
                    last_seen_at=now,
                )
                session.add(event)
                await session.commit()
                await session.refresh(event)
                should_notify = True
            else:
                # Reaparecer tras darlo por resuelto vuelve a ser noticia.
                should_notify = existing.resolved_at is not None
                existing.count += 1
                existing.last_seen_at = now
                existing.message = str(exc)[:_MAX_MSG]
                existing.traceback = tb
                existing.resolved_at = None
                session.add(existing)
                await session.commit()
                await session.refresh(existing)
                event = existing

            if should_notify:
                await _notify(session, event, now)

    except Exception:   # noqa: BLE001 — el monitoreo jamás tumba el request
        logger.exception("error_monitor: no se pudo registrar la excepción")


def _ctx_tenant(request):
    try:
        return getattr(request.state, "tenant_id", None)
    except Exception:
        return None


def _ctx_email(request):
    try:
        user = getattr(request.state, "user", None)
        return (getattr(user, "email", None) or None) if user else None
    except Exception:
        return None


async def _notify(session, event, now) -> None:
    """Push a los súper admins suscritos. Falla en silencio: no avisar es malo,
    pero perder el registro del error por un push caído es peor."""
    try:
        from api.services.push_service import send_push_to_user
        from models import User
        from models.platform_config import PushSubscription

        admins = (await session.execute(
            select(User.id).where(User.is_superuser == True, User.is_active == True)  # noqa: E712
        )).scalars().all()
        if not admins:
            return

        for uid in admins:
            subs = (await session.execute(
                select(PushSubscription.tenant_id).where(PushSubscription.user_id == uid)
            )).scalars().all()
            for tid in set(subs):
                await send_push_to_user(
                    session=session, user_id=uid, tenant_id=tid,
                    title=f"Error en {event.path}",
                    body=f"{event.exc_type}: {event.message[:120]}",
                    data={"module": "admin", "error_id": str(event.id)},
                )

        event.notified_at = now
        session.add(event)
        await session.commit()
    except Exception:   # noqa: BLE001
        logger.warning("error_monitor: no se pudo notificar", exc_info=True)
