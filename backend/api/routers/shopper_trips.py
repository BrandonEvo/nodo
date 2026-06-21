"""
MÓDULO: SHOPPER TRIPS (Modo Viaje de Compras)
- GET    /api/shopper-trips/              → Listar viajes del tenant
- GET    /api/shopper-trips/active        → Viaje activo actual (o 404)
- POST   /api/shopper-trips/              → Iniciar viaje
- PATCH  /api/shopper-trips/{id}          → Actualizar / terminar viaje
- DELETE /api/shopper-trips/{id}          → Soft-delete
- GET    /api/shopper-trips/{id}/items    → Listar ítems de un viaje
- POST   /api/shopper-trips/{id}/items    → Agregar ítem al viaje
- PATCH  /api/shopper-trips/items/{item_id} → Actualizar ítem
- DELETE /api/shopper-trips/items/{item_id} → Soft-delete ítem
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.bakery import ShopperTrip, ShopperTripItem
from models.schemas import (
    ShopperTripCreate, ShopperTripUpdate, ShopperTripRead,
    ShopperTripItemCreate, ShopperTripItemUpdate, ShopperTripItemRead,
)

router = APIRouter(tags=["Shopper Trips"])


def _trip_to_read(t: ShopperTrip) -> ShopperTripRead:
    return ShopperTripRead(
        id=t.id,
        tenant_id=t.tenant_id,
        store_name=t.store_name,
        notes=t.notes,
        started_at=t.started_at,
        ended_at=t.ended_at,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _item_to_read(i: ShopperTripItem) -> ShopperTripItemRead:
    return ShopperTripItemRead(
        id=i.id,
        tenant_id=i.tenant_id,
        trip_id=i.trip_id,
        title=i.title,
        description=i.description,
        price_gtq=float(i.price_gtq) if i.price_gtq is not None else None,
        stock=i.stock,
        notes=i.notes,
        is_active=i.is_active,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Viajes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ShopperTripRead])
async def list_trips(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTrip)
        .where(ShopperTrip.tenant_id == tenant_id, ShopperTrip.is_active == True)
        .order_by(ShopperTrip.started_at.desc())
    )
    return [_trip_to_read(t) for t in result.scalars().all()]


@router.get("/active", response_model=ShopperTripRead)
async def get_active_trip(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTrip).where(
            ShopperTrip.tenant_id == tenant_id,
            ShopperTrip.is_active == True,
            ShopperTrip.ended_at == None,  # noqa: E711
        ).order_by(ShopperTrip.started_at.desc())
    )
    trip = result.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="No hay viaje activo.")
    return _trip_to_read(trip)


@router.post("/", response_model=ShopperTripRead, status_code=status.HTTP_201_CREATED)
async def start_trip(
    body: ShopperTripCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # Terminar cualquier viaje activo previo automáticamente
    result = await session.execute(
        select(ShopperTrip).where(
            ShopperTrip.tenant_id == tenant_id,
            ShopperTrip.is_active == True,
            ShopperTrip.ended_at == None,  # noqa: E711
        )
    )
    for prev in result.scalars().all():
        prev.ended_at = _now()
        prev.updated_at = _now()
        session.add(prev)

    trip = ShopperTrip(
        tenant_id=tenant_id,
        store_name=body.store_name.strip(),
        notes=body.notes,
        started_at=_now(),
    )
    session.add(trip)
    await session.commit()
    await session.refresh(trip)
    return _trip_to_read(trip)


@router.patch("/{trip_id}", response_model=ShopperTripRead)
async def update_trip(
    trip_id: uuid.UUID,
    body: ShopperTripUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTrip).where(
            ShopperTrip.id == trip_id,
            ShopperTrip.tenant_id == tenant_id,
            ShopperTrip.is_active == True,
        )
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Viaje no encontrado.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)
    trip.updated_at = _now()
    session.add(trip)
    await session.commit()
    await session.refresh(trip)
    return _trip_to_read(trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTrip).where(
            ShopperTrip.id == trip_id,
            ShopperTrip.tenant_id == tenant_id,
            ShopperTrip.is_active == True,
        )
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Viaje no encontrado.")
    trip.is_active = False
    trip.updated_at = _now()
    session.add(trip)
    await session.commit()


# ── Ítems del viaje ───────────────────────────────────────────────────────────

@router.get("/{trip_id}/items", response_model=list[ShopperTripItemRead])
async def list_trip_items(
    trip_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTripItem).where(
            ShopperTripItem.trip_id == trip_id,
            ShopperTripItem.tenant_id == tenant_id,
            ShopperTripItem.is_active == True,
        ).order_by(ShopperTripItem.created_at.desc())
    )
    return [_item_to_read(i) for i in result.scalars().all()]


@router.post("/{trip_id}/items", response_model=ShopperTripItemRead, status_code=status.HTTP_201_CREATED)
async def add_trip_item(
    trip_id: uuid.UUID,
    body: ShopperTripItemCreate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    # Verificar que el viaje pertenece al tenant
    result = await session.execute(
        select(ShopperTrip).where(
            ShopperTrip.id == trip_id,
            ShopperTrip.tenant_id == tenant_id,
            ShopperTrip.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Viaje no encontrado.")

    item = ShopperTripItem(
        tenant_id=tenant_id,
        trip_id=trip_id,
        title=body.title.strip(),
        description=body.description,
        price_gtq=Decimal(str(body.price_gtq)) if body.price_gtq is not None else None,
        stock=max(1, body.stock),
        notes=body.notes,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_to_read(item)


@router.patch("/items/{item_id}", response_model=ShopperTripItemRead)
async def update_trip_item(
    item_id: uuid.UUID,
    body: ShopperTripItemUpdate,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTripItem).where(
            ShopperTripItem.id == item_id,
            ShopperTripItem.tenant_id == tenant_id,
            ShopperTripItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "price_gtq" and value is not None:
            setattr(item, field, Decimal(str(value)))
        else:
            setattr(item, field, value)
    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _item_to_read(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip_item(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ShopperTripItem).where(
            ShopperTripItem.id == item_id,
            ShopperTripItem.tenant_id == tenant_id,
            ShopperTripItem.is_active == True,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    item.is_active = False
    item.updated_at = _now()
    session.add(item)
    await session.commit()
