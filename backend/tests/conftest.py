"""
Fixtures de integración end-to-end.

Estrategia:
  - Setup con asyncio.run() antes de que pytest-asyncio tome el loop.
  - Fixtures de test son scope="function" (un loop por test).
  - Cleanup al final de sesión vía psycopg2 síncrono (evita conflicto de loops).
"""
import uuid
import asyncio

import pytest
from httpx import AsyncClient, ASGITransport
from sqlmodel import select

from main import app
from db.session import async_session_maker
from models import User, Tenant
from models.iam import TenantMember
from models.bakery import RecipeConstants, DEFAULT_CONSTANTS
from core.config import settings


# ── Estado global del tenant de test ──────────────────────────────────────────

_TEST_TENANT_ID: uuid.UUID | None = None
_TEST_USER_OBJ:  User | None = None


async def _bootstrap() -> None:
    """Crea tenant + usuario + membresía + constantes. Se ejecuta una sola vez."""
    global _TEST_TENANT_ID, _TEST_USER_OBJ

    async with async_session_maker() as session:
        tenant = Tenant(name=f"__test_{uuid.uuid4().hex[:8]}__")
        session.add(tenant)
        await session.flush()

        from fastapi_users.password import PasswordHelper
        user = User(
            email=f"test_{uuid.uuid4().hex[:8]}@nodo.test",
            hashed_password=PasswordHelper().hash("Test1234!"),
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.flush()

        session.add(TenantMember(
            user_id=user.id,
            tenant_id=tenant.id,
            member_type="owner",
        ))

        today = __import__("datetime").date.today()
        for d in DEFAULT_CONSTANTS:
            session.add(RecipeConstants(
                tenant_id=tenant.id,
                constant_key=d["constant_key"],
                value=d["value"],
                description=d["description"],
                effective_from=today,
            ))

        await session.commit()
        _TEST_TENANT_ID = tenant.id
        _TEST_USER_OBJ  = user


# Ejecutar bootstrap antes de la colección
asyncio.run(_bootstrap())

# Descartar el pool de conexiones creado en el loop del bootstrap.
# Los tests usarán su propio loop y crearán conexiones frescas.
from db.session import engine as _sa_engine
asyncio.run(_sa_engine.dispose())


def pytest_sessionfinish(session, exitstatus):
    """Soft-delete de artefactos de test vía psycopg2 (loop-neutral)."""
    if _TEST_TENANT_ID is None:
        return
    try:
        import psycopg2
        # La URL asyncpg://... la convertimos a la forma síncrona
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        tid = str(_TEST_TENANT_ID)
        for table in (
            "production_orders", "waste_logs", "recipe_ingredients", "recipes",
            "inventory_items", "recipe_constants", "tenant_members",
        ):
            cur.execute(
                f"UPDATE {table} SET is_active = false WHERE tenant_id = %s", (tid,)
            )
        if _TEST_USER_OBJ:
            cur.execute(
                "UPDATE users SET is_active = false WHERE id = %s",
                (str(_TEST_USER_OBJ.id),)
            )
        cur.close()
        conn.close()
    except Exception:
        pass  # Cleanup best-effort; no bloquear la salida del proceso


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
async def reset_connection_pool():
    """Descarta el pool antes de cada test para que el nuevo loop reciba conexiones frescas."""
    await _sa_engine.dispose()
    yield

async def _generate_jwt() -> str:
    from fastapi_users.authentication import JWTStrategy
    return await JWTStrategy(
        secret=settings.SECRET_KEY, lifetime_seconds=3600
    ).write_token(_TEST_USER_OBJ)


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.fixture
async def auth_headers():
    token = await _generate_jwt()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def inventory_ids(client, auth_headers):
    """Crea insumos de la receta Frances en el tenant de test."""
    items = [
        ("harina",    "Harina dura test"),
        ("levadura",  "Levadura test"),
        ("sal",       "Sal test"),
        ("azucar",    "Azucar test"),
        ("manteca",   "Manteca test"),
        ("mejorador", "Mejorador test"),
        ("agua",      "Agua test"),
    ]
    ids = {}
    for key, name in items:
        r = await client.post("/api/bodega/items", json={
            "name": name,
            "unit": "lb",
            "current_stock": 9999.0,
        }, headers=auth_headers)
        assert r.status_code == 201, f"Error creando '{name}': {r.text}"
        ids[key] = r.json()["id"]
    return ids
