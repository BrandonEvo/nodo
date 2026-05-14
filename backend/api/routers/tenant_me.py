"""
Router para el admin del tenant: gestión de empleados y módulos.
Usa la arquitectura M:N correcta (TenantMember) para determinar tenant_id y permisos.
"""
import uuid
from typing import List, Callable, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, delete

from db.session import get_session
from models import User, Tenant, TenantMember, TenantMemberModuleAccess
from models.schemas import UserRead


async def _get_user_membership(user: User, session: AsyncSession) -> TenantMember | None:
    """Obtiene la membresía M:N del usuario (su primer tenant)."""
    result = await session.execute(
        select(TenantMember).where(
            TenantMember.user_id == user.id,
            TenantMember.is_active == True
        )
    )
    return result.scalars().first()


async def _is_tenant_admin(user: User, session: AsyncSession) -> tuple[bool, TenantMember | None]:
    """
    Determina si el usuario es admin del tenant usando la arquitectura M:N.
    Un usuario es admin si:
    - Es superuser (global), o
    - Su member_type en TenantMember es 'owner' o 'admin'
    """
    if user.is_superuser:
        membership = await _get_user_membership(user, session)
        return True, membership

    membership = await _get_user_membership(user, session)
    if not membership:
        return False, None

    return membership.member_type in ("owner", "admin"), membership


def create_tenant_me_router(
    current_user_active: Callable[..., Any],
) -> APIRouter:
    """
    current_user_active: dependencia que devuelve el usuario actual (activo).
    Las rutas resuelven el tenant_id desde TenantMember (M:N), no desde User.
    """
    router = APIRouter(prefix="/me/tenant", tags=["tenant-admin"])

    @router.get("/", response_model=dict)
    async def get_my_tenant(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        """Devuelve el tenant del usuario actual (para selector de org en frontend)."""
        membership = await _get_user_membership(current_user, session)
        if not membership:
            raise HTTPException(status_code=404, detail="User has no tenant")
            
        tenant = await session.get(Tenant, membership.tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        return {
            "id": str(tenant.id),
            "name": tenant.name,
            "logo_url": tenant.logo_url,
            "theme_color": tenant.theme_color
        }

    @router.put("/config", response_model=dict)
    async def update_my_tenant_config(
        body: dict,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        """Actualiza la configuración del tenant (nombre, logo, color)"""
        is_admin, membership = await _is_tenant_admin(current_user, session)
        if not is_admin or not membership:
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede modificar la configuración")

        tenant = await session.get(Tenant, membership.tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")

        if "name" in body:
            tenant.name = body["name"]
        if "logo_url" in body:
            tenant.logo_url = body["logo_url"]
        if "theme_color" in body:
            tenant.theme_color = body["theme_color"]

        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)

        return {
            "id": str(tenant.id),
            "name": tenant.name,
            "logo_url": tenant.logo_url,
            "theme_color": tenant.theme_color
        }

    @router.get("/users", response_model=List[dict])
    async def list_my_tenant_users(
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        """Lista usuarios del tenant del admin actual, incluyendo sus accesos a módulos."""
        is_admin, membership = await _is_tenant_admin(current_user, session)
        if not is_admin or not membership:
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede listar usuarios")

        # JOIN User ↔ TenantMember para el tenant actual
        query = (
            select(User, TenantMember)
            .join(TenantMember, TenantMember.user_id == User.id)
            .where(
                TenantMember.tenant_id == membership.tenant_id,
                TenantMember.is_active == True
            )
            .order_by(User.email)
        )
        result = await session.execute(query)
        
        users_map = {}
        for user, member in result:
            users_map[str(member.id)] = {
                "id": str(user.id),
                "tenant_member_id": str(member.id),
                "email": user.email,
                "full_name": user.full_name,
                "picture": user.picture,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "is_verified": user.is_verified,
                "member_type": member.member_type,
                "is_tenant_admin": member.member_type in ("owner", "admin"),
                "module_ids": []
            }
            
        if not users_map:
            return []

        # Obtener los accesos a módulos para estos miembros
        member_ids = [uuid.UUID(k) for k in users_map.keys()]
        access_query = select(TenantMemberModuleAccess).where(
            TenantMemberModuleAccess.tenant_member_id.in_(member_ids)
        )
        access_result = await session.execute(access_query)
        
        for access in access_result.scalars().all():
            m_id = str(access.tenant_member_id)
            if m_id in users_map:
                users_map[m_id]["module_ids"].append(str(access.module_id))
                
        return list(users_map.values())

    @router.put("/users/{user_id}/modules")
    async def set_user_modules(
        user_id: uuid.UUID,
        body: dict,
        session: AsyncSession = Depends(get_session),
        current_user: User = Depends(current_user_active),
    ):
        """Cambia los accesos a módulos de un usuario dentro del tenant actual."""
        is_admin, membership = await _is_tenant_admin(current_user, session)
        if not is_admin or not membership:
            raise HTTPException(status_code=403, detail="Solo el admin del tenant puede asignar módulos")
        
        module_ids = body.get("module_ids", [])
        
        # Buscar la membresía del usuario TARGET en ESTE tenant
        mem_result = await session.execute(
            select(TenantMember).where(
                TenantMember.user_id == user_id,
                TenantMember.tenant_id == membership.tenant_id
            )
        )
        member = mem_result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=404, detail="Usuario no encontrado en esta empresa")
        
        # ── REGLA DE PROTECCIÓN DEL PROPIETARIO ──────────────────────────
        # El propietario tiene acceso a todo por defecto, no se le restringen módulos
        if member.member_type == "owner":
            raise HTTPException(
                status_code=403,
                detail="No se pueden modificar los accesos del Propietario."
            )
        # ─────────────────────────────────────────────────────────────────
        
        # Eliminar accesos anteriores
        await session.execute(
            delete(TenantMemberModuleAccess).where(
                TenantMemberModuleAccess.tenant_member_id == member.id
            )
        )
        
        # Insertar nuevos accesos
        for mid in module_ids:
            new_access = TenantMemberModuleAccess(
                tenant_member_id=member.id,
                module_id=uuid.UUID(mid)
            )
            session.add(new_access)
            
        await session.commit()
        return {"id": str(user_id), "module_ids": module_ids}

    return router
