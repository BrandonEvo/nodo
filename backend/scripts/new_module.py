#!/usr/bin/env python3
"""
Generador de módulos Nodo — scaffolding full-stack siguiendo CLAUDE.md.

A partir de un nombre y una lista de tablas, crea TODOS los archivos de un módulo
nuevo y los cablea en los puntos de registro. Las tablas nacen con RLS (4 políticas
+ GRANT a nodo_app), el router usa get_current_tenant_id (RLS activo) y el frontend
queda registrado en appRegistry. Es un PUNTO DE PARTIDA, no un módulo terminado:
las tablas traen columnas de ejemplo (name/description/sort_order) para que compile
y corra de punta a punta — edítalas a tu gusto antes de migrar.

Convención de nombres (derivada del nombre que pasas):
  inventario        → snake=inventario      kebab=inventario      Pascal=Inventario
  control-stock     → snake=control_stock   kebab=control-stock   Pascal=ControlStock
  - snake  → archivos y símbolos Python/TS (models/control_stock.py, control_stock.service.ts)
  - kebab  → rutas, carpeta de la app y key en appRegistry (== frontend_route)

Uso (desde backend/):
  python -m scripts.new_module inventario --tables items,movimientos --icon box
  python scripts/new_module.py reservas --prefix resv --tables settings,slots --dry-run
  python scripts/new_module.py control-stock --tables items --icon boxes --premium
  python scripts/new_module.py inventario --tables items --plan "Plan Pro"   # lo suma a un plan

Activación: por defecto el módulo NACE SIN ACTIVAR en ningún tenant (alineado con el
modelo planes→empresas). Súmalo a un plan con --plan "Nombre" (lo activa también en
las empresas que ya tienen ese plan), o usa --activate all para suscribir a todos.

Solo usa la stdlib. Revisa siempre el diff resultante.
"""
from __future__ import annotations

import argparse
import re
import secrets
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# scripts/ vive dentro de backend/
BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent
FRONTEND = ROOT / "frontend"

VERSIONS = BACKEND / "migrations" / "versions"
MODELS = BACKEND / "models"
ROUTERS = BACKEND / "api" / "routers"
MAIN_PY = BACKEND / "main.py"
SCHEMAS_PY = MODELS / "schemas.py"
INIT_PY = MODELS / "__init__.py"
SERVICES_TS = FRONTEND / "src" / "services"
APPS = FRONTEND / "src" / "apps"
APPS_INDEX = APPS / "index.ts"

# Plurales que ya leen como singular conceptual — no recortar la 's'
_KEEP_PLURAL = {"settings", "status", "series", "datos", "ventas"}


# ──────────────────────────────────────────────────────────────────────────────
# Derivación de nombres
# ──────────────────────────────────────────────────────────────────────────────
def _words(s: str) -> list[str]:
    return [w for w in re.split(r"[^a-zA-Z0-9]+", s) if w]


def _pascal(s: str) -> str:
    return "".join(w[:1].upper() + w[1:].lower() for w in _words(s))


def _singular(w: str) -> str:
    lw = w.lower()
    if lw in _KEEP_PLURAL:
        return w
    if lw.endswith("ies") and len(lw) > 3:
        return w[:-3] + "y"
    if lw.endswith("ss"):
        return w
    if lw.endswith("s") and len(lw) > 3:
        return w[:-1]
    return w


@dataclass
class Names:
    snake: str
    kebab: str
    pascal: str
    camel: str
    code: str
    human: str

    @property
    def app_name(self) -> str:
        return f"{self.pascal}App"


def derive_names(raw: str) -> Names:
    words = _words(raw)
    if not words:
        sys.exit("✗ Nombre de módulo inválido.")
    snake = "_".join(words).lower()
    pascal = _pascal(raw)
    return Names(
        snake=snake,
        kebab="-".join(words).lower(),
        pascal=pascal,
        camel=pascal[:1].lower() + pascal[1:],
        code="_".join(words).upper(),
        human=" ".join(w.capitalize() for w in words),
    )


@dataclass
class Table:
    suffix: str       # 'items'
    table: str        # 'inv_items'
    cls: str          # 'InvItem'
    human: str        # 'Inv Items'


def build_tables(prefix: str, suffixes: list[str]) -> list[Table]:
    pre = _pascal(prefix)
    out: list[Table] = []
    for suf in suffixes:
        out.append(
            Table(
                suffix=suf,
                table=f"{prefix}_{suf}".lower(),
                cls=pre + _pascal(_singular(suf)),
                human=f"{_pascal(prefix)} {_pascal(suf)}",
            )
        )
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Render por marcadores __MARKER__ (evita choques con las llaves de TSX/SQL)
# ──────────────────────────────────────────────────────────────────────────────
def render(tpl: str, mapping: dict[str, str]) -> str:
    out = tpl
    for k, v in mapping.items():
        out = out.replace(k, v)
    return out


# ── PLANTILLAS ────────────────────────────────────────────────────────────────

MODEL_HEADER = """# Tablas: MÓDULO __HUMANUP__ (generado por scripts/new_module.py — edita las columnas)
import uuid
from typing import Optional
from sqlmodel import Field
from .mixins import AuditBase
"""

MODEL_CLASS = '''

class __CLASS__(AuditBase, table=True):
    __tablename__ = "__TABLE__"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)

    name: str = Field(max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    sort_order: int = Field(default=0)
'''

SCHEMA_BLOCK = '''

# ── __HUMAN__ (__TABLE__) ──
class __CLASS__Create(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class __CLASS__Update(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class __CLASS__Read(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool
'''

MIG_CREATE = """    op.create_table(
        '__TABLE__',
        sa.Column('id',          sa.UUID(),      primary_key=True, nullable=False),
        sa.Column('tenant_id',   sa.UUID(),      sa.ForeignKey('tenants.id'), nullable=False, index=True),
        sa.Column('created_by',  sa.UUID(),      sa.ForeignKey('users.id'), nullable=True),

        sa.Column('name',        sa.String(150), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('sort_order',  sa.Integer(),   nullable=False, server_default='0'),

        sa.Column('created_at',  sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at',  sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('is_active',   sa.Boolean(),   nullable=False, server_default='true'),
    )
"""

MIGRATION = '''"""add __SNAKE__ module (__HUMAN__)

Revision ID: __REV__
Revises: __DOWN__
Create Date: __DATE__

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '__REV__'
down_revision: Union[str, Sequence[str], None] = __DOWN_REPR__
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE  = '__CODE__'
MODULE_NAME  = '__HUMAN__'
MODULE_DESC  = '__DESC__'
MODULE_ROUTE = '__KEBAB__'
MODULE_ICON  = '__ICON__'

TABLES = [__TABLES_LIST__]


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY {table}_tenant_select ON {table} FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_insert ON {table} FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_update ON {table} FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"""
        CREATE POLICY {table}_tenant_delete ON {table} FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO nodo_app")


def upgrade() -> None:
__CREATE_TABLES__
    for table in TABLES:
        _enable_rls(table)

    op.execute(f"""
        INSERT INTO modules (id, code, name, description, is_premium, is_active, frontend_route, icon,
                             created_at, updated_at)
        SELECT gen_random_uuid(), '{MODULE_CODE}', '{MODULE_NAME}',
               '{MODULE_DESC}', __PREMIUM_SQL__, true, '{MODULE_ROUTE}', '{MODULE_ICON}',
               NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = '{MODULE_CODE}')
    """)

__ACTIVATION_SQL__


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM subscriptions
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
    op.execute(f"""
        DELETE FROM plan_modules
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
    op.execute(f"DELETE FROM modules WHERE code = '{MODULE_CODE}'")

    for table in reversed(TABLES):
        op.execute(f"REVOKE ALL ON {table} FROM nodo_app")
        op.drop_table(table)
'''

# Bloques de activación inyectados en la migración según --activate / --plan.
# Por defecto (none) el módulo NO se suscribe a nadie: queda disponible para
# sumarlo a un plan, alineado con el modelo planes→empresas.
MIG_ACT_NONE = '''    # Sin activación automática: el módulo nace disponible pero sin suscripciones.
    # Súmalo a un plan (pantalla Suscripciones) y asigna ese plan a las empresas.'''

MIG_ACT_ALL = '''    # Activación global: suscribe el módulo a TODOS los tenants (ignora los planes).
    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, m.id, 'active', NOW(), true, NOW(), NOW()
        FROM tenants t, modules m
        WHERE m.code = '{MODULE_CODE}'
          AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id AND s.module_id = m.id)
    """)'''

MIG_ACT_PLAN = '''    # Añade el módulo al plan «__PLAN_HUMAN__» (bundle) — idempotente.
    op.execute(f"""
        INSERT INTO plan_modules (id, plan_id, module_id, created_at, updated_at, is_active)
        SELECT gen_random_uuid(), p.id, m.id, NOW(), NOW(), true
        FROM subscription_plans p, modules m
        WHERE p.name = '__PLAN_LIT__' AND m.code = '{MODULE_CODE}'
          AND NOT EXISTS (SELECT 1 FROM plan_modules pm WHERE pm.plan_id = p.id AND pm.module_id = m.id)
    """)
    # Activa el módulo en las empresas que YA tienen ese plan (retroactivo).
    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, m.id, 'active', NOW(), true, NOW(), NOW()
        FROM tenants t, subscription_plans p, modules m
        WHERE t.plan_id = p.id AND p.name = '__PLAN_LIT__' AND m.code = '{MODULE_CODE}'
          AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id AND s.module_id = m.id)
    """)'''


ROUTER = '''"""
MÓDULO __HUMANUP__ (generado por scripts/new_module.py)
- GET    /api/__KEBAB__/            → Listar __PRIMARY_TABLE__
- POST   /api/__KEBAB__/            → Crear
- PATCH  /api/__KEBAB__/{item_id}   → Editar
- DELETE /api/__KEBAB__/{item_id}   → Soft-delete

CRUD de la tabla principal. Para las demás tablas del módulo, añade endpoints
siguiendo este mismo patrón. Toda ruta usa get_current_tenant_id → RLS activo;
nunca uses get_session solo en rutas de negocio.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from db.session import get_session
from api.deps import get_current_tenant_id
from models.__SNAKE__ import __PRIMARY_CLASS__
from models.schemas import (
    __PRIMARY_CLASS__Create, __PRIMARY_CLASS__Update, __PRIMARY_CLASS__Read,
)

router = APIRouter(tags=["__HUMAN__"])


def _to_read(row: __PRIMARY_CLASS__) -> __PRIMARY_CLASS__Read:
    return __PRIMARY_CLASS__Read(
        id=row.id,
        name=row.name,
        description=row.description,
        sort_order=row.sort_order,
        is_active=row.is_active,
    )


@router.get("/", response_model=list[__PRIMARY_CLASS__Read])
async def list_items(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(__PRIMARY_CLASS__)
        .where(__PRIMARY_CLASS__.tenant_id == tenant_id, __PRIMARY_CLASS__.is_active == True)  # noqa: E712
        .order_by(__PRIMARY_CLASS__.sort_order, __PRIMARY_CLASS__.name)
    )
    return [_to_read(r) for r in result.scalars().all()]


@router.post("/", response_model=__PRIMARY_CLASS__Read, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: __PRIMARY_CLASS__Create,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    row = __PRIMARY_CLASS__(
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        sort_order=body.sort_order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_read(row)


@router.patch("/{item_id}", response_model=__PRIMARY_CLASS__Read)
async def update_item(
    item_id: uuid.UUID,
    body: __PRIMARY_CLASS__Update,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(__PRIMARY_CLASS__, item_id)
    if not row or row.tenant_id != tenant_id or not row.is_active:
        raise HTTPException(status_code=404, detail="No encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_read(row)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(__PRIMARY_CLASS__, item_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="No encontrado")
    row.is_active = False
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(row)
    await session.commit()
'''

SERVICE_TS = '''import api from '@/lib/api';

const BASE = '/api/__KEBAB__';

export interface __PRIMARY_CLASS__ {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface __PRIMARY_CLASS__Create {
  name: string;
  description?: string | null;
  sort_order?: number;
}

export type __PRIMARY_CLASS__Update = Partial<__PRIMARY_CLASS__Create>;

export const __CAMEL__Service = {
  list: async (): Promise<__PRIMARY_CLASS__[]> => {
    const { data } = await api.get(`${BASE}/`);
    return data;
  },
  create: async (body: __PRIMARY_CLASS__Create): Promise<__PRIMARY_CLASS__> => {
    const { data } = await api.post(`${BASE}/`, body);
    return data;
  },
  update: async (id: string, body: __PRIMARY_CLASS__Update): Promise<__PRIMARY_CLASS__> => {
    const { data } = await api.patch(`${BASE}/${id}`, body);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};
'''

APP_TSX = '''import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, X, Loader2 } from 'lucide-react';
import type { AppProps } from '../index';
import { __CAMEL__Service, type __PRIMARY_CLASS__ } from '@/services/__SNAKE__.service';
import { BottomSheet } from '@/components/ui/BottomSheet';

export function __APP_NAME__(_props: AppProps) {
  const [items, setItems] = useState<__PRIMARY_CLASS__[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    try {
      setItems(await __CAMEL__Service.list());
    } catch {
      setError('No se pudo cargar __HUMAN__');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(t);
  }, [success]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await __CAMEL__Service.create({ name: name.trim(), description: description.trim() || null });
      setName('');
      setDescription('');
      setShowForm(false);
      setSuccess('Creado');
      await load();
    } catch {
      setError('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <Check size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex flex-col gap-6 pb-6 max-w-4xl mx-auto">
        <div>
          <h1 className="nodo-module-title">__HUMAN__</h1>
          <p className="nodo-module-subtitle">Módulo generado — edítalo a tu gusto</p>
        </div>

        {loading ? (
          <div className="nodo-spinner-container">
            <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
          </div>
        ) : items.length === 0 ? (
          <div className="nodo-empty-state">
            <Plus size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">Aún no hay registros</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((it) => (
              <div key={it.id} className="nodo-card p-5">
                <p className="text-lg font-black text-nodo-ink">{it.name}</p>
                {it.description && <p className="text-xs text-nodo-sub mt-1">{it.description}</p>}
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setShowForm(true)} className="nodo-btn-primary">
          <Plus size={20} />
          NUEVO
        </button>
      </div>

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nuevo registro"
        footer={
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            GUARDAR
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="nodo-label">Nombre</label>
            <input className="nodo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre..." />
          </div>
          <div>
            <label className="nodo-label">Descripción</label>
            <textarea className="nodo-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional..." />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
'''


# ──────────────────────────────────────────────────────────────────────────────
# Detección del head de Alembic
# ──────────────────────────────────────────────────────────────────────────────
def _quoted(s: str) -> list[str]:
    return re.findall(r"""['"]([^'"]+)['"]""", s)


def find_head() -> tuple[str | None, list[str]]:
    """Devuelve (head, todas_las_heads). head = revisión no referenciada como down_revision."""
    revs: set[str] = set()
    downs: set[str] = set()
    for f in VERSIONS.glob("*.py"):
        if f.name == "__init__.py":
            continue
        text = f.read_text(encoding="utf-8")
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("revision") and "=" in s:
                q = _quoted(s)
                if q:
                    revs.add(q[0])
            elif s.startswith("down_revision") and "=" in s:
                downs.update(_quoted(s))
    heads = sorted(revs - downs)
    return (heads[0] if len(heads) == 1 else None), heads


# ──────────────────────────────────────────────────────────────────────────────
# Cableado de registros existentes (idempotente)
# ──────────────────────────────────────────────────────────────────────────────
class Wirer:
    def __init__(self, dry: bool):
        self.dry = dry
        self.log: list[str] = []

    def _write(self, path: Path, content: str):
        if not self.dry:
            path.write_text(content, encoding="utf-8")

    def models_init(self, n: Names, tables: list[Table]):
        content = INIT_PY.read_text(encoding="utf-8")
        if f"from .{n.snake} import" in content:
            self.log.append(f"  ↷ models/__init__.py ya tiene {n.snake} — sin cambios")
            return
        classes = [t.cls for t in tables]
        imp = f"from .{n.snake} import (\n" + "".join(f"    {c},\n" for c in classes) + ")\n"
        anchor = "__all__ = ["
        idx = content.find(anchor)
        if idx == -1:
            self.log.append("  ✗ models/__init__.py: no encontré '__all__ =' — registra a mano")
            return
        content = content[:idx] + imp + "\n" + content[idx:]
        # entradas en __all__: antes del ']' que cierra la lista
        close = content.find("\n]", content.find(anchor))
        block = f"    # {n.human}\n" + "".join(f'    "{c}",\n' for c in classes)
        content = content[: close + 1] + block + content[close + 1 :]
        self._write(INIT_PY, content)
        self.log.append("  ✓ models/__init__.py  (import + __all__)")

    def schemas(self, n: Names, tables: list[Table]):
        content = SCHEMAS_PY.read_text(encoding="utf-8")
        if f"class {tables[0].cls}Read" in content:
            self.log.append("  ↷ schemas.py ya tiene los schemas — sin cambios")
            return
        blocks = ""
        for t in tables:
            blocks += render(SCHEMA_BLOCK, {
                "__CLASS__": t.cls, "__TABLE__": t.table, "__HUMAN__": t.human,
            })
        if not content.endswith("\n"):
            content += "\n"
        self._write(SCHEMAS_PY, content + blocks)
        self.log.append(f"  ✓ models/schemas.py  ({len(tables)*3} schemas Read/Create/Update)")

    def main_py(self, n: Names):
        content = MAIN_PY.read_text(encoding="utf-8")
        if f"import {n.snake} as {n.snake}_router" in content:
            self.log.append("  ↷ main.py ya incluye el router — sin cambios")
            return
        block = (
            f"\nfrom api.routers import {n.snake} as {n.snake}_router\n"
            f'app.include_router({n.snake}_router.router, prefix="/api/{n.kebab}")\n'
        )
        anchor = 'app.include_router(booking_public_router.router, prefix="/api/booking")'
        idx = content.find(anchor)
        if idx == -1:
            content = content.rstrip("\n") + "\n" + block
        else:
            end = content.find("\n", idx) + 1
            content = content[:end] + block + content[end:]
        self._write(MAIN_PY, content)
        self.log.append("  ✓ main.py  (include_router)")

    def apps_index(self, n: Names):
        content = APPS_INDEX.read_text(encoding="utf-8")
        if f"'{n.kebab}': lazy(" in content or f"\n  {n.kebab}: lazy(" in content:
            self.log.append("  ↷ apps/index.ts ya registra la app — sin cambios")
            return
        entry = (
            f"  '{n.kebab}': lazy(() =>\n"
            f"    import('./{n.kebab}').then((m) => ({{ default: m.{n.app_name} }}))\n"
            f"  ),\n"
        )
        m = re.search(r"const appRegistry[^{]*\{", content)
        if not m:
            self.log.append("  ✗ apps/index.ts: no encontré 'const appRegistry' — registra a mano")
            return
        close = content.find("\n};", m.end())
        content = content[: close + 1] + entry + content[close + 1 :]
        self._write(APPS_INDEX, content)
        self.log.append("  ✓ apps/index.ts  (appRegistry)")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def _create(path: Path, content: str, dry: bool, force: bool, log: list[str], label: str):
    if path.exists() and not force:
        sys.exit(f"✗ Ya existe {path.relative_to(ROOT)} — usa --force para sobrescribir o elige otro nombre.")
    if not dry:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    log.append(f"  ✓ {label}")


def main():
    ap = argparse.ArgumentParser(
        description="Genera el scaffolding full-stack de un módulo Nodo (model+RLS+router+frontend).",
    )
    ap.add_argument("name", help="Nombre del módulo, ej: inventario o control-stock")
    ap.add_argument("--tables", default="",
                    help="Sufijos de tabla separados por coma (ej: items,movimientos). Default: el nombre del módulo.")
    ap.add_argument("--prefix", default="",
                    help="Prefijo de las tablas (ej: inv → inv_items). Default: snake del nombre.")
    ap.add_argument("--icon", default="box", help="Icono lucide (ej: box, calendar, store). Default: box")
    ap.add_argument("--description", default="", help="Descripción del módulo (para la tabla modules).")
    ap.add_argument("--code", default="", help="Forzar el code del módulo (ej: POS). Default: derivado del nombre.")
    ap.add_argument("--name", dest="human_name", default="",
                    help="Nombre comercial del módulo (título). Default: derivado del nombre.")
    ap.add_argument("--premium", action="store_true", help="Marca el módulo como premium.")
    ap.add_argument("--activate", choices=["none", "all"], default="none",
                    help="Suscripción al crear: none = nadie (alinea con planes), all = todos los tenants. Default: none")
    ap.add_argument("--plan", default="",
                    help="Suma el módulo a este plan (por nombre) y lo activa en sus empresas. Recomendado en vez de --activate all.")
    ap.add_argument("--down-revision", default="", help="Forzar down_revision si hay múltiples heads.")
    ap.add_argument("--dry-run", action="store_true", help="Muestra qué haría sin escribir nada.")
    ap.add_argument("--force", action="store_true", help="Sobrescribe archivos existentes.")
    args = ap.parse_args()

    n = derive_names(args.name)
    # Permite alinear el scaffold con una fila de `modules` ya existente (code/nombre exactos)
    if args.code:
        n.code = "_".join(_words(args.code)).upper()
    if args.human_name:
        n.human = args.human_name.strip()
    prefix = _snake_simple(args.prefix) if args.prefix else n.snake
    suffixes = [s.strip() for s in args.tables.split(",") if s.strip()] or [n.snake]
    tables = build_tables(prefix, suffixes)
    primary = tables[0]
    icon = args.icon.strip() or "box"
    desc = (args.description.strip()
            or f"Módulo {n.human}: gestión de {', '.join(t.suffix for t in tables)}.")

    # down_revision: head actual o el que el usuario fuerce
    if args.down_revision:
        down = args.down_revision.strip()
    else:
        down, heads = find_head()
        if down is None:
            if len(heads) > 1:
                sys.exit("✗ Hay múltiples heads de Alembic:\n   " + "\n   ".join(heads) +
                         "\n   Pasa --down-revision <rev> para elegir el padre.")
            sys.exit("✗ No pude detectar el head de Alembic. Pasa --down-revision <rev>.")

    rev = secrets.token_hex(6)
    common = {
        "__SNAKE__": n.snake, "__KEBAB__": n.kebab, "__PASCAL__": n.pascal,
        "__CAMEL__": n.camel, "__CODE__": n.code, "__HUMAN__": n.human,
        "__HUMANUP__": n.human.upper(), "__APP_NAME__": n.app_name,
        "__PRIMARY_CLASS__": primary.cls, "__PRIMARY_TABLE__": primary.table,
        "__ICON__": icon, "__DESC__": desc.replace("'", "''"),
    }

    # ── construir contenidos ──
    model_src = MODEL_HEADER.replace("__HUMANUP__", n.human.upper())
    for t in tables:
        model_src += render(MODEL_CLASS, {"__CLASS__": t.cls, "__TABLE__": t.table})

    # Activación alineada al modelo de planes: por defecto no suscribe a nadie.
    act_blocks: list[str] = []
    if args.plan:
        act_blocks.append(render(MIG_ACT_PLAN, {
            "__PLAN_HUMAN__": args.plan.strip(),
            "__PLAN_LIT__": args.plan.strip().replace("'", "''"),
        }))
    if args.activate == "all":
        act_blocks.append(MIG_ACT_ALL)
    activation = "\n\n".join(act_blocks) if act_blocks else MIG_ACT_NONE

    create_blocks = "".join(render(MIG_CREATE, {"__TABLE__": t.table}) for t in tables)
    migration_src = render(MIGRATION, {
        **common,
        "__REV__": rev,
        "__DOWN__": down,
        "__DOWN_REPR__": repr(down),
        "__DATE__": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
        "__TABLES_LIST__": ", ".join(f"'{t.table}'" for t in tables),
        "__CREATE_TABLES__": create_blocks,
        "__PREMIUM_SQL__": "true" if args.premium else "false",
        "__ACTIVATION_SQL__": activation,
    })

    router_src = render(ROUTER, common)
    service_src = render(SERVICE_TS, common)
    app_src = render(APP_TSX, common)
    barrel_src = f"export {{ {n.app_name} }} from './{n.app_name}';\n"

    mig_path = VERSIONS / f"{rev}_add_{n.snake}_module.py"

    act_label = f"plan «{args.plan.strip()}»" if args.plan else ("todos los tenants" if args.activate == "all" else "ninguno (súmalo a un plan)")
    print(f"\n📦 Módulo «{n.human}»  (code={n.code}, route={n.kebab}, down_revision={down})")
    print(f"   Tablas: {', '.join(t.table + ' → ' + t.cls for t in tables)}")
    print(f"   Activación: {act_label}")
    if args.dry_run:
        print("   [dry-run] no se escribe nada.\n")

    log: list[str] = []
    dry = args.dry_run
    _create(MODELS / f"{n.snake}.py", model_src, dry, args.force, log, f"models/{n.snake}.py")
    _create(mig_path, migration_src, dry, args.force, log, f"migrations/versions/{mig_path.name}")
    _create(ROUTERS / f"{n.snake}.py", router_src, dry, args.force, log, f"api/routers/{n.snake}.py")
    _create(SERVICES_TS / f"{n.snake}.service.ts", service_src, dry, args.force, log,
            f"frontend/src/services/{n.snake}.service.ts")
    _create(APPS / n.kebab / f"{n.app_name}.tsx", app_src, dry, args.force, log,
            f"frontend/src/apps/{n.kebab}/{n.app_name}.tsx")
    _create(APPS / n.kebab / "index.ts", barrel_src, dry, args.force, log,
            f"frontend/src/apps/{n.kebab}/index.ts")

    print("\nArchivos nuevos:")
    print("\n".join(log))

    w = Wirer(dry)
    w.models_init(n, tables)
    w.schemas(n, tables)
    w.main_py(n)
    w.apps_index(n)
    print("\nRegistros cableados:")
    print("\n".join(w.log))

    print("\nPróximos pasos:")
    print("  1. Edita las columnas en models/{0}.py, schemas.py y la migración (vienen de ejemplo).".format(n.snake))
    print("  2. Corre la migración en el contenedor backend:")
    print("       docker compose exec nodo_backend alembic upgrade head")
    print("  3. Verifica el front (sin node en host, vía docker):")
    print("       docker run --rm -v $PWD/frontend:/app -w /app node:20-alpine npx tsc -p tsconfig.app.json --noEmit")
    if args.plan:
        print(f"  4. El módulo quedó en el plan «{args.plan.strip()}»: las empresas con ese plan ya lo tienen;")
        print("     las nuevas lo reciben al asignarles el plan.\n")
    elif args.activate == "all":
        print("  4. Activado para TODAS las empresas (ignora los planes). Recarga la app.\n")
    else:
        print("  4. Nace SIN activar. Súmalo a un plan en la pantalla de Suscripciones")
        print("     y asigna ese plan a las empresas (Empresas → asignar plan).\n")


def _snake_simple(s: str) -> str:
    return "_".join(_words(s)).lower()


if __name__ == "__main__":
    main()
