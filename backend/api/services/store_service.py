"""
Lógica compartida del módulo Ventas: reservas, expiración lazy y códigos cortos.

No hay scheduler en el backend — la expiración de reservas es lazy:
`expire_stale_orders` se ejecuta al inicio de los endpoints que leen o
crean pedidos, así el stock apartado se libera solo sin proceso de fondo.
"""
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.store import StoreOrder, StoreOrderItem, StoreProduct

# Sin caracteres ambiguos (0/O, 1/I/L) — el cliente lo dicta en voz alta en el local
SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def generate_short_code(session: AsyncSession, tenant_id: uuid.UUID) -> str:
    for _ in range(10):
        code = "".join(random.choices(SHORT_CODE_ALPHABET, k=4))
        exists = await session.execute(
            select(StoreOrder.id).where(
                StoreOrder.tenant_id == tenant_id,
                StoreOrder.short_code == code,
                StoreOrder.status.in_(("solicitado", "apartado")),
            )
        )
        if not exists.first():
            return code
    return "".join(random.choices(SHORT_CODE_ALPHABET, k=6))


async def release_reservation(session: AsyncSession, order: StoreOrder) -> None:
    items = (
        await session.execute(
            select(StoreOrderItem).where(StoreOrderItem.order_id == order.id)
        )
    ).scalars().all()
    for item in items:
        product = await session.get(StoreProduct, item.product_id)
        if product:
            product.reserved_qty = max(0, product.reserved_qty - item.qty)
            session.add(product)


async def expire_stale_orders(session: AsyncSession, tenant_id: uuid.UUID) -> None:
    stale = (
        await session.execute(
            select(StoreOrder).where(
                StoreOrder.tenant_id == tenant_id,
                StoreOrder.status == "solicitado",
                StoreOrder.expires_at != None,  # noqa: E711
                StoreOrder.expires_at < now_utc(),
            )
        )
    ).scalars().all()
    if not stale:
        return
    for order in stale:
        order.status = "expirado"
        order.updated_at = now_utc()
        session.add(order)
        await release_reservation(session, order)
    await session.commit()
