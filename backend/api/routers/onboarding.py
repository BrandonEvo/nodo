"""
PATCH /api/onboarding/complete — Completa el onboarding del dueño orgánico.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from models import User, Tenant, TenantMember
from models.schemas import OnboardingUpdate

router = APIRouter(tags=["Onboarding"])


@router.patch("/complete")
async def complete_onboarding(
    body: OnboardingUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Finaliza el onboarding del dueño:
    1. Si no tiene tenant, crea uno nuevo con membresía owner.
    2. Actualiza el nombre del tenant (nombre provisional → nombre real).
    3. Marca onboarding_completed = True en el usuario.
    """
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="El onboarding ya fue completado")

    # Obtener la membresía M:N para encontrar el tenant del usuario
    mem_result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == current_user.id,
            TenantMember.is_active == True
        )
    )
    membership = mem_result.scalars().first()

    if membership:
        # Tiene tenant existente — solo actualizar el nombre
        tenant = await session.get(Tenant, membership.tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        tenant.name = body.company_name.strip()
        session.add(tenant)
    else:
        # No tiene tenant — crear uno nuevo con membresía de owner
        # Esto cubre usuarios registrados via /api/auth/register o Google OAuth
        # sin auto-provisioning de workspace
        new_tenant = Tenant(name=body.company_name.strip(), is_active=True)
        session.add(new_tenant)
        await session.flush()  # Para obtener el ID

        new_member = TenantMember(
            user_id=current_user.id,
            tenant_id=new_tenant.id,
            member_type="owner"
        )
        session.add(new_member)
        tenant = new_tenant

    # Marcar onboarding como completado
    current_user.onboarding_completed = True
    session.add(current_user)

    await session.commit()
    await session.refresh(tenant)

    return {
        "detail": "Onboarding completado exitosamente",
        "tenant_name": tenant.name,
        "onboarding_completed": True,
    }

