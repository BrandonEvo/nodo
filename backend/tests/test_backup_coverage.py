"""
Guard de cobertura de la Cartuchera + RLS (el "hook" con dientes).

Dos garantías, revalidadas en cada corrida de CI:

  1. METADATA (sin DB): la lista de tablas del cartucho se deriva de
     `SQLModel.metadata`, y las allowlists/exclusiones solo nombran tablas
     reales, sin solapamientos. Si alguien agrega una tabla con tenant_id, entra
     sola al backup; si la excluye a mano, debe hacerlo explícito y con motivo.

  2. RLS (con DB, solo lectura): TODA tabla con `tenant_id` en la DB migrada
     tiene RLS habilitada, sus 4 políticas (SELECT/INSERT/UPDATE/DELETE) y el
     GRANT a `nodo_app`. Esto convierte la regla obligatoria del CLAUDE.md en un
     test: una migración nueva que olvide RLS rompe el build, no producción.

Auditoría inicial (2026-07): 43 tablas con tenant_id, todas con RLS + 4 políticas.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

from api.services.backup import introspection as intro
from db.session import async_session_maker

REQUIRED_CMDS = {"SELECT", "INSERT", "UPDATE", "DELETE"}
APP_ROLE = "nodo_app"


# ── 1. Metadata (sin DB) ──────────────────────────────────────────────────────

def test_allowlists_only_name_real_tables():
    """Exclusiones y tablas de plataforma deben existir en el esquema (sin typos/renames)."""
    real = {t.name for t in intro.all_sorted_tables()}
    for name in intro.EXCLUDED_FROM_CARTRIDGE:
        assert name in real, f"EXCLUDED_FROM_CARTRIDGE nombra tabla inexistente: {name}"
    for name in intro.PLATFORM_TABLES:
        assert name in real, f"PLATFORM_TABLES nombra tabla inexistente: {name}"
    # Las excluidas de verdad tienen tenant_id (si no, no tendría sentido excluirlas del cartucho).
    tenant_names = {t.name for t in intro.all_tenant_tables()}
    for name in intro.EXCLUDED_FROM_CARTRIDGE:
        assert name in tenant_names, f"{name} está excluida pero no tiene tenant_id"


def test_cartridge_and_platform_sets_are_disjoint():
    """Una tabla no puede ser a la vez de tenant y de plataforma."""
    cartridge = set(intro.cartridge_table_names())
    platform = set(intro.PLATFORM_TABLES)
    excluded = set(intro.EXCLUDED_FROM_CARTRIDGE)
    assert cartridge.isdisjoint(platform), cartridge & platform
    assert cartridge.isdisjoint(excluded), cartridge & excluded


def test_cartridge_order_is_fk_safe():
    """El orden del cartucho es un subconjunto del orden topológico de metadata."""
    topo = [t.name for t in intro.all_sorted_tables()]
    cartridge = intro.cartridge_table_names()
    idx = [topo.index(n) for n in cartridge]
    assert idx == sorted(idx), "El orden de inserción del cartucho no respeta las FKs"


# ── 2. RLS en la DB migrada (solo lectura) ────────────────────────────────────

async def _db_tenant_tables() -> set[str]:
    async with async_session_maker() as session:
        result = await session.execute(text(
            "SELECT table_name FROM information_schema.columns "
            "WHERE table_schema='public' AND column_name='tenant_id'"
        ))
        return {r[0] for r in result.all()}


async def test_metadata_tenant_tables_match_db():
    """Deriva de metadata == realidad de la DB (detecta modelos sin migrar o al revés)."""
    meta = {t.name for t in intro.all_tenant_tables()}
    db = await _db_tenant_tables()
    assert meta == db, (
        f"Deriva metadata↔DB. Solo en metadata: {meta - db}. Solo en DB: {db - meta}."
    )


async def test_every_tenant_table_has_rls_and_policies():
    """Regla obligatoria del CLAUDE.md, ahora verificada: RLS + 4 políticas por tabla de tenant."""
    async with async_session_maker() as session:
        rls_res = await session.execute(text(
            "SELECT c.relname, c.relrowsecurity FROM pg_class c "
            "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'"
        ))
        rls_on = {name: bool(on) for name, on in rls_res.all()}

        pol_res = await session.execute(text(
            "SELECT tablename, cmd FROM pg_policies WHERE schemaname='public'"
        ))
        cmds: dict[str, set[str]] = {}
        for tablename, cmd in pol_res.all():
            cmds.setdefault(tablename, set()).add(cmd)

    problems: list[str] = []
    for name in await _db_tenant_tables():
        if not rls_on.get(name):
            problems.append(f"{name}: RLS deshabilitada")
        missing = REQUIRED_CMDS - cmds.get(name, set())
        if missing:
            problems.append(f"{name}: faltan políticas {sorted(missing)}")
    assert not problems, "Tablas de tenant sin RLS/políticas:\n  " + "\n  ".join(problems)


async def test_every_tenant_table_grants_app_role():
    """La regla del GRANT: nodo_app debe tener SELECT/INSERT/UPDATE/DELETE en cada tabla de tenant."""
    async with async_session_maker() as session:
        grant_res = await session.execute(text(
            "SELECT table_name, privilege_type FROM information_schema.role_table_grants "
            "WHERE table_schema='public' AND grantee=:role"
        ), {"role": APP_ROLE})
        grants: dict[str, set[str]] = {}
        for table_name, priv in grant_res.all():
            grants.setdefault(table_name, set()).add(priv)

    problems: list[str] = []
    for name in await _db_tenant_tables():
        missing = REQUIRED_CMDS - grants.get(name, set())
        if missing:
            problems.append(f"{name}: faltan grants a {APP_ROLE} {sorted(missing)}")
    assert not problems, "Tablas de tenant sin GRANT a nodo_app:\n  " + "\n  ".join(problems)
