"""
GET  /api/auth/session        — Payload enriquecido M:N + onboarding + invitaciones.
POST /api/auth/switch-tenant  — Cambia el tenant activo del usuario.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from models import User, TenantMember, Tenant, Invitation
from models.schemas import SessionRead, PendingInvitationRead
from core.trial import compute_access

router = APIRouter(tags=["Auth: Session"])


async def _resolve_membership(user: User, session: AsyncSession) -> TenantMember | None:
    """
    Resuelve la membresía activa del usuario.
    Prioridad:
    1. last_active_tenant_id (si está seteado y la membresía sigue activa)
    2. Primera membresía activa (ordered by assigned_at asc — la más antigua = el workspace propio)
    """
    result = await session.execute(
        select(TenantMember)
        .where(TenantMember.user_id == user.id, TenantMember.is_active == True)
        .order_by(TenantMember.assigned_at.asc())
    )
    memberships = result.scalars().all()
    if not memberships:
        return None

    if user.last_active_tenant_id:
        for m in memberships:
            if m.tenant_id == user.last_active_tenant_id:
                return m

    return memberships[0]


@router.get("/session", response_model=SessionRead)
async def get_session_enriched(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    membership = await _resolve_membership(current_user, session)

    tenant_id = None
    tenant_name = None
    tenant_logo_url = None
    tenant_theme_color = None
    member_type = None
    is_tenant_admin = False
    available_tenants = []
    access: dict = {}

    if membership:
        tenant = await session.get(Tenant, membership.tenant_id)
        tenant_id          = membership.tenant_id
        tenant_name        = tenant.name if tenant else None
        tenant_logo_url    = tenant.logo_url if tenant else None
        tenant_theme_color = tenant.theme_color if tenant else None
        member_type        = membership.member_type
        is_tenant_admin    = membership.member_type in ("owner", "admin")
        if tenant:
            access = compute_access(tenant)

        # Lista de todos los tenants disponibles para el switcher
        all_mems_result = await session.execute(
            select(TenantMember)
            .where(TenantMember.user_id == current_user.id, TenantMember.is_active == True)
        )
        for m in all_mems_result.scalars().all():
            t = await session.get(Tenant, m.tenant_id)
            if t:
                available_tenants.append({
                    "tenant_id":   str(m.tenant_id),
                    "tenant_name": t.name,
                    "member_type": m.member_type,
                    "is_active":   m.tenant_id == tenant_id,
                })

    inv_result = await session.execute(
        select(Invitation).where(
            Invitation.email  == current_user.email,
            Invitation.status == "pending",
        )
    )
    pending_invitations = []
    for inv in inv_result.scalars().all():
        inv_tenant = await session.get(Tenant, inv.tenant_id)
        pending_invitations.append(PendingInvitationRead(
            id=inv.id,
            tenant_name=inv_tenant.name if inv_tenant else "Empresa desconocida",
            member_type=inv.member_type,
            email=inv.email,
        ))

    return SessionRead(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        picture=current_user.picture,
        is_superuser=current_user.is_superuser,
        is_verified=current_user.is_verified,
        onboarding_completed=current_user.onboarding_completed,
        is_google_user=current_user.google_id is not None,
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
        tenant_theme_color=tenant_theme_color,
        member_type=member_type,
        is_tenant_admin=is_tenant_admin or current_user.is_superuser,
        billing_status=access.get("billing_status"),
        access_state=access.get("access_state"),
        trial_ends_at=access.get("trial_ends_at"),
        trial_days_remaining=access.get("trial_days_remaining"),
        grace_days_remaining=access.get("grace_days_remaining"),
        has_pending_invites=len(pending_invitations) > 0,
        pending_invitations=pending_invitations,
        available_tenants=available_tenants,
    )


class SwitchTenantRequest(BaseModel):
    tenant_id: uuid.UUID


@router.post("/switch-tenant")
async def switch_tenant(
    body: SwitchTenantRequest,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Cambia el tenant activo del usuario (workspace switcher)."""
    mem_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id   == current_user.id,
            TenantMember.tenant_id == body.tenant_id,
            TenantMember.is_active == True,
        )
    )
    membership = mem_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="No tienes acceso a ese workspace.")

    current_user.last_active_tenant_id = body.tenant_id
    session.add(current_user)
    await session.commit()
    return {"ok": True}
