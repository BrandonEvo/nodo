"""
Backup automático por-empresa (abuelo-padre-hijo).

Lo dispara un timer de systemd del host, no un scheduler dentro de uvicorn: así
sobrevive a los redeploys, no se duplica si algún día hay varios workers, y sigue
el mismo patrón que la Bóveda (`scripts/backup_nodo.sh`).

    docker exec nodo_backend python -m api.services.backup.scheduler

El nivel GFS se decide por la fecha UTC (igual que la Bóveda, que corre en el host
en UTC): día 1 → abuelo, domingo → padre, el resto → hijo. Es idempotente: si ya
existe la corrida programada de hoy para una empresa, la salta.
"""
from __future__ import annotations

import asyncio
import json
import sys
from collections import namedtuple
from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.time import utcnow
from models import Tenant
from models.backup import BackupRecord, BackupSettings

from . import exporter, retention

# Debe coincidir con deploy/systemd/nodo-cartridges.timer (el host corre en UTC).
SCHEDULED_HOUR_UTC = 3
SCHEDULED_MINUTE_UTC = 45


def tier_for(day: date) -> str:
    if day.day == 1:
        return "monthly"
    if day.isoweekday() == 7:
        return "weekly"
    return "daily"


def next_run_after(now: datetime) -> datetime:
    today = now.replace(hour=SCHEDULED_HOUR_UTC, minute=SCHEDULED_MINUTE_UTC, second=0, microsecond=0)
    return today if today > now else today + timedelta(days=1)


async def _settings(session: AsyncSession) -> BackupSettings:
    row = (await session.execute(select(BackupSettings).limit(1))).scalars().first()
    if not row:
        row = BackupSettings()
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return row


# Foto inmutable de la empresa. Un rollback expira los objetos ORM, y leer un
# atributo expirado desde código async dispara un lazy-load síncrono
# (MissingGreenlet). El exporter solo necesita `id` y `name`.
TenantRef = namedtuple("TenantRef", "id name")


async def _tenants_in_scope(session: AsyncSession, settings_row: BackupSettings) -> list[TenantRef]:
    stmt = select(Tenant).where(Tenant.is_active == True)  # noqa: E712
    tenants = list((await session.execute(stmt)).scalars().all())
    if settings_row.scope == "selected":
        wanted = {str(t) for t in (settings_row.selected_tenants or [])}
        tenants = [t for t in tenants if str(t.id) in wanted]
    return [TenantRef(t.id, t.name) for t in tenants]


async def _already_ran_today(session: AsyncSession, tenant_id, tier: str, since: datetime) -> bool:
    stmt = (
        select(BackupRecord.id)
        .where(
            BackupRecord.subject_tenant_id == tenant_id,
            BackupRecord.trigger == "scheduled",
            BackupRecord.gfs_tier == tier,
            BackupRecord.status == "completed",
            BackupRecord.created_at >= since,
        )
        .limit(1)
    )
    return (await session.execute(stmt)).first() is not None


async def run_scheduled(session: AsyncSession, *, force: bool = False) -> dict:
    """
    Exporta un cartucho de cada empresa en alcance y aplica la retención.
    `force=True` ignora el toggle y la guarda de idempotencia (botón "correr ahora").
    """
    settings_row = await _settings(session)
    if not settings_row.enabled and not force:
        return {"status": "disabled", "exported": 0}

    now = utcnow()
    tier = tier_for(now.date())
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Snapshot antes del bucle: si una empresa falla hacemos rollback, y eso expira
    # cualquier objeto ORM que quisiéramos leer después.
    tenants = await _tenants_in_scope(session, settings_row)
    driver_name = settings_row.storage_driver
    storage_config = settings_row.storage_config

    exported: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    for tenant in tenants:
        if not force and await _already_ran_today(session, tenant.id, tier, day_start):
            skipped.append(str(tenant.id))
            continue
        try:
            record = await exporter.export_tenant(
                session, tenant,
                gfs_tier=tier,
                trigger="scheduled",
                driver_name=driver_name,
                storage_config=storage_config,
            )
            exported.append(str(record.id))
        except Exception as exc:  # una empresa que falla no debe frenar a las demás
            await session.rollback()
            errors.append({"tenant_id": str(tenant.id), "tenant": tenant.name, "error": str(exc)[:500]})

    settings_row = await _settings(session)  # re-leer: pudo expirar en un rollback
    pruned = await retention.prune(session, settings_row)

    settings_row.last_run_at = now
    next_run = next_run_after(now)
    settings_row.next_run_at = next_run
    session.add(settings_row)
    await session.commit()

    return {
        "status": "ok" if not errors else "partial",
        "tier": tier,
        "exported": len(exported),
        "skipped": len(skipped),
        "errors": errors,
        "pruned": pruned,
        "next_run_at": next_run.isoformat(),
    }


async def _main() -> int:
    from db.session import async_session_maker

    async with async_session_maker() as session:
        result = await run_scheduled(session)
    print(json.dumps(result, ensure_ascii=False))
    return 1 if result.get("errors") else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
