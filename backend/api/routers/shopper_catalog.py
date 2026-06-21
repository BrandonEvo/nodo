"""
MÓDULO: SHOPPER CATALOG
Autenticado:
  GET    /api/shopper-catalog/settings                      → Leer/crear ajustes
  PATCH  /api/shopper-catalog/settings                      → Actualizar nombre, whatsapp
  GET    /api/shopper-catalog/                              → Listar ítems
  POST   /api/shopper-catalog/                              → Crear ítem manual
  POST   /api/shopper-catalog/from-trip/{item_id}           → Publicar desde trip item
  PATCH  /api/shopper-catalog/{id}                          → Actualizar ítem
  DELETE /api/shopper-catalog/{id}                          → Soft-delete
  GET    /api/shopper-catalog/reservations                  → Listar reservas del tenant
  PATCH  /api/shopper-catalog/reservations/{id}             → Actualizar estado de reserva

Público (sin auth):
  GET    /api/shopper-catalog/public/{token}                → Catálogo visible al cliente
  POST   /api/shopper-catalog/public/{token}/reserve/{iid} → Crear reserva
  GET    /api/shopper-catalog/public/reservation/{ctok}    → Vista del cliente de su reserva
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from core.limiter import limiter
from models.bakery import ShopperCatalogSettings, ShopperCatalogItem, ShopperTripItem, ShopperReservation
from models.schemas import (
    ShopperCatalogSettingsRead, ShopperCatalogSettingsUpdate,
    ShopperCatalogItemCreate, ShopperCatalogItemUpdate, ShopperCatalogItemRead,
    PublicShopperCatalog, PublicShopperCatalogItem,
    ShopperReservationCreate, ShopperReservationUpdate, ShopperReservationRead,
    PublicReservationRead,
)
from models.tenants import Tenant

router = APIRouter(tags=["Shopper Catalog"])

RESERVATION_EXPIRY_HOURS = 2


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _item_read(i: ShopperCatalogItem) -> ShopperCatalogItemRead:
    available = max(0, i.stock_total - i.stock_reserved - i.stock_sold)
    return ShopperCatalogItemRead(
        id=i.id,
        tenant_id=i.tenant_id,
        source=i.source,
        trip_item_id=i.trip_item_id,
        title=i.title,
        description=i.description,
        price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        stock_total=i.stock_total,
        stock_sold=i.stock_sold,
        stock_available=available,
        is_published=i.is_published,
        published_at=i.published_at,
        amazon_url=i.amazon_url,
        image_url=i.image_url,
        notes=i.notes,
        is_active=i.is_active,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


async def _expire_pending_reservations(item: ShopperCatalogItem, session: AsyncSession) -> None:
    """Lazy expiry: cancel reservations past their expiry time and release stock_reserved."""
    now = _now()
    expired_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.catalog_item_id == item.id,
            ShopperReservation.status == "pendiente",
            ShopperReservation.expires_at <= now,
            ShopperReservation.is_active == True,
        )
    )
    expired = expired_result.scalars().all()
    if not expired:
        return
    total_released = sum(r.quantity for r in expired)
    for r in expired:
        r.status = "cancelada"
        r.updated_at = now
        session.add(r)
    item.stock_reserved = max(0, item.stock_reserved - total_released)
    item.updated_at = now
    session.add(item)
    await session.commit()


async def _get_or_create_settings(
    tenant_id: uuid.UUID, session: AsyncSession
) -> ShopperCatalogSettings:
    result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.tenant_id == tenant_id,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ShopperCatalogSettings(tenant_id=tenant_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=ShopperCatalogSettingsRead)
async def get_settings(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create_settings(tenant_id, session)


@router.patch("/settings", response_model=ShopperCatalogSettingsRead)
async def update_settings(
    body: ShopperCatalogSettingsUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    settings = await _get_or_create_settings(tenant_id, session)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    settings.updated_at = _now()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


# ── Catálogo autenticado ───────────────────────────────────────────────────────

@router.get("/", response_model=list[ShopperCatalogItemRead])
async def list_catalog(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        ).order_by(ShopperCatalogItem.created_at.desc())
    )
    return [_item_read(i) for i in result.scalars().all()]


@router.post("/", response_model=ShopperCatalogItemRead, status_code=status.HTTP_201_CREATED)
async def create_catalog_item(
    body: ShopperCatalogItemCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    item = ShopperCatalogItem(
        tenant_id=tenant_id,
        source=body.source,
        title=body.title.strip(),
        description=body.description,
        price_gtq=Decimal(str(body.price_gtq)) if body.price_gtq is not None else None,
        stock_total=max(1, body.stock_total),
        is_published=body.is_published,
        published_at=_now() if body.is_published else None,
        amazon_url=body.amazon_url,
        image_url=body.image_url,
        notes=body.notes,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.post("/from-trip/{trip_item_id}", response_model=ShopperCatalogItemRead,
             status_code=status.HTTP_201_CREATED)
async def publish_from_trip_item(
    trip_item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTripItem).where(
            ShopperTripItem.id == trip_item_id,
            ShopperTripItem.tenant_id == tenant_id,
            ShopperTripItem.is_active == True,
        )
    )
    trip_item = result.scalar_one_or_none()
    if not trip_item:
        raise HTTPException(status_code=404, detail="Ítem del viaje no encontrado.")

    dup = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.trip_item_id == trip_item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    existing = dup.scalar_one_or_none()
    if existing:
        return _item_read(existing)

    item = ShopperCatalogItem(
        tenant_id=tenant_id,
        source="trip",
        trip_item_id=trip_item_id,
        title=trip_item.title,
        description=trip_item.description,
        price_gtq=trip_item.price_gtq,
        stock_total=trip_item.stock,
        is_published=True,
        published_at=_now(),
        notes=trip_item.notes,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.patch("/{item_id}", response_model=ShopperCatalogItemRead)
async def update_catalog_item(
    item_id: uuid.UUID,
    body: ShopperCatalogItemUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    changes = body.model_dump(exclude_unset=True)
    was_published = item.is_published
    for field, value in changes.items():
        if field == "price_gtq" and value is not None:
            setattr(item, field, Decimal(str(value)))
        else:
            setattr(item, field, value)

    if changes.get("is_published") and not was_published:
        item.published_at = _now()
    elif changes.get("is_published") is False:
        item.published_at = None

    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_read(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_item(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == tenant_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    item.is_active = False
    item.updated_at = _now()
    session.add(item)
    await session.commit()


# ── Reservas — autenticado (vendor) ───────────────────────────────────────────

@router.get("/reservations", response_model=list[ShopperReservationRead])
async def list_reservations(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """Lista todas las reservas del tenant con el título del ítem desnormalizado."""
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).where(
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        ).order_by(ShopperReservation.created_at.desc())
    )
    rows = result.all()
    return [
        ShopperReservationRead(
            id=r.id,
            tenant_id=r.tenant_id,
            catalog_item_id=r.catalog_item_id,
            client_name=r.client_name,
            client_phone=r.client_phone,
            client_token=r.client_token,
            quantity=r.quantity,
            status=r.status,
            deposit_amount=float(r.deposit_amount) if r.deposit_amount is not None else None,
            payment_reference=r.payment_reference,
            notes=r.notes,
            expires_at=r.expires_at,
            confirmed_at=r.confirmed_at,
            completed_at=r.completed_at,
            is_active=r.is_active,
            created_at=r.created_at,
            updated_at=r.updated_at,
            item_title=i.title,
            item_price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        )
        for r, i in rows
    ]


@router.patch("/reservations/{reservation_id}", response_model=ShopperReservationRead)
async def update_reservation(
    reservation_id: uuid.UUID,
    body: ShopperReservationUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    """
    Vendor actualiza estado de reserva:
    - confirmada  → solo actualiza status (el stock_reserved ya estaba tomado)
    - completada  → mueve stock_reserved → stock_sold
    - cancelada   → libera stock_reserved
    """
    res_result = await session.execute(
        select(ShopperReservation).where(
            ShopperReservation.id == reservation_id,
            ShopperReservation.tenant_id == tenant_id,
            ShopperReservation.is_active == True,
        )
    )
    reservation = res_result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    item_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == reservation.catalog_item_id,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = item_result.scalar_one_or_none()

    now = _now()
    new_status = body.status

    if new_status and new_status != reservation.status:
        old_status = reservation.status
        reservation.status = new_status

        if new_status == "confirmada" and old_status == "pendiente":
            reservation.confirmed_at = now

        elif new_status == "completada":
            reservation.completed_at = now
            if item:
                item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
                item.stock_sold = item.stock_sold + reservation.quantity
                item.updated_at = now
                session.add(item)

        elif new_status == "cancelada":
            if item and old_status in ("pendiente", "confirmada"):
                item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
                item.updated_at = now
                session.add(item)

    if body.payment_reference is not None:
        reservation.payment_reference = body.payment_reference
    if body.notes is not None:
        reservation.notes = body.notes

    reservation.updated_at = now
    session.add(reservation)
    await session.commit()
    await session.refresh(reservation)

    # Desnormalizar título para el response
    item_title = item.title if item else None
    item_price = float(item.price_gtq) if item and item.price_gtq is not None else None

    return ShopperReservationRead(
        id=reservation.id,
        tenant_id=reservation.tenant_id,
        catalog_item_id=reservation.catalog_item_id,
        client_name=reservation.client_name,
        client_phone=reservation.client_phone,
        client_token=reservation.client_token,
        quantity=reservation.quantity,
        status=reservation.status,
        deposit_amount=float(reservation.deposit_amount) if reservation.deposit_amount is not None else None,
        payment_reference=reservation.payment_reference,
        notes=reservation.notes,
        expires_at=reservation.expires_at,
        confirmed_at=reservation.confirmed_at,
        completed_at=reservation.completed_at,
        is_active=reservation.is_active,
        created_at=reservation.created_at,
        updated_at=reservation.updated_at,
        item_title=item_title,
        item_price_gtq=item_price,
    )


# ── Endpoints públicos ─────────────────────────────────────────────────────────

@router.get("/public/{public_token}", response_model=PublicShopperCatalog)
@limiter.limit("60/minute")
async def get_public_catalog(
    request: Request,
    public_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    items_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        ).order_by(ShopperCatalogItem.published_at.desc())
    )
    items = items_result.scalars().all()

    return PublicShopperCatalog(
        business_name=settings.business_name,
        whatsapp_number=settings.whatsapp_number,
        items=[
            PublicShopperCatalogItem(
                id=i.id,
                title=i.title,
                description=i.description,
                price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
                stock_available=max(0, i.stock_total - i.stock_reserved - i.stock_sold),
                stock_total=i.stock_total,
                amazon_url=i.amazon_url,
                image_url=i.image_url,
            )
            for i in items
        ],
    )


@router.post(
    "/public/{public_token}/reserve/{item_id}",
    response_model=PublicReservationRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def create_reservation(
    request: Request,
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    body: ShopperReservationCreate,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint público — cliente crea una reserva con depósito simbólico."""
    # Validar nombre y teléfono
    if not body.client_name.strip() or not body.client_phone.strip():
        raise HTTPException(status_code=400, detail="Nombre y teléfono son requeridos.")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1.")

    # Verificar que el catálogo existe
    settings_result = await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == public_token,
            ShopperCatalogSettings.is_active == True,
        )
    )
    settings = settings_result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado.")

    # Obtener ítem
    item_result = await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.id == item_id,
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,
            ShopperCatalogItem.is_active == True,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    # Expirar reservas vencidas antes de calcular stock
    await _expire_pending_reservations(item, session)
    await session.refresh(item)

    available = item.stock_total - item.stock_reserved - item.stock_sold
    if available < body.quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Solo hay {max(0, available)} unidad(es) disponible(s).",
        )

    now = _now()
    reservation = ShopperReservation(
        tenant_id=settings.tenant_id,
        catalog_item_id=item_id,
        client_name=body.client_name.strip(),
        client_phone=body.client_phone.strip(),
        client_token=uuid.uuid4(),
        quantity=body.quantity,
        status="pendiente",
        deposit_amount=Decimal(str(body.deposit_amount)) if body.deposit_amount else None,
        notes=body.notes,
        expires_at=now + timedelta(hours=RESERVATION_EXPIRY_HOURS),
    )
    session.add(reservation)

    item.stock_reserved = item.stock_reserved + body.quantity
    item.updated_at = now
    session.add(item)

    await session.commit()
    await session.refresh(reservation)

    return PublicReservationRead(
        id=reservation.id,
        client_token=reservation.client_token,
        client_name=reservation.client_name,
        quantity=reservation.quantity,
        status=reservation.status,
        deposit_amount=float(reservation.deposit_amount) if reservation.deposit_amount is not None else None,
        expires_at=reservation.expires_at,
        item_title=item.title,
        item_price_gtq=float(item.price_gtq) if item.price_gtq is not None else None,
        whatsapp_number=settings.whatsapp_number,
        created_at=reservation.created_at,
    )


@router.get("/public/reservation/{client_token}", response_model=PublicReservationRead)
@limiter.limit("30/minute")
async def get_client_reservation(
    request: Request,
    client_token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint público — cliente ve el estado de su reserva."""
    result = await session.execute(
        select(ShopperReservation, ShopperCatalogItem, ShopperCatalogSettings).join(
            ShopperCatalogItem, ShopperReservation.catalog_item_id == ShopperCatalogItem.id
        ).join(
            ShopperCatalogSettings, ShopperCatalogSettings.tenant_id == ShopperReservation.tenant_id
        ).where(
            ShopperReservation.client_token == client_token,
            ShopperReservation.is_active == True,
            ShopperCatalogSettings.is_active == True,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    reservation, item, settings = row

    # Lazy expiry — si está pendiente y ya venció, marcarlo cancelado
    now = _now()
    if reservation.status == "pendiente" and reservation.expires_at <= now:
        reservation.status = "cancelada"
        reservation.updated_at = now
        session.add(reservation)
        item.stock_reserved = max(0, item.stock_reserved - reservation.quantity)
        item.updated_at = now
        session.add(item)
        await session.commit()

    return PublicReservationRead(
        id=reservation.id,
        client_token=reservation.client_token,
        client_name=reservation.client_name,
        quantity=reservation.quantity,
        status=reservation.status,
        deposit_amount=float(reservation.deposit_amount) if reservation.deposit_amount is not None else None,
        expires_at=reservation.expires_at,
        item_title=item.title,
        item_price_gtq=float(item.price_gtq) if item.price_gtq is not None else None,
        whatsapp_number=settings.whatsapp_number,
        created_at=reservation.created_at,
    )
