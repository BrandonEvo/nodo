"""
Introspección metadata-driven para la Cartuchera.

Fuente de verdad: `SQLModel.metadata`. Toda tabla con columna `tenant_id` entra
sola al backup por-tenant; una tabla nueva con `tenant_id` se incorpora sin
tocar este archivo. Ese es el "hook" que el dueño pidió: el procedimiento de
backup refleja los cambios de esquema automáticamente.

`SQLModel.metadata.sorted_tables` ya devuelve las tablas en orden topológico por
FK (padres antes que hijos), así que el orden de inserción del restore sale
gratis y el de borrado es su reverso — sin listas de orden mantenidas a mano.
"""
from __future__ import annotations

import importlib

from sqlalchemy import Table, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

# Importar el paquete de modelos puebla SQLModel.metadata con todas las tablas.
# Es idempotente: si la app ya los importó, esto no hace nada.
importlib.import_module("models")

# Nombre canónico de la columna que marca una fila como perteneciente a un tenant.
TENANT_COLUMN = "tenant_id"

# ── Tablas globales de plataforma (sin tenant_id) ─────────────────────────────
# Allowlist EXPLÍCITA a propósito. "Todo lo que no tiene tenant_id" barrería
# `alembic_version`, `users` (credenciales) y las propias tablas de la Cartuchera.
# Estas van en el "cartucho de plataforma" (kind='platform'), nunca en uno de
# tenant. Un cartucho de tenant las REFERENCIA (p. ej. created_by, module_id)
# pero jamás las sobreescribe.
PLATFORM_TABLES: frozenset[str] = frozenset({
    "modules",
    "subscription_plans",
    "plan_modules",
    "platform_config",
})

# ── Tablas de tenant excluidas del cartucho, con motivo ───────────────────────
# Tienen tenant_id pero NO son datos de negocio portables. Excluirlas es una
# decisión consciente y auditada por el test de cobertura (no un olvido).
EXCLUDED_FROM_CARTRIDGE: dict[str, str] = {
    "user_presence":      "Heartbeats efímeros de presencia; se regeneran solos.",
    "push_subscriptions": "Tokens de push atados al navegador/VAPID; no portables.",
}

# Tablas de infraestructura que no pertenecen a ningún cartucho (ni de tenant ni
# de plataforma). `subject_tenant_id` de las tablas de la Cartuchera no cuenta
# como `tenant_id`, así que no aparecen aquí, pero las listamos por claridad.
INFRA_TABLES: frozenset[str] = frozenset({
    "alembic_version",
    "backup_settings",
    "backup_records",
    "backup_restore_logs",
})


def _metadata():
    return SQLModel.metadata


def all_sorted_tables() -> list[Table]:
    """Todas las tablas en orden topológico por FK (padres → hijos)."""
    return list(_metadata().sorted_tables)


def has_tenant_column(table: Table) -> bool:
    return TENANT_COLUMN in table.columns


def all_tenant_tables() -> list[Table]:
    """Todas las tablas con columna tenant_id (incluye las excluidas), en orden de inserción."""
    return [t for t in all_sorted_tables() if has_tenant_column(t)]


def cartridge_tables() -> list[Table]:
    """Tablas de tenant que SÍ entran al cartucho, en orden de inserción (FK-safe)."""
    return [
        t for t in all_tenant_tables()
        if t.name not in EXCLUDED_FROM_CARTRIDGE and t.name not in INFRA_TABLES
    ]


def cartridge_table_names() -> list[str]:
    return [t.name for t in cartridge_tables()]


def deletion_order(tables: list[Table]) -> list[Table]:
    """Orden inverso para borrar sin violar FKs (hijos → padres)."""
    return list(reversed(tables))


def platform_tables() -> list[Table]:
    """Tablas globales del cartucho de plataforma, en orden de inserción."""
    names = PLATFORM_TABLES
    return [t for t in all_sorted_tables() if t.name in names]


def column_names(table: Table) -> list[str]:
    return [c.name for c in table.columns]


def global_fk_columns(table: Table) -> list[tuple[str, str]]:
    """
    FKs de una tabla de tenant que apuntan FUERA del cartucho (a globales como
    users/modules/subscription_plans), como (columna_local, tabla_destino).
    Excluye tenant_id (se fuerza al tenant destino) y las auto-referencias.
    El importer las usa para reconciliar refs que no existan en el entorno destino.
    """
    cartridge = set(cartridge_table_names())
    out: list[tuple[str, str]] = []
    for fk in table.foreign_keys:
        local = fk.parent.name
        target = fk.column.table.name
        if local == TENANT_COLUMN or target == table.name:
            continue
        if target not in cartridge:
            out.append((local, target))
    return out


def primary_key_columns(table: Table) -> list[str]:
    return [c.name for c in table.primary_key.columns]


async def current_schema_revision(session: AsyncSession) -> str | None:
    """
    Head de Alembic aplicado en la DB. Se estampa en el manifiesto del cartucho
    y se valida al importar (un cartucho más nuevo que la DB se rechaza).
    """
    result = await session.execute(text("SELECT version_num FROM alembic_version"))
    row = result.first()
    return row[0] if row else None
