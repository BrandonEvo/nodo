"""Utilidades de tiempo del negocio.

La app persiste TODO en UTC naive (`datetime.now(timezone.utc).replace(tzinfo=None)`).
Guatemala es la zona del negocio y del público objetivo: las ventas se cuentan por
día de Guatemala, no por día UTC del servidor. Guatemala no observa horario de
verano desde 2006 → usamos offset fijo UTC-6 (no ZoneInfo) para no depender de
`tzdata` en la imagen `python:3.12-slim`.
"""
from datetime import datetime, timezone, timedelta

# America/Guatemala — offset fijo, sin horario de verano.
GT_TZ = timezone(timedelta(hours=-6))


def utcnow() -> datetime:
    """Ahora en UTC naive — como se persiste `created_at` en toda la app."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_gt() -> datetime:
    """Ahora en hora de Guatemala (aware)."""
    return datetime.now(GT_TZ)


def gt_day_start_utc(ref: datetime | None = None) -> datetime:
    """Inicio del día de Guatemala (00:00 GT) expresado en UTC naive.

    Se usa para comparar contra `created_at` (UTC naive) en las consultas de
    "ventas de hoy": una venta hecha a las 8pm en Guatemala (02:00 UTC del día
    siguiente) debe contar para HOY en Guatemala, no para mañana.
    """
    if ref is None:
        base = datetime.now(GT_TZ)
    elif ref.tzinfo is None:
        # naive → se asume UTC (como se guarda) y se pasa a GT
        base = ref.replace(tzinfo=timezone.utc).astimezone(GT_TZ)
    else:
        base = ref.astimezone(GT_TZ)
    start_gt = base.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_gt.astimezone(timezone.utc).replace(tzinfo=None)
