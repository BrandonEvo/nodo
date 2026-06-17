"""
ENDPOINTS PÚBLICOS: Agenda y citas por token — sin autenticación
- GET  /api/booking/agenda/{public_token}                → Servicios + branding del negocio
- GET  /api/booking/agenda/{public_token}/offers         → Ofertas vigentes (gancho público)
- GET  /api/booking/agenda/{public_token}/days           → Tira de días con disponibilidad
- GET  /api/booking/agenda/{public_token}/slots          → Horarios libres de un día
- POST /api/booking/agenda/{public_token}/appointments   → Reservar cita
- GET  /api/booking/appointments/{appointment_token}     → Estado de la cita (comprobante)
- POST /api/booking/appointments/{appointment_token}/cancel → Cliente cancela

Seguridad (mismo patrón que store_public.py):
  - Rate limit propio por endpoint — más estricto que el global 100/min
  - Tokens UUID v4: 2^122 posibilidades — brute-force imposible
  - Solo campos seguros: sin tenant_id ni teléfonos de terceros; branding del
    negocio sí se expone a propósito (identidad pública)
  - Anti-abuso sin fricción: máx. 2 citas activas futuras por teléfono
"""
import logging
import re
import uuid
from datetime import date as date_type, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field as PField
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from core.limiter import limiter
from api.services.push_service import send_push_to_tenant
from api.services.booking_service import (
    BLOCKING_STATUSES, compute_days_overview, compute_slots, generate_short_code,
    now_local, now_utc,
)
from models.citas import BookingAppointment, BookingOffer, BookingService, BookingSettings
from models.tenants import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Agenda Pública"])

MAX_ACTIVE_PER_PHONE = 2


class PublicServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int


class PublicAgendaRead(BaseModel):
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None
    is_open: bool
    confirmation_mode: str
    max_days_ahead: int
    services: List[PublicServiceRead]


class PublicOfferRead(BaseModel):
    title: str
    description: Optional[str] = None
    offer_type: str          # percent | two_for_one | fixed
    value: Optional[float] = None
    service_id: Optional[uuid.UUID] = None
    service_name: Optional[str] = None
    starts_on: date_type
    ends_on: date_type


class PublicDayRead(BaseModel):
    date: date_type
    has_slots: bool


class PublicDaysRead(BaseModel):
    days: List[PublicDayRead]
    next_available: Optional[datetime] = None


class PublicSlotsRead(BaseModel):
    date: date_type
    slots: List[datetime]


class PublicAppointmentCreate(BaseModel):
    service_id: uuid.UUID
    starts_at: datetime
    customer_name: str = PField(min_length=2, max_length=150)
    customer_phone: str = PField(min_length=6, max_length=30)
    customer_note: Optional[str] = PField(default=None, max_length=300)


class PublicAppointmentCreated(BaseModel):
    appointment_token: uuid.UUID
    short_code: str
    status: str
    starts_at: datetime


class PublicAppointmentRead(BaseModel):
    short_code: str
    status: str
    service_name: str
    service_price: float
    duration_minutes: int
    starts_at: datetime
    customer_name: str
    business_name: Optional[str] = None
    business_logo_url: Optional[str] = None
    business_color: Optional[str] = None


def _security_headers(response: Response, max_age: int = 0) -> None:
    if max_age > 0:
        response.headers["Cache-Control"] = f"public, max-age={max_age}, s-maxage={max_age}"
    else:
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


def _normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    return cleaned if cleaned.startswith("+") else cleaned.lstrip("+")


def _phone_suffix(phone: str) -> str:
    """'+502 5555-1234' y '55551234' son el mismo cliente — se compara
    por los últimos 8 dígitos para que el código de país no los separe."""
    return re.sub(r"\D", "", phone)[-8:]


async def _get_settings_by_token(session: AsyncSession, public_token: uuid.UUID) -> BookingSettings:
    settings = (
        await session.execute(
            select(BookingSettings).where(
                BookingSettings.public_token == public_token,
                BookingSettings.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Agenda no encontrada")
    return settings


async def _get_tenant(session: AsyncSession, tenant_id: uuid.UUID) -> Optional[Tenant]:
    return (
        await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()


async def _get_published_service(
    session: AsyncSession, tenant_id: uuid.UUID, service_id: uuid.UUID
) -> BookingService:
    service = (
        await session.execute(
            select(BookingService).where(
                BookingService.id == service_id,
                BookingService.tenant_id == tenant_id,
                BookingService.is_active == True,  # noqa: E712
                BookingService.is_published == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return service


def _validate_target_date(settings: BookingSettings, target: date_type) -> None:
    today = now_local(settings).date()
    if not today <= target <= today + timedelta(days=settings.max_days_ahead):
        raise HTTPException(status_code=422, detail="Fecha fuera de la ventana de reserva")


@router.get("/agenda/{public_token}", response_model=PublicAgendaRead)
@limiter.limit("20/minute")
async def get_public_agenda(
    public_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    tenant = await _get_tenant(session, settings.tenant_id)

    result = await session.execute(
        select(BookingService).where(
            BookingService.tenant_id == settings.tenant_id,
            BookingService.is_active == True,  # noqa: E712
            BookingService.is_published == True,  # noqa: E712
        ).order_by(BookingService.name)
    )
    services = result.scalars().all()

    _security_headers(response, max_age=30)
    return PublicAgendaRead(
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
        is_open=settings.is_open,
        confirmation_mode=settings.confirmation_mode,
        max_days_ahead=settings.max_days_ahead,
        services=[
            PublicServiceRead(
                id=s.id,
                name=s.name,
                description=s.description,
                price=float(s.price),
                duration_minutes=s.duration_minutes,
            )
            for s in services
        ],
    )


@router.get("/agenda/{public_token}/offers", response_model=List[PublicOfferRead])
@limiter.limit("20/minute")
async def get_public_offers(
    public_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    today = now_local(settings).date()

    offers = (
        await session.execute(
            select(BookingOffer).where(
                BookingOffer.tenant_id == settings.tenant_id,
                BookingOffer.is_active == True,  # noqa: E712
                BookingOffer.is_published == True,  # noqa: E712
                BookingOffer.starts_on <= today,
                BookingOffer.ends_on >= today,
            ).order_by(BookingOffer.ends_on)
        )
    ).scalars().all()

    service_ids = {o.service_id for o in offers if o.service_id}
    names: dict = {}
    if service_ids:
        rows = (
            await session.execute(
                select(BookingService.id, BookingService.name).where(
                    BookingService.tenant_id == settings.tenant_id,
                    BookingService.id.in_(service_ids),
                    BookingService.is_active == True,  # noqa: E712
                    BookingService.is_published == True,  # noqa: E712
                )
            )
        ).all()
        names = {r[0]: r[1] for r in rows}

    _security_headers(response, max_age=30)
    # Solo campos mínimos seguros: nunca tenant_id ni IDs internos sensibles
    return [
        PublicOfferRead(
            title=o.title,
            description=o.description,
            offer_type=o.offer_type,
            value=float(o.value) if o.value is not None else None,
            service_id=o.service_id if (o.service_id and o.service_id in names) else None,
            service_name=names.get(o.service_id) if o.service_id else None,
            starts_on=o.starts_on,
            ends_on=o.ends_on,
        )
        for o in offers
    ]


@router.get("/agenda/{public_token}/days", response_model=PublicDaysRead)
@limiter.limit("20/minute")
async def get_public_days(
    public_token: uuid.UUID,
    request: Request,
    response: Response,
    service_id: uuid.UUID = Query(...),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    service = await _get_published_service(session, settings.tenant_id, service_id)

    days, next_available = await compute_days_overview(session, settings, service.duration_minutes)
    _security_headers(response, max_age=10)
    return PublicDaysRead(
        days=[PublicDayRead(**d) for d in days],
        next_available=next_available,
    )


@router.get("/agenda/{public_token}/slots", response_model=PublicSlotsRead)
@limiter.limit("30/minute")
async def get_public_slots(
    public_token: uuid.UUID,
    request: Request,
    response: Response,
    service_id: uuid.UUID = Query(...),
    date: date_type = Query(...),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    service = await _get_published_service(session, settings.tenant_id, service_id)
    _validate_target_date(settings, date)

    slots = await compute_slots(session, settings, service.duration_minutes, date)
    _security_headers(response, max_age=10)
    return PublicSlotsRead(date=date, slots=slots)


@router.post("/agenda/{public_token}/appointments", response_model=PublicAppointmentCreated, status_code=201)
@limiter.limit("5/minute")
async def create_public_appointment(
    public_token: uuid.UUID,
    body: PublicAppointmentCreate,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_settings_by_token(session, public_token)
    if not settings.is_open:
        raise HTTPException(status_code=409, detail="La agenda no está aceptando reservas por ahora")
    service = await _get_published_service(session, settings.tenant_id, body.service_id)
    _validate_target_date(settings, body.starts_at.date())

    phone = _normalize_phone(body.customer_phone)
    if len(phone) < 6:
        raise HTTPException(status_code=422, detail="Teléfono inválido")

    active = (
        await session.execute(
            select(BookingAppointment.id).where(
                BookingAppointment.tenant_id == settings.tenant_id,
                BookingAppointment.customer_phone.like(f"%{_phone_suffix(phone)}"),
                BookingAppointment.status.in_(BLOCKING_STATUSES),
                BookingAppointment.starts_at >= now_local(settings),
            )
        )
    ).all()
    if len(active) >= MAX_ACTIVE_PER_PHONE:
        raise HTTPException(
            status_code=409,
            detail="Ya tienes citas activas con este negocio. Cancela una para reservar otra.",
        )

    # El lock de settings serializa reservas por tenant — dos clientes pidiendo
    # el mismo slot a la vez no pueden insertarse en paralelo
    await session.execute(
        select(BookingSettings).where(BookingSettings.id == settings.id).with_for_update()
    )
    slots = await compute_slots(session, settings, service.duration_minutes, body.starts_at.date())
    if body.starts_at not in slots:
        raise HTTPException(status_code=409, detail="Ese horario ya no está disponible")

    initial_status = "confirmada" if settings.confirmation_mode == "auto" else "pendiente"
    appointment = BookingAppointment(
        tenant_id=settings.tenant_id,
        short_code=await generate_short_code(session, settings.tenant_id),
        customer_name=body.customer_name.strip(),
        customer_phone=phone,
        customer_note=body.customer_note,
        service_id=service.id,
        service_name=service.name,
        service_price=service.price,
        duration_minutes=service.duration_minutes,
        starts_at=body.starts_at,
        ends_at=body.starts_at + timedelta(minutes=service.duration_minutes),
        status=initial_status,
        confirmed_at=now_utc() if initial_status == "confirmada" else None,
    )
    session.add(appointment)
    await session.commit()

    try:
        await send_push_to_tenant(
            session=session,
            tenant_id=settings.tenant_id,
            title=f"📅 Nueva cita {appointment.short_code}",
            body=f"{appointment.customer_name} — {service.name}, {appointment.starts_at.strftime('%d/%m %H:%M')}",
            data={"module": "citas"},
        )
    except Exception:
        logger.warning("push de cita nueva falló appointment=%s", appointment.id, exc_info=True)

    _security_headers(response)
    return PublicAppointmentCreated(
        appointment_token=appointment.public_token,
        short_code=appointment.short_code,
        status=appointment.status,
        starts_at=appointment.starts_at,
    )


async def _get_appointment_by_token(
    session: AsyncSession, appointment_token: uuid.UUID
) -> BookingAppointment:
    appointment = (
        await session.execute(
            select(BookingAppointment).where(
                BookingAppointment.public_token == appointment_token,
                BookingAppointment.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return appointment


async def _build_public_appointment_read(
    session: AsyncSession, appointment: BookingAppointment
) -> PublicAppointmentRead:
    tenant = await _get_tenant(session, appointment.tenant_id)
    return PublicAppointmentRead(
        short_code=appointment.short_code,
        status=appointment.status,
        service_name=appointment.service_name,
        service_price=float(appointment.service_price),
        duration_minutes=appointment.duration_minutes,
        starts_at=appointment.starts_at,
        customer_name=appointment.customer_name,
        business_name=tenant.name if tenant else None,
        business_logo_url=tenant.logo_url if tenant else None,
        business_color=tenant.theme_color if tenant else None,
    )


@router.get("/appointments/{appointment_token}", response_model=PublicAppointmentRead)
@limiter.limit("20/minute")
async def get_public_appointment(
    appointment_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment_by_token(session, appointment_token)
    _security_headers(response, max_age=10)
    return await _build_public_appointment_read(session, appointment)


@router.post("/appointments/{appointment_token}/cancel", response_model=PublicAppointmentRead)
@limiter.limit("5/minute")
async def cancel_public_appointment(
    appointment_token: uuid.UUID,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    appointment = await _get_appointment_by_token(session, appointment_token)
    if appointment.status not in BLOCKING_STATUSES:
        raise HTTPException(status_code=409, detail="La cita ya no está activa")

    appointment.status = "cancelada"
    appointment.cancelled_at = now_utc()
    appointment.cancelled_by = "cliente"
    appointment.updated_at = now_utc()
    session.add(appointment)
    await session.commit()

    try:
        await send_push_to_tenant(
            session=session,
            tenant_id=appointment.tenant_id,
            title=f"❌ Cita {appointment.short_code} cancelada",
            body=f"{appointment.customer_name} canceló — {appointment.service_name}, {appointment.starts_at.strftime('%d/%m %H:%M')}",
            data={"module": "citas"},
        )
    except Exception:
        logger.warning("push de cancelación falló appointment=%s", appointment.id, exc_info=True)

    _security_headers(response)
    return await _build_public_appointment_read(session, appointment)
