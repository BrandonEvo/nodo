"""
Lógica compartida del módulo Citas: cálculo de slots y códigos cortos.

No hay tabla de slots — la disponibilidad se computa al vuelo:
plantilla semanal (booking_hours) − excepciones (booking_exceptions)
− citas activas que se solapan (pendiente/confirmada). Cero jobs de fondo.

Las citas viven en hora local del negocio (naive) — "ahora" se calcula
con la zona horaria de booking_settings, nunca con la del servidor.
"""
import random
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.citas import BookingAppointment, BookingException, BookingHour, BookingSettings

# Estados que ocupan el slot — todo lo demás (rechazada, cancelada...) lo libera
BLOCKING_STATUSES = ("pendiente", "confirmada")

# Sin caracteres ambiguos (0/O, 1/I/L) — el cliente lo dicta por teléfono
SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def now_utc() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_local(settings: BookingSettings) -> datetime:
    try:
        tz = ZoneInfo(settings.timezone)
    except Exception:
        tz = ZoneInfo("America/Guatemala")
    return datetime.now(tz).replace(tzinfo=None)


async def generate_short_code(session: AsyncSession, tenant_id: uuid.UUID) -> str:
    for _ in range(10):
        code = "".join(random.choices(SHORT_CODE_ALPHABET, k=4))
        exists = await session.execute(
            select(BookingAppointment.id).where(
                BookingAppointment.tenant_id == tenant_id,
                BookingAppointment.short_code == code,
                BookingAppointment.status.in_(BLOCKING_STATUSES),
            )
        )
        if not exists.first():
            return code
    return "".join(random.choices(SHORT_CODE_ALPHABET, k=6))


def ranges_for_date(
    target: date,
    hours: list[BookingHour],
    exceptions_by_date: dict[date, BookingException],
) -> list[tuple[time, time]]:
    """Rangos abiertos de un día: la excepción reemplaza la plantilla semanal."""
    exc = exceptions_by_date.get(target)
    if exc:
        if exc.is_closed or not exc.start_time or not exc.end_time:
            return []
        return [(exc.start_time, exc.end_time)]
    return [(h.start_time, h.end_time) for h in hours if h.weekday == target.weekday()]


def slots_for_date(
    target: date,
    ranges: list[tuple[time, time]],
    granularity_minutes: int,
    duration_minutes: int,
    busy: list[tuple[datetime, datetime]],
    min_start: datetime,
) -> list[datetime]:
    """Inicios válidos: caben completos en el rango, no se solapan y respetan min_start."""
    slots: list[datetime] = []
    step = timedelta(minutes=granularity_minutes)
    duration = timedelta(minutes=duration_minutes)
    for start_t, end_t in ranges:
        cursor = datetime.combine(target, start_t)
        range_end = datetime.combine(target, end_t)
        while cursor + duration <= range_end:
            if cursor >= min_start and not any(
                cursor < b_end and b_start < cursor + duration for b_start, b_end in busy
            ):
                slots.append(cursor)
            cursor += step
    return sorted(slots)


async def load_availability_context(
    session: AsyncSession,
    settings: BookingSettings,
    date_from: date,
    date_to: date,
) -> tuple[list[BookingHour], dict[date, BookingException], list[tuple[datetime, datetime]]]:
    """Las 3 consultas de disponibilidad en un solo viaje — el resto es memoria."""
    hours = (
        await session.execute(
            select(BookingHour).where(
                BookingHour.tenant_id == settings.tenant_id,
                BookingHour.is_active == True,  # noqa: E712
            )
        )
    ).scalars().all()

    exceptions = (
        await session.execute(
            select(BookingException).where(
                BookingException.tenant_id == settings.tenant_id,
                BookingException.is_active == True,  # noqa: E712
                BookingException.date >= date_from,
                BookingException.date <= date_to,
            )
        )
    ).scalars().all()

    appointments = (
        await session.execute(
            select(BookingAppointment).where(
                BookingAppointment.tenant_id == settings.tenant_id,
                BookingAppointment.status.in_(BLOCKING_STATUSES),
                BookingAppointment.starts_at >= datetime.combine(date_from, time.min),
                BookingAppointment.starts_at <= datetime.combine(date_to, time.max),
            )
        )
    ).scalars().all()

    return (
        list(hours),
        {e.date: e for e in exceptions},
        [(a.starts_at, a.ends_at) for a in appointments],
    )


async def compute_slots(
    session: AsyncSession,
    settings: BookingSettings,
    duration_minutes: int,
    target: date,
) -> list[datetime]:
    hours, exceptions, busy = await load_availability_context(session, settings, target, target)
    min_start = now_local(settings) + timedelta(hours=settings.min_notice_hours)
    return slots_for_date(
        target,
        ranges_for_date(target, hours, exceptions),
        settings.slot_granularity_minutes,
        duration_minutes,
        busy,
        min_start,
    )


async def compute_days_overview(
    session: AsyncSession,
    settings: BookingSettings,
    duration_minutes: int,
) -> tuple[list[dict], datetime | None]:
    """Para la tira de días del calendario: has_slots por día + primera cita disponible."""
    today = now_local(settings).date()
    date_to = today + timedelta(days=settings.max_days_ahead)
    hours, exceptions, busy = await load_availability_context(session, settings, today, date_to)
    min_start = now_local(settings) + timedelta(hours=settings.min_notice_hours)

    days: list[dict] = []
    next_available: datetime | None = None
    for offset in range(settings.max_days_ahead + 1):
        target = today + timedelta(days=offset)
        slots = slots_for_date(
            target,
            ranges_for_date(target, hours, exceptions),
            settings.slot_granularity_minutes,
            duration_minutes,
            busy,
            min_start,
        )
        days.append({"date": target, "has_slots": bool(slots)})
        if next_available is None and slots:
            next_available = slots[0]
    return days, next_available
