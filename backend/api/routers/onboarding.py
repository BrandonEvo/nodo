"""
GET   /api/onboarding/plans   — Planes activos disponibles (público, rate limited).
PATCH /api/onboarding/complete — Cierra el onboarding (nombre de empresa). No
                                 habilita módulos: eso lo hace un superadmin.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid
from typing import Optional

from db.session import get_session
from api.deps import current_active_user
from models import User, Tenant, TenantMember
from models.core import Module
from models.tenants import SubscriptionPlan, PlanModule
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
    company_name: Optional[str] = None
    # Informativo: qué plan le interesó. NO habilita nada — el acceso lo asigna
    # un superadmin desde el panel de tenants.
    plan_id: Optional[uuid.UUID] = None


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
    Cierra el onboarding:
    1. Resuelve o crea el tenant con el nombre de la empresa.
    2. Marca onboarding_completed=True en el usuario.

    Deliberadamente NO habilita módulos ni cambia billing_status: el acceso lo
    otorga un superadmin (PUT /tenants/{id}/plan o POST /tenants/{id}/grant-trial).
    Antes este endpoint activaba el plan que mandara el cliente, así que cualquier
    registro podía regalarse un plan de pago.
    """
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="El onboarding ya fue completado.")

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
        tenant = Tenant(name=name, is_active=True, billing_status="pending")
        session.add(tenant)
        await session.flush()
        membership = TenantMember(
            user_id=current_user.id,
            tenant_id=tenant.id,
            member_type="owner",
        )
        session.add(membership)
        await session.flush()

    session.add(tenant)

    current_user.onboarding_completed = True
    session.add(current_user)

    await session.commit()

    return {
        "detail": "Onboarding completado.",
        "tenant_name": tenant.name,
        "onboarding_completed": True,
        "access_state": "pending" if tenant.billing_status == "pending" else "active",
    }
