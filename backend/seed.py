import asyncio
from sqlmodel import select
from db.session import async_session_maker
from models import Tenant, User, TenantMember
from core.config import settings

async def seed_data():
    """
    Función para inicializar la plataforma solo con los requerimientos mínimos de seguridad.
    Crea el Super Administrador utilizando los datos de entorno ocultos en el .env
    """
    async with async_session_maker() as session:
        # ==========================================
        # 1. EMPRESA PRINCIPAL (Para el SuperAdmin)
        # ==========================================
        stmt = select(Tenant).where(Tenant.name == "Nodo Principal")
        db_tenant = (await session.execute(stmt)).scalar_one_or_none()
        
        if not db_tenant:
            db_tenant = Tenant(name="Nodo Principal")
            session.add(db_tenant)
            await session.flush()
            print(f"[EXITO] Tenant '{db_tenant.name}' creado.")
        # ==========================================
        # 2. SUPER ADMINISTRADOR
        # ==========================================
        admin_email = "admin@nodo.com"
        stmt = select(User).where(User.email == admin_email)
        db_user = (await session.execute(stmt)).scalar_one_or_none()
        
        if not db_user:
            db_user = User(
                email=admin_email,
                hashed_password=settings.SUPERADMIN_PASSWORD_HASH,
                is_active=True,
                is_superuser=True,
                is_verified=True,
            )
            session.add(db_user)
            await session.flush()
            print(f"[EXITO] Super Administrador '{db_user.email}' creado de forma segura.")
            
        # Asignar Super Admin a Nodo Principal
        stmt = select(TenantMember).where(TenantMember.user_id == db_user.id, TenantMember.tenant_id == db_tenant.id)
        db_member = (await session.execute(stmt)).scalar_one_or_none()
        
        if not db_member:
            db_member = TenantMember(
                user_id=db_user.id,
                tenant_id=db_tenant.id,
                member_type="owner"
            )
            session.add(db_member)
            await session.flush()

        await session.commit()
        print("[EXITO] Inicialización de seguridad finalizada.")

if __name__ == "__main__":
    asyncio.run(seed_data())