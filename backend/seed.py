import asyncio
from sqlmodel import select
from db.session import async_session_maker
from models.models import Tenant, User
from passlib.context import CryptContext

# Contexto de encriptación para la contraseña
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_data():
    async with async_session_maker() as session:
        # ==========================================
        # 1. CREACIÓN DEL TENANT PRINCIPAL
        # ==========================================
        tenant_name = "Nodo Principal"
        statement = select(Tenant).where(Tenant.name == tenant_name)
        result = await session.execute(statement)
        db_tenant = result.scalar_one_or_none()

        if not db_tenant:
            # No enviamos created_at, id, ni is_active porque AuditBase los genera por defecto
            db_tenant = Tenant(name=tenant_name)
            session.add(db_tenant)
            await session.commit()
            await session.refresh(db_tenant)
            print(f"[EXITO] Tenant '{tenant_name}' creado con ID: {db_tenant.id}")
        else:
            print(f"[AVISO] El Tenant '{tenant_name}' ya existe en la base de datos.")

        # ==========================================
        # 2. CREACIÓN DEL SÚPER USUARIO
        # ==========================================
        admin_email = "admin@nodo.com"
        statement = select(User).where(User.email == admin_email)
        result = await session.execute(statement)
        db_user = result.scalar_one_or_none()

        if not db_user:
            new_user = User(
                email=admin_email,
                hashed_password=pwd_context.hash("AdminNodo2026!"),
                is_active=True,
                is_superuser=True,
                is_verified=True,
                is_tenant_admin=True,
                tenant_id=db_tenant.id,
            )
            session.add(new_user)
            await session.commit()
            print(f"[EXITO] Súper usuario '{admin_email}' creado y vinculado al Tenant.")
        else:
            print(f"[AVISO] El usuario '{admin_email}' ya existe en la base de datos.")

if __name__ == "__main__":
    asyncio.run(seed_data())