"""
MÓDULO CITAS: agenda pública con confirmación de reservas
- GET    /api/citas/settings                    → Config de la agenda (auto-crea con token público)
- PATCH  /api/citas/settings                    → Modo confirmación, granularidad, ventana, TZ
- GET    /api/citas/services                    → Catálogo de servicios
- POST   /api/citas/services                    → Crear servicio
- PATCH  /api/citas/services/{id}               → Editar servicio
- DELETE /api/citas/services/{id}               → Soft-delete
- GET    /api/citas/hours                       → Plantilla semanal
- PUT    /api/citas/hours                       → Reemplazar plantilla completa
- GET    /api/citas/exceptions                  → Excepciones (feriados / horario especial)
- POST   /api/citas/exceptions                  → Crear/actualizar excepción de una fecha
- DELETE /api/citas/exceptions/{id}             → Eliminar excepción
- GET    /api/citas/agenda?date=                → Citas del día + contador de pendientes
- GET    /api/citas/agenda/month?month=YYYY-MM   → Resumen del mes (citas/pendientes por día + ofertas)
- GET    /api/citas/appointments/pending         → Pendientes próximas (foco al abrir el módulo)
- GET    /api/citas/appointments                → Listado con filtros (status, rango)
- POST   /api/citas/appointments                → Cita manual del negocio (nace confirmada)
- POST   /api/citas/appointments/{id}/confirm   → pendiente → confirmada
- POST   /api/citas/appointments/{id}/reject    → pendiente → rechazada (libera slot)
- POST   /api/citas/appointments/{id}/cancel    → pendiente/confirmada → cancelada
- POST   /api/citas/appointments/{id}/complete  → confirmada → completada
- POST   /api/citas/appointments/{id}/no-show   → confirmada → no_asistio
- GET    /api/citas/offers                       → Ofertas del tenant
- POST   /api/citas/offers                       → Crear oferta
- PATCH  /api/citas/offers/{id}                  → Editar / activar-desactivar oferta
- DELETE /api/citas/offers/{id}                  → Eliminar oferta
"""
import uuid
from datetime import date as date_type, datetime, time, timedelta
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from api.services.booking_service import (
    BLOCKING_STATUSES, compute_slots, generate_short_code, now_local, now_utc,
)
from models.citas import (
    BookingAppointment, BookingException, BookingHour, BookingOffer, BookingService, BookingSettings,
)
from models.schemas import (
    BookingSettingsRead, BookingSettingsUpdate,
    BookingServiceCreate, BookingServiceUpdate, BookingServiceRead,
    BookingHourIn, BookingHourRead,
    BookingExceptionCreate, BookingExceptionRead,
    BookingAppointmentRead, BookingAgendaRead, BookingAppointmentCreate,
    BookingOfferCreate, BookingOfferUpdate, BookingOfferRead,
    BookingDaySummary, BookingMonthRead,
)

router = APIRouter(tags=["Citas (Agenda)"])


def _settings_to_read(s: BookingSettings) -> BookingSettingsRead:
    return BookingSettingsRead(
        public_token=s.public_token,
        is_open=s.is_open,
        confirmation_mode=s.confirmation_mode,
        slot_granularity_minutes=s.slot_granularity_minutes,
        min_notice_hours=s.min_notice_hours,
        max_days_ahead=s.max_days_ahead,
        timezone=s.timezone,
    )


def _service_to_read(s: BookingService) -> BookingServiceRead:
    return BookingServiceRead(
        id=s.id,
        name=s.name,
        description=s.description,
        price=float(s.price),
        duration_minutes=s.duration_minutes,
        is_published=s.is_published,
    )


def _appointment_to_read(a: BookingAppointment) -> BookingAppointmentRead:
    return BookingAppointmentRead(
        id=a.id,
        short_code=a.short_code,
        public_token=a.public_token,
        customer_name=a.customer_name,
        customer_phone=a.customer_phone,
        customer_note=a.customer_note,
        service_id=a.service_id,
        service_name=a.service_name,
        service_price=float(a.service_price),
        duration_minutes=a.duration_minutes,
        starts_at=a.starts_at,
        ends_at=a.ends_at,
        status=a.status,
        confirmed_at=a.confirmed_at,
        cancelled_at=a.cancelled_at,
        cancelled_by=a.cancelled_by,
        created_at=a.created_at,
    )


async def _get_or_create_settings(session: AsyncSession, tenant_id: uuid.UUID) -> BookingSettings:
    settings = (
        await session.execute(
            select(BookingSettings).where(BookingSettings.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not settings:
        settings = BookingSettings(tenant_id=tenant_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


@router.get("/settings", response_model=BookingSettingsRead)
async def get_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(session, tenant_id)
    return _settings_to_read(settings)


@router.patch("/settings", response_model=BookingSettingsRead)
async def update_settings(
    body: BookingSettingsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(session, tenant_id)
    if body.is_open is not None:
        settings.is_open = body.is_open
    if body.confirmation_mode is not None:
        settings.confirmation_mode = body.confirmation_mode
    if body.slot_granularity_minutes is not None:
        if not 5 <= body.slot_granularity_minutes <= 240:
            raise HTTPException(status_code=422, detail="La granularidad debe estar entre 5 y 240 minutos")
        settings.slot_granularity_minutes = body.slot_granularity_minutes
    if body.min_notice_hours is not None:
        if not 0 <= body.min_notice_hours <= 168:
            raise HTTPException(status_code=422, detail="La anticipación mínima debe estar entre 0 y 168 horas")
        settings.min_notice_hours = body.min_notice_hours
    if body.max_days_ahead is not None:
        if not 1 <= body.max_days_ahead <= 90:
            raise HTTPException(status_code=422, detail="La ventana de reserva debe estar entre 1 y 90 días")
        settings.max_days_ahead = body.max_days_ahead
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except Exception:
            raise HTTPException(status_code=422, detail="Zona horaria inválida")
        settings.timezone = body.timezone
    settings.updated_at = now_utc()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return _settings_to_read(settings)


# ── SERVICIOS ──

@router.get("/services", response_model=list[BookingServiceRead])
async def list_services(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(BookingService).where(
            BookingService.tenant_id == tenant_id,
            BookingService.is_active == True,  # noqa: E712
        ).order_by(BookingService.name)
    )
    return [_service_to_read(s) for s in result.scalars().all()]


@router.post("/services", response_model=BookingServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    body: BookingServiceCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")
    if body.price < 0:
        raise HTTPException(status_code=422, detail="El precio no puede ser negativo")
    if not 5 <= body.duration_minutes <= 480:
        raise HTTPException(status_code=422, detail="La duración debe estar entre 5 y 480 minutos")
    service = BookingService(
        tenant_id=tenant_id,
        name=body.name.strip(),
        description=body.description,
        price=Decimal(str(body.price)),
        duration_minutes=body.duration_minutes,
        is_published=body.is_published,
    )
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return _service_to_read(service)


async def _get_service(session: AsyncSession, tenant_id: uuid.UUID, service_id: uuid.UUID) -> BookingService:
    service = (
        await session.execute(
            select(BookingService).where(
                BookingService.id == service_id,
                BookingService.tenant_id == tenant_id,
                BookingService.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return service


@router.patch("/services/{service_id}", response_model=BookingServiceRead)
async def update_service(
    service_id: uuid.UUID,
    body: BookingServiceUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    service = await _get_service(session, tenant_id, service_id)
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=422, detail="El nombre es obligatorio")
        service.name = body.name.strip()
    if body.description is not None:
        service.description = body.description or None
    if body.price is not None:
        if body.price < 0:
            raise HTTPException(status_code=422, detail="El precio no puede ser negativo")
        service.price = Decimal(str(body.price))
    if body.duration_minutes is not None:
        if not 5 <= body.duration_minutes <= 480:
            raise HTTPException(status_code=422, detail="La duración debe estar entre 5 y 480 minutos")
        service.duration_minutes = body.duration_minutes
    if body.is_published is not None:
        service.is_published = body.is_published
    service.updated_at = now_utc()
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return _service_to_read(service)


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    service_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    service = await _get_service(session, tenant_id, service_id)
    service.is_active = False
    service.is_published = False
    service.updated_at = now_utc()
    session.add(service)
    await session.commit()


# ── HORARIOS ──

@router.get("/hours", response_model=list[BookingHourRead])
async def list_hours(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(BookingHour).where(
            BookingHour.tenant_id == tenant_id,
            BookingHour.is_active == True,  # noqa: E712
        ).order_by(BookingHour.weekday, BookingHour.start_time)
    )
    return [
        BookingHourRead(id=h.id, weekday=h.weekday, start_time=h.start_time, end_time=h.end_time)
        for h in result.scalars().all()
    ]


@router.put("/hours", response_model=list[BookingHourRead])
async def replace_hours(
    body: list[BookingHourIn],
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if len(body) > 30:
        raise HTTPException(status_code=422, detail="Demasiados rangos de horario")
    for h in body:
        if not 0 <= h.weekday <= 6:
            raise HTTPException(status_code=422, detail="El día debe estar entre 0 (lunes) y 6 (domingo)")
        if h.start_time >= h.end_time:
            raise HTTPException(status_code=422, detail="La hora de inicio debe ser anterior a la de fin")

    # Reemplazo total: la plantilla son filas sin referencias — borrar e insertar es lo simple
    existing = (
        await session.execute(
            select(BookingHour).where(BookingHour.tenant_id == tenant_id)
        )
    ).scalars().all()
    for row in existing:
        await session.delete(row)

    new_rows = [
        BookingHour(tenant_id=tenant_id, weekday=h.weekday, start_time=h.start_time, end_time=h.end_time)
        for h in body
    ]
    session.add_all(new_rows)
    await session.commit()
    return [
        BookingHourRead(id=h.id, weekday=h.weekday, start_time=h.start_time, end_time=h.end_time)
        for h in sorted(new_rows, key=lambda r: (r.weekday, r.start_time))
    ]


# ── EXCEPCIONES ──

@router.get("/exceptions", response_model=list[BookingExceptionRead])
async def list_exceptions(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(BookingException).where(
            BookingException.tenant_id == tenant_id,
            BookingException.is_active == True,  # noqa: E712
            BookingException.date >= date_type.today() - timedelta(days=1),
        ).order_by(BookingException.date)
    )
    return [
        BookingExceptionRead(
            id=e.id, date=e.date, is_closed=e.is_closed,
            start_time=e.start_time, end_time=e.end_time, note=e.note,
        )
        for e in result.scalars().all()
    ]


@router.post("/exceptions", response_model=BookingExceptionRead, status_code=status.HTTP_201_CREATED)
async def upsert_exception(
    body: BookingExceptionCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.is_closed and (not body.start_time or not body.end_time):
        raise HTTPException(status_code=422, detail="Un horario especial necesita hora de inicio y fin")
    if body.start_time and body.end_time and body.start_time >= body.end_time:
        raise HTTPException(status_code=422, detail="La hora de inicio debe ser anterior a la de fin")

    # Una fila por fecha (índice único) — si ya existe, se actualiza
    exception = (
        await session.execute(
            select(BookingException).where(
                BookingException.tenant_id == tenant_id,
                BookingException.date == body.date,
            )
        )
    ).scalar_one_or_none()
    if exception:
        exception.is_closed = body.is_closed
        exception.start_time = body.start_time
        exception.end_time = body.end_time
        exception.note = body.note
        exception.is_active = True
        exception.updated_at = now_utc()
    else:
        exception = BookingException(
            tenant_id=tenant_id,
            date=body.date,
            is_closed=body.is_closed,
            start_time=body.start_time,
            end_time=body.end_time,
            note=body.note,
        )
    session.add(exception)
    await session.commit()
    await session.refresh(exception)
    return BookingExceptionRead(
        id=exception.id, date=exception.date, is_closed=exception.is_closed,
        start_time=exception.start_time, end_time=exception.end_time, note=exception.note,
    )


@router.delete("/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exception(
    exception_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    exception = (
        await session.execute(
            select(BookingException).where(
                BookingException.id == exception_id,
                BookingException.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not exception:
        raise HTTPException(status_code=404, detail="Excepción no encontrada")
    await session.delete(exception)
    await session.commit()


# ── AGENDA Y CITAS ──

@router.get("/agenda", response_model=BookingAgendaRead)
async def get_agenda(
    date: date_type = Query(...),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointments = (
        await session.execute(
            select(BookingAppointment).where(
                BookingAppointment.tenant_id == tenant_id,
                BookingAppointment.starts_at >= datetime.combine(date, time.min),
                BookingAppointment.starts_at <= datetime.combine(date, time.max),
            ).order_by(BookingAppointment.starts_at)
        )
    ).scalars().all()

    settings = await _get_or_create_settings(session, tenant_id)
    pending_count = (
        await session.execute(
            select(BookingAppointment.id).where(
                BookingAppointment.tenant_id == tenant_id,
                BookingAppointment.status == "pendiente",
                BookingAppointment.starts_at >= now_local(settings),
            )
        )
    ).all()

    return BookingAgendaRead(
        appointments=[_appointment_to_read(a) for a in appointments],
        pending_count=len(pending_count),
    )


@router.get("/agenda/month", response_model=BookingMonthRead)
async def get_agenda_month(
    month: str = Query(..., description="Mes en formato YYYY-MM"),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Resumen del mes para pintar el calendario: por cada día, citas activas,
    cuántas están por confirmar y si hay alguna oferta vigente ese día."""
    try:
        year, mon = (int(p) for p in month.split("-"))
        first = date_type(year, mon, 1)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Mes inválido (usa YYYY-MM)")
    # Primer día del mes siguiente, sin depender de calendar
    last = date_type(year + (mon == 12), (mon % 12) + 1, 1) - timedelta(days=1)

    appointments = (
        await session.execute(
            select(BookingAppointment).where(
                BookingAppointment.tenant_id == tenant_id,
                BookingAppointment.status.in_(("pendiente", "confirmada")),
                BookingAppointment.starts_at >= datetime.combine(first, time.min),
                BookingAppointment.starts_at <= datetime.combine(last, time.max),
            )
        )
    ).scalars().all()

    offers = (
        await session.execute(
            select(BookingOffer).where(
                BookingOffer.tenant_id == tenant_id,
                BookingOffer.is_active == True,  # noqa: E712
                BookingOffer.is_published == True,  # noqa: E712
                BookingOffer.starts_on <= last,
                BookingOffer.ends_on >= first,
            )
        )
    ).scalars().all()

    by_day: dict[date_type, dict[str, int]] = {}
    for a in appointments:
        d = a.starts_at.date()
        bucket = by_day.setdefault(d, {"total": 0, "pending": 0})
        bucket["total"] += 1
        if a.status == "pendiente":
            bucket["pending"] += 1

    offer_days: set[date_type] = set()
    for o in offers:
        day = max(o.starts_on, first)
        while day <= min(o.ends_on, last):
            offer_days.add(day)
            day += timedelta(days=1)

    days = []
    cursor = first
    while cursor <= last:
        bucket = by_day.get(cursor, {"total": 0, "pending": 0})
        days.append(BookingDaySummary(
            date=cursor,
            total=bucket["total"],
            pending=bucket["pending"],
            has_offer=cursor in offer_days,
        ))
        cursor += timedelta(days=1)

    settings = await _get_or_create_settings(session, tenant_id)
    pending_total = (
        await session.execute(
            select(BookingAppointment.id).where(
                BookingAppointment.tenant_id == tenant_id,
                BookingAppointment.status == "pendiente",
                BookingAppointment.starts_at >= now_local(settings),
            )
        )
    ).all()

    return BookingMonthRead(month=month, days=days, pending_total=len(pending_total))


@router.get("/appointments/pending", response_model=list[BookingAppointmentRead])
async def list_pending_appointments(
    limit: int = Query(default=50, le=200),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Citas por confirmar de hoy en adelante — lo primero que el dueño debe ver."""
    settings = await _get_or_create_settings(session, tenant_id)
    result = await session.execute(
        select(BookingAppointment).where(
            BookingAppointment.tenant_id == tenant_id,
            BookingAppointment.status == "pendiente",
            BookingAppointment.starts_at >= now_local(settings),
        ).order_by(BookingAppointment.starts_at).limit(limit)
    )
    return [_appointment_to_read(a) for a in result.scalars().all()]


@router.get("/appointments", response_model=list[BookingAppointmentRead])
async def list_appointments(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    date_from: Optional[date_type] = Query(default=None),
    date_to: Optional[date_type] = Query(default=None),
    limit: int = Query(default=100, le=500),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    query = select(BookingAppointment).where(BookingAppointment.tenant_id == tenant_id)
    if status_filter:
        query = query.where(BookingAppointment.status == status_filter)
    if date_from:
        query = query.where(BookingAppointment.starts_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(BookingAppointment.starts_at <= datetime.combine(date_to, time.max))
    result = await session.execute(query.order_by(BookingAppointment.starts_at).limit(limit))
    return [_appointment_to_read(a) for a in result.scalars().all()]


@router.post("/appointments", response_model=BookingAppointmentRead, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: BookingAppointmentCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.customer_name.strip() or not body.customer_phone.strip():
        raise HTTPException(status_code=422, detail="Nombre y teléfono son obligatorios")

    settings = await _get_or_create_settings(session, tenant_id)
    service = await _get_service(session, tenant_id, body.service_id)

    # El lock de settings serializa reservas por tenant — evita doble-booking
    # entre el negocio y un cliente del link público reservando a la vez
    await session.execute(
        select(BookingSettings).where(BookingSettings.id == settings.id).with_for_update()
    )
    slots = await compute_slots(session, settings, service.duration_minutes, body.starts_at.date())
    if body.starts_at not in slots:
        raise HTTPException(status_code=409, detail="Ese horario ya no está disponible")

    appointment = BookingAppointment(
        tenant_id=tenant_id,
        short_code=await generate_short_code(session, tenant_id),
        customer_name=body.customer_name.strip(),
        customer_phone=body.customer_phone.strip(),
        customer_note=body.customer_note,
        service_id=service.id,
        service_name=service.name,
        service_price=service.price,
        duration_minutes=service.duration_minutes,
        starts_at=body.starts_at,
        ends_at=body.starts_at + timedelta(minutes=service.duration_minutes),
        status="confirmada",
        confirmed_at=now_utc(),
    )
    session.add(appointment)
    await session.commit()
    await session.refresh(appointment)
    return _appointment_to_read(appointment)


async def _get_appointment(
    session: AsyncSession, tenant_id: uuid.UUID, appointment_id: uuid.UUID
) -> BookingAppointment:
    appointment = (
        await session.execute(
            select(BookingAppointment).where(
                BookingAppointment.id == appointment_id,
                BookingAppointment.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return appointment


async def _transition(
    session: AsyncSession,
    appointment: BookingAppointment,
    allowed_from: tuple[str, ...],
    new_status: str,
) -> BookingAppointment:
    if appointment.status not in allowed_from:
        raise HTTPException(status_code=409, detail=f"La cita está '{appointment.status}', no se puede cambiar")
    appointment.status = new_status
    appointment.updated_at = now_utc()
    session.add(appointment)
    await session.commit()
    await session.refresh(appointment)
    return appointment


@router.post("/appointments/{appointment_id}/confirm", response_model=BookingAppointmentRead)
async def confirm_appointment(
    appointment_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment(session, tenant_id, appointment_id)
    appointment.confirmed_at = now_utc()
    return _appointment_to_read(await _transition(session, appointment, ("pendiente",), "confirmada"))


@router.post("/appointments/{appointment_id}/reject", response_model=BookingAppointmentRead)
async def reject_appointment(
    appointment_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment(session, tenant_id, appointment_id)
    return _appointment_to_read(await _transition(session, appointment, ("pendiente",), "rechazada"))


@router.post("/appointments/{appointment_id}/cancel", response_model=BookingAppointmentRead)
async def cancel_appointment(
    appointment_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment(session, tenant_id, appointment_id)
    appointment.cancelled_at = now_utc()
    appointment.cancelled_by = "negocio"
    return _appointment_to_read(await _transition(session, appointment, BLOCKING_STATUSES, "cancelada"))


@router.post("/appointments/{appointment_id}/complete", response_model=BookingAppointmentRead)
async def complete_appointment(
    appointment_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment(session, tenant_id, appointment_id)
    return _appointment_to_read(await _transition(session, appointment, ("confirmada",), "completada"))


@router.post("/appointments/{appointment_id}/no-show", response_model=BookingAppointmentRead)
async def no_show_appointment(
    appointment_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment(session, tenant_id, appointment_id)
    return _appointment_to_read(await _transition(session, appointment, ("confirmada",), "no_asistio"))


# ── OFERTAS ──

OFFER_TYPES = ("percent", "two_for_one", "fixed")


def _offer_to_read(o: BookingOffer, service_name: Optional[str]) -> BookingOfferRead:
    return BookingOfferRead(
        id=o.id,
        title=o.title,
        description=o.description,
        offer_type=o.offer_type,
        value=float(o.value) if o.value is not None else None,
        service_id=o.service_id,
        service_name=service_name,
        starts_on=o.starts_on,
        ends_on=o.ends_on,
        is_published=o.is_published,
    )


def _validate_offer(offer_type: str, value: Optional[float], starts_on, ends_on) -> None:
    if offer_type not in OFFER_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de oferta inválido")
    if starts_on > ends_on:
        raise HTTPException(status_code=422, detail="La fecha de inicio debe ser anterior o igual a la de fin")
    if offer_type == "percent":
        if value is None or not 1 <= value <= 100:
            raise HTTPException(status_code=422, detail="El porcentaje debe estar entre 1 y 100")
    elif offer_type == "fixed":
        if value is None or value < 0:
            raise HTTPException(status_code=422, detail="El precio rebajado no puede ser negativo")


async def _service_names(
    session: AsyncSession, tenant_id: uuid.UUID, service_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not service_ids:
        return {}
    rows = (
        await session.execute(
            select(BookingService.id, BookingService.name).where(
                BookingService.tenant_id == tenant_id,
                BookingService.id.in_(service_ids),
            )
        )
    ).all()
    return {r[0]: r[1] for r in rows}


@router.get("/offers", response_model=list[BookingOfferRead])
async def list_offers(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = (
        await session.execute(
            select(BookingOffer).where(
                BookingOffer.tenant_id == tenant_id,
                BookingOffer.is_active == True,  # noqa: E712
            ).order_by(BookingOffer.starts_on.desc())
        )
    ).scalars().all()
    names = await _service_names(session, tenant_id, {o.service_id for o in result if o.service_id})
    return [_offer_to_read(o, names.get(o.service_id) if o.service_id else None) for o in result]


@router.post("/offers", response_model=BookingOfferRead, status_code=status.HTTP_201_CREATED)
async def create_offer(
    body: BookingOfferCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="El título es obligatorio")
    _validate_offer(body.offer_type, body.value, body.starts_on, body.ends_on)
    service_name: Optional[str] = None
    if body.service_id:
        service = await _get_service(session, tenant_id, body.service_id)
        service_name = service.name

    offer = BookingOffer(
        tenant_id=tenant_id,
        title=body.title.strip(),
        description=body.description or None,
        offer_type=body.offer_type,
        value=Decimal(str(body.value)) if body.value is not None and body.offer_type != "two_for_one" else None,
        service_id=body.service_id,
        starts_on=body.starts_on,
        ends_on=body.ends_on,
        is_published=body.is_published,
    )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    return _offer_to_read(offer, service_name)


async def _get_offer(session: AsyncSession, tenant_id: uuid.UUID, offer_id: uuid.UUID) -> BookingOffer:
    offer = (
        await session.execute(
            select(BookingOffer).where(
                BookingOffer.id == offer_id,
                BookingOffer.tenant_id == tenant_id,
                BookingOffer.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    return offer


@router.patch("/offers/{offer_id}", response_model=BookingOfferRead)
async def update_offer(
    offer_id: uuid.UUID,
    body: BookingOfferUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    offer = await _get_offer(session, tenant_id, offer_id)
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(status_code=422, detail="El título es obligatorio")
        offer.title = body.title.strip()
    if body.description is not None:
        offer.description = body.description or None
    if body.offer_type is not None:
        offer.offer_type = body.offer_type
    if body.starts_on is not None:
        offer.starts_on = body.starts_on
    if body.ends_on is not None:
        offer.ends_on = body.ends_on
    # value depende del tipo final — se valida contra el estado resultante
    if body.value is not None or body.offer_type is not None:
        new_value = body.value if body.value is not None else (float(offer.value) if offer.value is not None else None)
        _validate_offer(offer.offer_type, new_value, offer.starts_on, offer.ends_on)
        offer.value = (
            Decimal(str(new_value)) if new_value is not None and offer.offer_type != "two_for_one" else None
        )
    else:
        _validate_offer(offer.offer_type, float(offer.value) if offer.value is not None else None, offer.starts_on, offer.ends_on)
    if body.service_id is not None:
        # service_id explícito en el body — null se interpreta como "todos"
        if body.service_id:
            await _get_service(session, tenant_id, body.service_id)
        offer.service_id = body.service_id
    if body.is_published is not None:
        offer.is_published = body.is_published
    offer.updated_at = now_utc()
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    service_name = None
    if offer.service_id:
        names = await _service_names(session, tenant_id, {offer.service_id})
        service_name = names.get(offer.service_id)
    return _offer_to_read(offer, service_name)


@router.delete("/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(
    offer_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    offer = await _get_offer(session, tenant_id, offer_id)
    offer.is_active = False
    offer.is_published = False
    offer.updated_at = now_utc()
    session.add(offer)
    await session.commit()
