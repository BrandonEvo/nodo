"""
Retención GFS de los cartuchos (abuelo-padre-hijo).

Un cartucho es una foto completa del tenant, así que cada corrida genera UN solo
archivo y lo etiqueta con el nivel más alto que aplique (día 1 → abuelo, domingo →
padre, el resto → hijo). Podar = conservar los N más recientes de cada nivel, por
empresa. Esto es GFS clásico: el backup no se duplica, se *promueve* y se conserva
más tiempo.

Nunca se poda `manual` (lo pidió una persona) ni el `safety` reciente (el punto de
undo que se guarda antes de cada restore), que vive `SAFETY_KEEP_DAYS` días.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.time import utcnow
from models.backup import BackupRecord, BackupSettings

from .storage import get_driver

SAFETY_KEEP_DAYS = 7
PRUNABLE_TIERS = ("daily", "weekly", "monthly")


def _select_victims(records: list[BackupRecord], keep: dict[str, int]) -> list[BackupRecord]:
    """`records` debe venir del más nuevo al más viejo."""
    seen: dict[tuple, int] = {}
    safety_cutoff = utcnow() - timedelta(days=SAFETY_KEEP_DAYS)
    victims: list[BackupRecord] = []

    for record in records:
        tier = record.gfs_tier
        if tier in PRUNABLE_TIERS:
            bucket = (record.subject_tenant_id, tier)
            seen[bucket] = seen.get(bucket, 0) + 1
            if seen[bucket] > keep[tier]:
                victims.append(record)
        elif tier == "safety" and record.created_at < safety_cutoff:
            victims.append(record)

    return victims


async def prune(session: AsyncSession, settings_row: BackupSettings, *, dry_run: bool = False) -> dict:
    """Borra los cartuchos que exceden la retención. Devuelve un resumen."""
    keep = {
        "daily": max(1, settings_row.keep_daily),
        "weekly": max(1, settings_row.keep_weekly),
        "monthly": max(1, settings_row.keep_monthly),
    }

    stmt = select(BackupRecord).where(BackupRecord.kind == "tenant").order_by(BackupRecord.created_at.desc())
    records = list((await session.execute(stmt)).scalars().all())
    victims = _select_victims(records, keep)

    deleted = freed = 0
    orphaned: list[str] = []

    for record in victims:
        if dry_run:
            deleted += 1
            freed += record.size_bytes
            continue
        try:
            get_driver(record.storage_driver).delete(record.storage_key)
        except ValueError:
            # Driver desconocido (p. ej. un s3 configurado y luego removido): no
            # borramos el registro, porque perderíamos el puntero al archivo real.
            orphaned.append(str(record.id))
            continue
        except OSError:
            pass  # el archivo ya no está; el registro sí se va
        await session.delete(record)
        deleted += 1
        freed += record.size_bytes

    if not dry_run and deleted:
        await session.commit()

    return {"deleted": deleted, "freed_bytes": freed, "orphaned": orphaned, "dry_run": dry_run}
