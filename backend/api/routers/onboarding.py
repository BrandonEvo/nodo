"""
PATCH /api/onboarding/complete — Completa el onboarding del dueño orgánico.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import current_active_user
from models import User, Tenant, TenantMember
from models.core import Module
from models.tenants import Subscription
from models.schemas import OnboardingUpdate

router = APIRouter(tags=["Onboarding"])

# Módulos que se activan si el usuario no selecciona ninguno
_DEFAULT_MODULE_CODES = ["bodega", "recetas", "cocina", "mostrador", "cierre"]


@router.patch("/complete")
async def complete_onboarding(
    body: OnboardingUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Finaliza el onboarding del dueño:
    1. Actualiza el nombre del tenant si se proporcionó uno nuevo.
    2. Activa los módulos seleccionados (o los defaults si no se eligió ninguno).
    3. Marca onboarding_completed = True en el usuario.
    Si el usuario no tiene tenant aún (Google OAuth sin workspace), lo crea aquí.
    """
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="El onboarding ya fue completado")

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
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        if body.company_name and body.company_name.strip():
            tenant.name = body.company_name.strip()
            session.add(tenant)
    else:
        # Google OAuth orgánico sin workspace — crear tenant
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

    # Activar módulos seleccionados (o defaults)
    codes = body.module_codes if body.module_codes else _DEFAULT_MODULE_CODES

    modules_result = await session.execute(
        select(Module).where(Module.code.in_(codes), Module.is_active == True)
    )
    modules = modules_result.scalars().all()

    # No crear subscripciones duplicadas
    existing_result = await session.execute(
        select(Subscription).where(
            Subscription.tenant_id == tenant.id,
            Subscription.status == "active",
        )
    )
    existing_module_ids = {s.module_id for s in existing_result.scalars().all()}

    for module in modules:
        if module.id not in existing_module_ids:
            session.add(Subscription(
                tenant_id=tenant.id,
                module_id=module.id,
                status="active",
            ))

    current_user.onboarding_completed = True
    session.add(current_user)
    await session.commit()
    await session.refresh(tenant)

    return {
        "detail": "Onboarding completado exitosamente",
        "tenant_name": tenant.name,
        "onboarding_completed": True,
        "modules_activated": len(modules),
    }
