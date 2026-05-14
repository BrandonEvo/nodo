"""
GET /api/auth/session — Payload enriquecido con datos M:N, onboarding e invitaciones.
Reemplaza al básico /api/users/me para el flujo de frontend.
"""
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from models import User, TenantMember, Tenant, Invitation
from models.schemas import SessionRead, PendingInvitationRead

router = APIRouter(tags=["Auth: Session"])


@router.get("/session", response_model=SessionRead)
async def get_session_enriched(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Retorna el estado completo de sesión del usuario:
    - Datos de identidad (email, nombre, foto).
    - Datos M:N del tenant activo (tenant_id, tenant_name, member_type, is_tenant_admin).
    - Estado de onboarding (onboarding_completed).
    - Invitaciones pendientes (has_pending_invites + lista).
    """
    # 1. Resolver membresía M:N
    mem_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.is_active == True
        )
    )
    membership = mem_result.scalars().first()

    tenant_id = None
    tenant_name = None
    tenant_logo_url = None
    tenant_theme_color = None
    member_type = None
    is_tenant_admin = False

    if membership:
        tenant = await session.get(Tenant, membership.tenant_id)
        tenant_id = membership.tenant_id
        tenant_name = tenant.name if tenant else None
        tenant_logo_url = tenant.logo_url if tenant else None
        tenant_theme_color = tenant.theme_color if tenant else None
        member_type = membership.member_type
        is_tenant_admin = membership.member_type in ("owner", "admin")

    # 2. Buscar invitaciones pendientes
    inv_result = await session.execute(
        select(Invitation).where(
            Invitation.email == current_user.email,
            Invitation.status == "pending"
        )
    )
    pending_invitations_raw = inv_result.scalars().all()

    pending_invitations = []
    for inv in pending_invitations_raw:
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
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
        tenant_theme_color=tenant_theme_color,
        member_type=member_type,
        is_tenant_admin=is_tenant_admin or current_user.is_superuser,
        has_pending_invites=len(pending_invitations) > 0,
        pending_invitations=pending_invitations,
    )
