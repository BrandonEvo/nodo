"""
MÓDULO BILLING: suscripción del tenant (flujo de pago manual).

- GET    /api/billing/plans               → Catálogo de planes activos (vista tenant)
- GET    /api/billing/me                  → Estado de facturación/trial + solicitud pendiente
- POST   /api/billing/request             → Solicitar suscripción a un plan (owner/admin)
- DELETE /api/billing/request             → Cancelar la solicitud pendiente

Admin (superadmin):
- GET    /api/billing/requests            → Solicitudes (por estado, default pending)
- POST   /api/billing/requests/{id}/confirm → Activa el plan (pago confirmado)
- POST   /api/billing/requests/{id}/reject  → Rechaza la solicitud

Usa get_session con scoping manual por tenant_id: un tenant en 'locked' debe poder
entrar aquí justamente para pagar, así que NO pasa por get_current_tenant_id.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user, fastapi_users
from models import (
    User, Tenant, TenantMember, SubscriptionPlan, PlanModule, Subscription, BillingRequest,
)
from models.schemas import (
    BillingPlanRead, BillingMeRead, BillingRequestRead, BillingRequestCreate, AdminBillingRequestRead,
)
from core.trial import compute_access

router = APIRouter(tags=["Billing (Suscripción del tenant)"])
current_superuser = fastapi_users.current_user(active=True, superuser=True)

_MANAGER_ROLES = ("owner", "admin")


async def get_billing_member(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> TenantMember:
    """Membresía activa del usuario. Sin enforcement de trial (a propósito)."""
    result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.is_active == True,  # noqa: E712
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin membresía activa.")
    return membership


async def _request_to_read(session: AsyncSession, req: BillingRequest) -> BillingRequestRead:
    plan = await session.get(SubscriptionPlan, req.plan_id)
    return BillingRequestRead(
        id=req.id, plan_id=req.plan_id, plan_name=plan.name if plan else None,
        status=req.status, note=req.note, created_at=req.created_at,
    )


# ── TENANT ──────────────────────────────────────────────────────────────────
@router.get("/plans", response_model=List[BillingPlanRead])
async def list_plans(
    _member: TenantMember = Depends(get_billing_member),
    session: AsyncSession = Depends(get_session),
):
    plans = (await session.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active == True)  # noqa: E712
        .order_by(SubscriptionPlan.price)
    )).scalars().all()
    out: List[BillingPlanRead] = []
    for p in plans:
        mods = (await session.execute(
            select(PlanModule.module_id).where(PlanModule.plan_id == p.id)
        )).scalars().all()
        out.append(BillingPlanRead(
            id=p.id, name=p.name, price=p.price, currency=p.currency, module_ids=list(mods),
        ))
    return out


@router.get("/me", response_model=BillingMeRead)
async def billing_me(
    member: TenantMember = Depends(get_billing_member),
    session: AsyncSession = Depends(get_session),
):
    tenant = await session.get(Tenant, member.tenant_id)
    access = compute_access(tenant) if tenant else {}

    current_plan_name = None
    if tenant and tenant.plan_id:
        plan = await session.get(SubscriptionPlan, tenant.plan_id)
        current_plan_name = plan.name if plan else None

    req = (await session.execute(
        select(BillingRequest)
        .where(BillingRequest.tenant_id == member.tenant_id, BillingRequest.status == "pending")
        .order_by(BillingRequest.created_at.desc())
    )).scalars().first()

    return BillingMeRead(
        billing_status=access.get("billing_status"),
        access_state=access.get("access_state"),
        trial_ends_at=access.get("trial_ends_at"),
        trial_days_remaining=access.get("trial_days_remaining"),
        grace_days_remaining=access.get("grace_days_remaining"),
        current_plan_id=tenant.plan_id if tenant else None,
        current_plan_name=current_plan_name,
        pending_request=await _request_to_read(session, req) if req else None,
    )


@router.post("/request", response_model=BillingRequestRead, status_code=status.HTTP_201_CREATED)
async def request_subscription(
    body: BillingRequestCreate,
    member: TenantMember = Depends(get_billing_member),
    session: AsyncSession = Depends(get_session),
):
    if member.member_type not in _MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Solo el propietario o un administrador puede gestionar la suscripción.")

    plan = await session.get(SubscriptionPlan, body.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(status_code=404, detail="Plan no disponible.")

    # Reemplaza cualquier solicitud pendiente previa (una activa por tenant)
    pending = (await session.execute(
        select(BillingRequest).where(
            BillingRequest.tenant_id == member.tenant_id, BillingRequest.status == "pending",
        )
    )).scalars().all()
    for p in pending:
        p.status = "cancelled"
        session.add(p)

    req = BillingRequest(
        tenant_id=member.tenant_id, plan_id=body.plan_id,
        note=body.note, created_by=member.user_id, status="pending",
    )
    session.add(req)
    await session.commit()
    await session.refresh(req)
    return await _request_to_read(session, req)


@router.delete("/request", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_request(
    member: TenantMember = Depends(get_billing_member),
    session: AsyncSession = Depends(get_session),
):
    if member.member_type not in _MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Solo el propietario o un administrador puede gestionar la suscripción.")
    pending = (await session.execute(
        select(BillingRequest).where(
            BillingRequest.tenant_id == member.tenant_id, BillingRequest.status == "pending",
        )
    )).scalars().all()
    for p in pending:
        p.status = "cancelled"
        session.add(p)
    await session.commit()


# ── ADMIN (superadmin) ──────────────────────────────────────────────────────
@router.get("/requests", response_model=List[AdminBillingRequestRead])
async def list_requests(
    status_filter: str = "pending",
    session: AsyncSession = Depends(get_session),
    _user=Depends(current_superuser),
):
    reqs = (await session.execute(
        select(BillingRequest)
        .where(BillingRequest.status == status_filter)
        .order_by(BillingRequest.created_at.desc())
    )).scalars().all()
    out: List[AdminBillingRequestRead] = []
    for r in reqs:
        tenant = await session.get(Tenant, r.tenant_id)
        plan = await session.get(SubscriptionPlan, r.plan_id)
        out.append(AdminBillingRequestRead(
            id=r.id, tenant_id=r.tenant_id, tenant_name=tenant.name if tenant else None,
            plan_id=r.plan_id, plan_name=plan.name if plan else None,
            status=r.status, note=r.note, created_at=r.created_at,
        ))
    return out


@router.post("/requests/{request_id}/confirm")
async def confirm_request(
    request_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _user=Depends(current_superuser),
):
    req = await session.get(BillingRequest, request_id)
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o ya procesada.")
    tenant = await session.get(Tenant, req.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    # Materializa el plan (mismo modelo que assign_tenant_plan) y marca activo (pagado).
    module_ids = (await session.execute(
        select(PlanModule.module_id).where(PlanModule.plan_id == req.plan_id)
    )).scalars().all()
    await session.execute(sa_delete(Subscription).where(Subscription.tenant_id == req.tenant_id))
    for mid in module_ids:
        session.add(Subscription(tenant_id=req.tenant_id, module_id=mid, status="active"))

    tenant.plan_id = req.plan_id
    tenant.billing_status = "active"
    session.add(tenant)
    req.status = "confirmed"
    session.add(req)
    await session.commit()
    return {"detail": "Suscripción activada.", "modules_activated": len(module_ids)}


@router.post("/requests/{request_id}/reject")
async def reject_request(
    request_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _user=Depends(current_superuser),
):
    req = await session.get(BillingRequest, request_id)
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o ya procesada.")
    req.status = "rejected"
    session.add(req)
    await session.commit()
    return {"detail": "Solicitud rechazada."}
