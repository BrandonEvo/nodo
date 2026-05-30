"""
Router de Invitaciones — CRUD completo para gestión de equipo.
- POST /           → Crear invitación (admin del tenant)
- GET /            → Listar invitaciones del tenant (admin)
- POST /{id}/respond → Aceptar/rechazar invitación (usuario invitado)
- PATCH /{id}/revoke → Revocar invitación pendiente (admin)
- POST /{id}/resend  → Reenviar invitación (admin)
"""
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from models import User, Tenant, TenantMember, Invitation
from models.platform_config import PlatformConfig
from models.schemas import InvitationCreate, InvitationRead, InvitationRespond, InvitationPreview

router = APIRouter(tags=["Invitations (Gestión de Equipo)"])


async def _get_admin_membership(user: User, session: AsyncSession) -> TenantMember:
    """Verifica que el usuario sea admin de algún tenant y retorna su membresía."""
    if user.is_superuser:
        mem = await session.execute(
            select(TenantMember).where(TenantMember.user_id == user.id, TenantMember.is_active == True)
        )
        membership = mem.scalars().first()
        if membership:
            return membership

    result = await session.execute(
        select(TenantMember)
        .where(
            TenantMember.user_id == user.id,
            TenantMember.is_active == True
        )
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="No tienes membresía activa en ninguna empresa")
    
    if member.member_type not in ("owner", "admin") and not user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar invitaciones")
    
    return member


async def _get_config_value(session: AsyncSession, key: str, default: str) -> str:
    """Obtiene un valor de PlatformConfig, o retorna el default."""
    result = await session.execute(select(PlatformConfig).where(PlatformConfig.key == key))
    config = result.scalar_one_or_none()
    return config.value if config else default


@router.get("/preview/{token}", response_model=InvitationPreview)
async def preview_invitation(token: str, session: AsyncSession = Depends(get_session)):
    """
    Endpoint público (sin auth) — muestra el contexto de una invitación por token.
    Usado por la página /invite/:token del frontend antes de que el usuario haga login.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = await session.execute(
        select(Invitation).where(
            Invitation.token  == token,
            Invitation.status == "pending",
        )
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada o ya utilizada.")
    if now > invitation.expires_at:
        invitation.status = "expired"
        session.add(invitation)
        await session.commit()
        raise HTTPException(status_code=410, detail="Esta invitación ha expirado.")

    tenant = await session.get(Tenant, invitation.tenant_id)
    return InvitationPreview(
        id=invitation.id,
        tenant_name=tenant.name if tenant else "Empresa desconocida",
        member_type=invitation.member_type,
        email=invitation.email,
        expires_at=invitation.expires_at,
    )


@router.post("/", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    body: InvitationCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Crea una invitación para un empleado (solo admin del tenant)."""
    membership = await _get_admin_membership(current_user, session)
    tenant_id = membership.tenant_id

    # Verificar límite de invitaciones pendientes
    max_pending = int(await _get_config_value(session, "max_pending_invitations_per_tenant", "50"))
    pending_count_result = await session.execute(
        select(Invitation).where(
            Invitation.tenant_id == tenant_id,
            Invitation.status == "pending"
        )
    )
    pending_count = len(pending_count_result.scalars().all())
    if pending_count >= max_pending:
        raise HTTPException(
            status_code=400, 
            detail=f"Límite de invitaciones pendientes alcanzado ({max_pending}). Revoca o espera que se acepten."
        )

    # Verificar si ya existe una invitación pendiente para este email en este tenant
    existing = await session.execute(
        select(Invitation).where(
            Invitation.email == body.email,
            Invitation.tenant_id == tenant_id,
            Invitation.status == "pending"
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una invitación pendiente para este correo")

    # Calcular expiración
    validity_days = int(await _get_config_value(session, "invitation_token_validity_days", "7"))
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=validity_days)

    invitation = Invitation(
        email=body.email.lower().strip(),
        tenant_id=tenant_id,
        member_type=body.member_type,
        token=secrets.token_urlsafe(32),
        status="pending",
        expires_at=expires_at,
        created_by=current_user.id,
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)

    # Enriquecer respuesta
    tenant = await session.get(Tenant, tenant_id)

    return InvitationRead(
        id=invitation.id,
        email=invitation.email,
        tenant_id=invitation.tenant_id,
        member_type=invitation.member_type,
        status=invitation.status,
        token=invitation.token,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        tenant_name=tenant.name if tenant else None,
    )


@router.get("/", response_model=list[InvitationRead])
async def list_invitations(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Lista todas las invitaciones del tenant del admin actual. Marca las expiradas al vuelo."""
    membership = await _get_admin_membership(current_user, session)

    result = await session.execute(
        select(Invitation).where(
            Invitation.tenant_id == membership.tenant_id
        ).order_by(Invitation.created_at.desc())
    )
    invitations = result.scalars().all()

    # Marcar como expiradas las pendientes que ya vencieron
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    dirty = False
    for inv in invitations:
        if inv.status == "pending" and now > inv.expires_at:
            inv.status = "expired"
            session.add(inv)
            dirty = True
    if dirty:
        await session.commit()

    tenant = await session.get(Tenant, membership.tenant_id)
    return [
        InvitationRead(
            id=inv.id,
            email=inv.email,
            tenant_id=inv.tenant_id,
            member_type=inv.member_type,
            status=inv.status,
            token=inv.token,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
            tenant_name=tenant.name if tenant else None,
        )
        for inv in invitations
    ]


@router.post("/{invitation_id}/respond")
async def respond_to_invitation(
    invitation_id: uuid.UUID,
    body: InvitationRespond,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Acepta o rechaza una invitación (usuario invitado)."""
    invitation = await session.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    
    if invitation.email != current_user.email:
        raise HTTPException(status_code=403, detail="Esta invitación no es para ti")
    
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail=f"La invitación ya fue {invitation.status}")
    
    # Verificar expiración
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if now > invitation.expires_at:
        invitation.status = "expired"
        session.add(invitation)
        await session.commit()
        raise HTTPException(status_code=400, detail="La invitación ha expirado")

    if body.action == "accept":
        # Verificar que no exista ya una membresía en este tenant
        existing_mem = await session.execute(
            select(TenantMember).where(
                TenantMember.user_id == current_user.id,
                TenantMember.tenant_id == invitation.tenant_id
            )
        )
        if existing_mem.scalar_one_or_none():
            invitation.status = "accepted"
            session.add(invitation)
            await session.commit()
            return {"detail": "Ya eres miembro de esta empresa. Invitación marcada como aceptada."}

        # Crear membresía M:N
        new_member = TenantMember(
            user_id=current_user.id,
            tenant_id=invitation.tenant_id,
            member_type=invitation.member_type,
        )
        session.add(new_member)
        invitation.status = "accepted"
    else:
        invitation.status = "rejected"

    session.add(invitation)
    await session.commit()

    return {"detail": f"Invitación {invitation.status} correctamente"}


@router.patch("/{invitation_id}/revoke")
async def revoke_invitation(
    invitation_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoca una invitación pendiente (solo admin del tenant)."""
    membership = await _get_admin_membership(current_user, session)
    
    invitation = await session.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    
    if invitation.tenant_id != membership.tenant_id:
        raise HTTPException(status_code=403, detail="No puedes revocar invitaciones de otra empresa")
    
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail=f"Solo se pueden revocar invitaciones pendientes (actual: {invitation.status})")

    invitation.status = "revoked"
    session.add(invitation)
    await session.commit()
    return {"detail": "Invitación revocada"}


@router.post("/{invitation_id}/resend")
async def resend_invitation(
    invitation_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Regenera el token y extiende la expiración de una invitación pendiente."""
    membership = await _get_admin_membership(current_user, session)
    
    invitation = await session.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    
    if invitation.tenant_id != membership.tenant_id:
        raise HTTPException(status_code=403, detail="No puedes reenviar invitaciones de otra empresa")
    
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden reenviar invitaciones pendientes")

    validity_days = int(await _get_config_value(session, "invitation_token_validity_days", "7"))
    invitation.token = secrets.token_urlsafe(32)
    invitation.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=validity_days)
    
    session.add(invitation)
    await session.commit()
    
    return {"detail": "Invitación reenviada con nuevo token", "token": invitation.token}
