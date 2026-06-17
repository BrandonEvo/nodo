# Tablas: MÓDULO CITAS (agenda pública con confirmación de reservas)
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional
from sqlalchemy import Column, Numeric
from sqlmodel import Field
from .mixins import AuditBase


class BookingSettings(AuditBase, table=True):
    __tablename__ = "booking_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", unique=True, index=True)

    # Token público de la agenda — el link /agenda/{token} que comparte la empresa
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    is_open: bool = Field(default=True)

    # manual: la cita nace 'pendiente' y el dueño confirma | auto: nace 'confirmada'
    confirmation_mode: str = Field(default="manual", max_length=10)
    slot_granularity_minutes: int = Field(default=30)

    # Ventana de reserva: ni demasiado encima (min_notice) ni demasiado lejos (max_days)
    min_notice_hours: int = Field(default=2)
    max_days_ahead: int = Field(default=30)

    # Las citas se guardan en hora local del negocio — la TZ define "ahora" y "hoy"
    timezone: str = Field(default="America/Guatemala", max_length=50)


class BookingService(AuditBase, table=True):
    __tablename__ = "booking_services"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    name: str = Field(max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    price: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))

    # La duración define cuántos slots de la rejilla ocupa la cita
    duration_minutes: int = Field(default=30)
    is_published: bool = Field(default=True)


class BookingHour(AuditBase, table=True):
    __tablename__ = "booking_hours"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # Plantilla semanal: varias filas por día = horario partido; sin filas = cerrado
    weekday: int = Field(ge=0, le=6)  # 0=lunes ... 6=domingo
    start_time: time
    end_time: time


class BookingException(AuditBase, table=True):
    __tablename__ = "booking_exceptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # Una fila por fecha: feriado (is_closed) u horario especial que
    # reemplaza la plantilla semanal ese día (is_closed=False + rango)
    date: date
    is_closed: bool = Field(default=True)
    start_time: Optional[time] = Field(default=None)
    end_time: Optional[time] = Field(default=None)
    note: Optional[str] = Field(default=None, max_length=200)


class BookingAppointment(AuditBase, table=True):
    __tablename__ = "booking_appointments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    # Token público del cliente — el link /cita/{token} es su comprobante
    public_token: uuid.UUID = Field(default_factory=uuid.uuid4, unique=True, index=True)
    short_code: str = Field(max_length=8, index=True)

    customer_name: str = Field(max_length=150)
    customer_phone: str = Field(max_length=30, index=True)
    customer_note: Optional[str] = Field(default=None, max_length=300)

    # Snapshot del servicio — el catálogo puede cambiar después
    service_id: uuid.UUID = Field(foreign_key="booking_services.id", index=True)
    service_name: str = Field(max_length=150)
    service_price: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 2), nullable=False))
    duration_minutes: int = Field(default=30)

    # Hora local del negocio (naive) — ends_at = starts_at + duración
    starts_at: datetime = Field(index=True)
    ends_at: datetime

    # pendiente | confirmada | rechazada | cancelada | completada | no_asistio
    status: str = Field(default="pendiente", max_length=20, index=True)
    confirmed_at: Optional[datetime] = Field(default=None)
    cancelled_at: Optional[datetime] = Field(default=None)
    cancelled_by: Optional[str] = Field(default=None, max_length=10)  # cliente | negocio


class BookingOffer(AuditBase, table=True):
    __tablename__ = "booking_offers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    title: str = Field(max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)

    # percent → value es el % de descuento | fixed → value es el precio rebajado
    # two_for_one → value es null (2x1, no necesita monto)
    offer_type: str = Field(max_length=12)
    value: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))

    # null = aplica a todos los servicios; si no, solo a ese servicio
    service_id: Optional[uuid.UUID] = Field(default=None, foreign_key="booking_services.id", index=True)

    # Vigencia inclusiva en hora local del negocio
    starts_on: date
    ends_on: date

    is_published: bool = Field(default=True)
