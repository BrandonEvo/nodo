"""
GET   /api/onboarding/plans   — Planes activos disponibles (público, rate limited).
PATCH /api/onboarding/complete — Completa el onboarding con el plan elegido.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sa_delete
from sqlmodel import select
from pydantic import BaseModel
import uuid
from typing import Optional

from db.session import get_session
from api.deps import current_active_user
from models import User, Tenant, TenantMember
from models.core import Module
from models.tenants import Subscription, SubscriptionPlan, PlanModule
from core.limiter import limiter

router = APIRouter(tags=["Onboarding"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class PlanModuleOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    icon: Optional[str] = None

class PlanPublicOut(BaseModel):
    id: uuid.UUID
    name: str
    price: float
    currency: str
    modules: list[PlanModuleOut]

class PlanSelectBody(BaseModel):
    plan_id: uuid.UUID
    company_name: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanPublicOut])
@limiter.limit("60/minute")
async def list_public_plans(request: Request, session: AsyncSession = Depends(get_session)):
    """Planes activos disponibles para elegir durante el onboarding. Sin autenticación."""
    plans_result = await session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True)
    )
    plans = plans_result.scalars().all()

    out = []
    for plan in plans:
        pm_result = await session.execute(
            select(PlanModule).where(PlanModule.plan_id == plan.id)
        )
        module_ids = [pm.module_id for pm in pm_result.scalars().all()]

        mods = []
        if module_ids:
            mods_result = await session.execute(
                select(Module).where(Module.id.in_(module_ids), Module.is_active == True)
            )
            mods = mods_result.scalars().all()

        out.append(PlanPublicOut(
            id=plan.id,
            name=plan.name,
            price=plan.price,
            currency=plan.currency,
            modules=[PlanModuleOut(id=m.id, name=m.name, code=m.code, icon=m.icon) for m in mods],
        ))

    return out


@router.patch("/complete")
async def complete_onboarding(
    body: PlanSelectBody,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Finaliza el onboarding con el plan elegido:
    1. Resuelve o crea el tenant.
    2. Activa los módulos del plan en la tabla subscriptions.
    3. Asigna plan_id y billing_status='active' al tenant.
    4. Marca onboarding_completed=True en el usuario.
    """
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="El onboarding ya fue completado.")

    plan = await session.get(SubscriptionPlan, body.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(status_code=404, detail="Plan no encontrado o inactivo.")

    # Resolver o crear tenant
    mem_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.is_active == True,
        )
    )
    membership = mem_result.scalars().first()

    if membership:
        tenant = await session.get(Tenant, membership.tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado.")
        if body.company_name and body.company_name.strip():
            tenant.name = body.company_name.strip()
    else:
        # Google OAuth orgánico sin workspace previo
        name = (body.company_name or "").strip() or f"Empresa de {current_user.email}"
        tenant = Tenant(name=name, is_active=True)
        session.add(tenant)
        await session.flush()
        membership = TenantMember(
            user_id=current_user.id,
            tenant_id=tenant.id,
            member_type="owner",
        )
        session.add(membership)
        await session.flush()

    # Módulos del plan
    pm_result = await session.execute(
        select(PlanModule).where(PlanModule.plan_id == plan.id)
    )
    module_ids = [pm.module_id for pm in pm_result.scalars().all()]

    # Reemplazar suscripciones previas
    await session.execute(sa_delete(Subscription).where(Subscription.tenant_id == tenant.id))
    for mid in module_ids:
        session.add(Subscription(tenant_id=tenant.id, module_id=mid, status="active"))

    tenant.plan_id = plan.id
    tenant.billing_status = "active"
    session.add(tenant)

    current_user.onboarding_completed = True
    session.add(current_user)

    await session.commit()

    return {
        "detail": "Onboarding completado.",
        "tenant_name": tenant.name,
        "onboarding_completed": True,
        "modules_activated": len(module_ids),
    }
