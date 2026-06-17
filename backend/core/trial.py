"""
Política de acceso por periodo de prueba (trial) — fuente única de verdad.

Modelo "medio con gracia":
    trialing → (vence trial_ends_at) → grace (GRACE_DAYS solo-lectura) → locked

Solo aplica si el tenant tiene `trial_ends_at`. Un tenant 'active' (pagado) o sin
trial fijado tiene acceso pleno. La usan la sesión (para el banner) y
get_current_tenant_id (para el enforcement), así nunca se desincronizan.
"""
import math
from datetime import datetime, timezone, timedelta

# Días de gracia (solo lectura) tras vencer el trial, antes de bloquear del todo.
GRACE_DAYS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _days_up(target: datetime, now: datetime) -> int:
    """Días enteros (hacia arriba) desde now hasta target; 0 si ya pasó."""
    secs = (target - now).total_seconds()
    return math.ceil(secs / 86400) if secs > 0 else 0


def compute_access(tenant) -> dict:
    """access_state: active | trialing | grace | locked."""
    now = _now()
    ends = tenant.trial_ends_at

    if tenant.billing_status == "active" or ends is None:
        state, t_days, g_days = "active", None, None
    elif now < ends:
        state, t_days, g_days = "trialing", _days_up(ends, now), None
    elif now < ends + timedelta(days=GRACE_DAYS):
        state, t_days, g_days = "grace", 0, _days_up(ends + timedelta(days=GRACE_DAYS), now)
    else:
        state, t_days, g_days = "locked", 0, 0

    return {
        "access_state": state,
        "billing_status": tenant.billing_status,
        "trial_ends_at": ends,
        "trial_days_remaining": t_days,
        "grace_days_remaining": g_days,
    }
