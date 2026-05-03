import asyncio
import uuid
from sqlmodel import select
from db.session import async_session_maker
from models import Tenant, User, Module, Role, TenantMember, RoleModuleAccess
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_data():
    async with async_session_maker() as session:
        # ==========================================
        # 1. MÓDULOS
        # ==========================================
        modules_data = [
            {"name": "Punto de Venta", "code": "POS", "is_premium": False},
            {"name": "Inventario", "code": "INVENTORY", "is_premium": False},
            {"name": "Recursos Humanos", "code": "HR", "is_premium": True},
        ]
        
        db_modules = {}
        for m_data in modules_data:
            stmt = select(Module).where(Module.code == m_data["code"])
            db_m = (await session.execute(stmt)).scalar_one_or_none()
            if not db_m:
                db_m = Module(**m_data)
                session.add(db_m)
                await session.flush()
                print(f"[EXITO] Módulo '{db_m.name}' creado.")
            db_modules[db_m.code] = db_m

        # ==========================================
        # 2. EMPRESAS (TENANTS)
        # ==========================================
        tenants_data = [
            {"name": "Nodo Principal"},
            {"name": "Acme Corp"},
            {"name": "Tech Solutions"}
        ]
        db_tenants = {}
        for t_data in tenants_data:
            stmt = select(Tenant).where(Tenant.name == t_data["name"])
            db_t = (await session.execute(stmt)).scalar_one_or_none()
            if not db_t:
                db_t = Tenant(name=t_data["name"])
                session.add(db_t)
                await session.flush()
                print(f"[EXITO] Tenant '{db_t.name}' creado.")
            db_tenants[db_t.name] = db_t

        await session.commit()
        
        # ==========================================
        # 3. ROLES POR DEFECTO PARA EMPRESAS
        # ==========================================
        roles_data = [
            {"name": "Administrador", "is_custom": False},
            {"name": "Gerente", "is_custom": True},
            {"name": "Cajero", "is_custom": True},
        ]
        db_roles = {}
        for t_name, db_t in db_tenants.items():
            db_roles[db_t.id] = []
            for r_data in roles_data:
                stmt = select(Role).where(Role.tenant_id == db_t.id, Role.name == r_data["name"])
                db_r = (await session.execute(stmt)).scalar_one_or_none()
                if not db_r:
                    db_r = Role(name=r_data["name"], is_custom=r_data["is_custom"], tenant_id=db_t.id)
                    session.add(db_r)
                    await session.flush()
                db_roles[db_t.id].append(db_r)
                
        await session.commit()
            
        # ==========================================
        # 4. USUARIOS Y MEMBRESÍAS
        # ==========================================
        from core.config import settings
        
        users_data = [
            {"email": "admin@nodo.com", "pw": settings.DEFAULT_SUPERADMIN_PASSWORD, "is_su": True, "tenant": "Nodo Principal", "role_idx": 0},
            {"email": "admin@acme.com", "pw": "Acme2026!", "is_su": False, "tenant": "Acme Corp", "role_idx": 0},
            {"email": "gerente@acme.com", "pw": "Acme2026!", "is_su": False, "tenant": "Acme Corp", "role_idx": 1},
            {"email": "cajero1@acme.com", "pw": "Acme2026!", "is_su": False, "tenant": "Acme Corp", "role_idx": 2},
            {"email": "cajero2@acme.com", "pw": "Acme2026!", "is_su": False, "tenant": "Acme Corp", "role_idx": 2},
            {"email": "admin@tech.com", "pw": "Tech2026!", "is_su": False, "tenant": "Tech Solutions", "role_idx": 0},
            {"email": "empleado@tech.com", "pw": "Tech2026!", "is_su": False, "tenant": "Tech Solutions", "role_idx": 2},
        ]
        
        for u_data in users_data:
            stmt = select(User).where(User.email == u_data["email"])
            db_user = (await session.execute(stmt)).scalar_one_or_none()
            
            if not db_user:
                db_user = User(
                    email=u_data["email"],
                    hashed_password=pwd_context.hash(u_data["pw"]),
                    is_active=True,
                    is_superuser=u_data["is_su"],
                    is_verified=True,
                )
                session.add(db_user)
                await session.flush()
                print(f"[EXITO] Usuario '{db_user.email}' creado.")
                
            # Asignar a tenant
            target_tenant_id = db_tenants[u_data["tenant"]].id
            target_role_id = db_roles[target_tenant_id][u_data["role_idx"]].id
            
            stmt = select(TenantMember).where(TenantMember.user_id == db_user.id, TenantMember.tenant_id == target_tenant_id)
            db_member = (await session.execute(stmt)).scalar_one_or_none()
            
            if not db_member:
                db_member = TenantMember(
                    user_id=db_user.id,
                    tenant_id=target_tenant_id,
                    role_id=target_role_id
                )
                session.add(db_member)
                await session.flush()
        
        await session.commit()
        print("[EXITO] Proceso de Seed finalizado.")

if __name__ == "__main__":
    asyncio.run(seed_data())