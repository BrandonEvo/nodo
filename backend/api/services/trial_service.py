"""
Arranque de periodos de prueba — lógica compartida (registro + grant manual).

`start_trial` activa los módulos (del plan, o todos los activos) y deja al tenant
en 'trialing' por N días. NO hace commit: el caller controla la transacción.
La duración por defecto vive en platform_config (key `default_trial_days`),
editable por el superadmin; si no existe, cae a DEFAULT_TRIAL_DAYS.
"""
from datetime import datetime, timezone, timedelta

from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models import Module, Subscription, PlanModule, PlatformConfig

DEFAULT_TRIAL_DAYS = 14


async def get_default_trial_days(session: AsyncSession) -> int:
    cfg = await session.get(PlatformConfig, "default_trial_days")
    try:
        days = int(cfg.value) if cfg else DEFAULT_TRIAL_DAYS
    except (ValueError, TypeError):
        return DEFAULT_TRIAL_DAYS
    return days if 1 <= days <= 365 else DEFAULT_TRIAL_DAYS


async def start_trial(session: AsyncSession, tenant, days: int, plan_id=None) -> int:
    """
    Activa módulos y pone al tenant en 'trialing' por `days`. Devuelve cuántos
    módulos se activaron. plan_id=None → todos los módulos activos (acceso full).
    """
    if plan_id:
        result = await session.execute(
            select(PlanModule.module_id).where(PlanModule.plan_id == plan_id)
        )
        module_ids = list(result.scalars().all())
        tenant.plan_id = plan_id
    else:
        result = await session.execute(
            select(Module.id).where(Module.is_active == True)  # noqa: E712
        )
        module_ids = list(result.scalars().all())

    await session.execute(sa_delete(Subscription).where(Subscription.tenant_id == tenant.id))
    for mid in module_ids:
        session.add(Subscription(tenant_id=tenant.id, module_id=mid, status="active"))

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    tenant.billing_status = "trialing"
    tenant.trial_ends_at = now + timedelta(days=days)
    session.add(tenant)
    return len(module_ids)
