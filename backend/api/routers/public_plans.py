"""
ENDPOINT PÚBLICO: catálogo de planes para la landing — sin autenticación.
- GET /api/public/plans → Planes activos y publicados, con su copy de marketing

Seguridad:
  - Rate limit propio (30/min), más estricto que el global 100/min
  - `subscription_plans` es catálogo global (sin tenant_id): no hay nada que
    aislar entre empresas. Aun así solo se serializan campos de marketing —
    nunca `created_by`, ni conteos de suscriptores, ni ids de módulos.
  - Solo planes con is_active AND is_public: un plan puede existir para cobrar
    y no anunciarse.
  - Cache-Control de 5 min: Cloudflare absorbe el cold start del backend en la
    página más crítica para conversión.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from core.limiter import limiter
from models import Module, PlanModule, SubscriptionPlan

router = APIRouter(tags=["Planes Públicos"])

_CACHE_SECONDS = 300


class PublicPlanRead(BaseModel):
    id: uuid.UUID
    name: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    price: float
    currency: str
    billing_period: str
    features: List[str] = []
    badge_label: Optional[str] = None
    cta_label: Optional[str] = None
    is_featured: bool = False
    module_names: List[str] = []


def _security_headers(response: Response, max_age: int = 0) -> None:
    if max_age > 0:
        response.headers["Cache-Control"] = f"public, max-age={max_age}, s-maxage={max_age}"
    else:
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


@router.get("/plans", response_model=List[PublicPlanRead])
@limiter.limit("30/minute")
async def list_public_plans(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    _security_headers(response, max_age=_CACHE_SECONDS)

    plans = (
        await session.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.is_active == True)  # noqa: E712
            .where(SubscriptionPlan.is_public == True)  # noqa: E712
            .order_by(SubscriptionPlan.sort_order, SubscriptionPlan.price)
        )
    ).scalars().all()

    if not plans:
        return []

    rows = (
        await session.execute(
            select(PlanModule.plan_id, Module.name)
            .join(Module, Module.id == PlanModule.module_id)
            .where(PlanModule.plan_id.in_([p.id for p in plans]))
        )
    ).all()

    modules_by_plan: dict[uuid.UUID, List[str]] = {}
    for plan_id, module_name in rows:
        modules_by_plan.setdefault(plan_id, []).append(module_name)

    return [
        PublicPlanRead(
            id=plan.id,
            name=plan.name,
            tagline=plan.tagline,
            description=plan.description,
            price=plan.price,
            currency=plan.currency,
            billing_period=plan.billing_period,
            features=plan.features or [],
            badge_label=plan.badge_label,
            cta_label=plan.cta_label,
            is_featured=plan.is_featured,
            module_names=sorted(modules_by_plan.get(plan.id, [])),
        )
        for plan in plans
    ]
