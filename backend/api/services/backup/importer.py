"""
Importer de la Cartuchera: cargar un cartucho `.nodocart` en un tenant.

Diseño de seguridad (todo antes de tocar un dato):
  1. Validación: es un ZIP, manifiesto presente, checksum sha256 por tabla,
     versión de formato compatible, guard de tenant (el cartucho debe ser del
     tenant destino salvo re-mapeo explícito), aviso si cambió la revisión de
     esquema (se importan solo las columnas en común → forward/backward-compat).
  2. Preview (dry-run): conteos por tabla cartucho vs. DB actual, sin escribir.
  3. Restore: auto-backup de seguridad del estado actual (punto de undo), luego
     wipe-and-load por-tenant dentro de UNA transacción (todo-o-nada). Corre como
     nodo_admin (RLS bypass) forzando tenant_id = destino en cada fila.

Reconciliación de FKs globales: `created_by → users`, etc. pueden no existir en
otro entorno → si la columna es nullable se pone NULL; si no, se descarta la fila
(se cuenta y se reporta). tenant_id siempre se fuerza al destino.
"""
from __future__ import annotations

import hashlib
import zipfile

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.backup import BackupRestoreLog

from . import cartridge, exporter, introspection

_CHUNK = 500
_GLOBAL_ID_TABLES = ("users", "modules", "subscription_plans")


class CartridgeError(ValueError):
    """Cartucho inválido o inseguro de importar (se traduce a HTTP 400 en el router)."""


async def _count_current(session: AsyncSession, table, tenant_id) -> int:
    stmt = sa.select(sa.func.count()).select_from(table).where(table.c.tenant_id == tenant_id)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def _preload_global_ids(session: AsyncSession) -> dict[str, set]:
    """IDs existentes de tablas globales, para reconciliar FKs sin una query por fila."""
    ids: dict[str, set] = {}
    for name in _GLOBAL_ID_TABLES:
        table = introspection._metadata().tables.get(name)
        if table is None:
            continue
        result = await session.execute(sa.select(table.c.id))
        ids[name] = {row[0] for row in result.all()}
    return ids


async def _validate(session: AsyncSession, path: str, target_tenant_id, remap: bool):
    if not zipfile.is_zipfile(path):
        raise CartridgeError("El archivo no es un cartucho válido (.nodocart).")

    manifest = cartridge.read_manifest(path)
    problems: list[str] = []
    warnings: list[str] = []

    if manifest.get("format_version", 0) > cartridge.FORMAT_VERSION:
        problems.append("El cartucho fue creado por una versión más nueva de Nodo; no se puede importar.")

    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        for name, meta in manifest.get("tables", {}).items():
            entry = cartridge.table_entry_name(name)
            if entry not in names:
                problems.append(f"Falta la tabla '{name}' en el cartucho.")
                continue
            if hashlib.sha256(zf.read(entry)).hexdigest() != meta.get("sha256"):
                problems.append(f"Checksum inválido en '{name}' — el cartucho está corrupto.")

    cart_tenant_id = (manifest.get("tenant") or {}).get("id")
    tenant_match = cart_tenant_id == str(target_tenant_id)
    if not tenant_match and not remap:
        problems.append("El cartucho pertenece a otra empresa. Activa 're-mapear a esta empresa' para importarlo aquí.")

    cart_rev = manifest.get("schema_revision")
    current_rev = await introspection.current_schema_revision(session)
    if cart_rev and current_rev and cart_rev != current_rev:
        warnings.append(
            f"El cartucho usa otra versión del esquema ({cart_rev} vs {current_rev}); "
            "se importan solo las columnas en común."
        )

    return manifest, problems, warnings, tenant_match


async def preview(session: AsyncSession, path: str, target_tenant_id, remap: bool = False) -> dict:
    manifest, problems, warnings, tenant_match = await _validate(session, path, target_tenant_id, remap)
    table_map = {t.name: t for t in introspection.cartridge_tables()}

    tables = []
    for name, meta in manifest.get("tables", {}).items():
        current = await _count_current(session, table_map[name], target_tenant_id) if name in table_map else None
        tables.append({
            "table": name,
            "in_cartridge": meta.get("row_count", 0),
            "current": current,
        })

    return {
        "valid": not problems,
        "problems": problems,
        "warnings": warnings,
        "tenant_match": tenant_match,
        "manifest": {k: manifest.get(k) for k in ("format_version", "kind", "tenant", "schema_revision", "created_at", "total_rows")},
        "tables": sorted(tables, key=lambda r: -(r["in_cartridge"] or 0)),
    }


def _prepare_rows(table, raw_rows: list[dict], target_tenant_id, remap: bool, global_ids: dict[str, set]):
    """Decodifica y reconcilia las filas de una tabla. Devuelve (filas, descartadas, fks_anulados)."""
    if not raw_rows:
        return [], 0, 0

    cols = {c.name: c for c in table.columns}
    # Columnas a insertar: las de la tabla actual presentes en el cartucho (∩), + tenant_id.
    present = [name for name in cols if name in raw_rows[0] or name == introspection.TENANT_COLUMN]
    global_fks = [(fk, tgt) for fk, tgt in introspection.global_fk_columns(table) if fk in present]

    prepared, skipped, nulled = [], 0, 0
    for raw in raw_rows:
        row = {}
        for name in present:
            if name == introspection.TENANT_COLUMN:
                row[name] = target_tenant_id  # forzar destino (soporta re-mapeo)
            else:
                row[name] = cartridge.decode_value(raw.get(name), cols[name].type)

        drop = False
        for fkcol, target in global_fks:
            value = row.get(fkcol)
            if value is None:
                continue
            existing = global_ids.get(target)
            if existing is not None and value not in existing:
                if cols[fkcol].nullable:
                    row[fkcol] = None
                    nulled += 1
                else:
                    drop = True
                    break
        if drop:
            skipped += 1
            continue
        prepared.append(row)

    return prepared, skipped, nulled


async def _insert_rows(session: AsyncSession, table, rows: list[dict], mode: str):
    if not rows:
        return
    pk = [c.name for c in table.primary_key.columns]
    for i in range(0, len(rows), _CHUNK):
        chunk = rows[i:i + _CHUNK]
        if mode == "merge":
            ins = pg_insert(table)
            update_cols = {k: ins.excluded[k] for k in chunk[0].keys() if k not in pk}
            stmt = (
                ins.on_conflict_do_update(index_elements=pk, set_=update_cols)
                if update_cols else ins.on_conflict_do_nothing(index_elements=pk)
            )
            await session.execute(stmt, chunk)
        else:  # replace
            await session.execute(table.insert(), chunk)


async def restore(
    session: AsyncSession,
    path: str,
    target_tenant,
    *,
    mode: str = "replace",
    remap_tenant: bool = False,
    created_by=None,
    backup_record_id=None,
) -> dict:
    # Capturamos el id ANTES de cualquier commit/rollback: un rollback expira el
    # objeto ORM y acceder a target_tenant.id después dispararía un lazy-load
    # síncrono (MissingGreenlet) dentro del handler de error.
    tenant_id = target_tenant.id

    manifest, problems, warnings, _tenant_match = await _validate(session, path, tenant_id, remap_tenant)
    if problems:
        raise CartridgeError("; ".join(problems))

    ordered = introspection.cartridge_tables()
    counts_before = {t.name: await _count_current(session, t, tenant_id) for t in ordered}

    # 1) Auto-backup de seguridad (punto de undo). Tiene su propio commit y sobrevive
    #    aunque el restore falle después.
    safety = await exporter.export_tenant(
        session, target_tenant, gfs_tier="safety", trigger="pre_restore", created_by=created_by,
    )

    total_skipped = total_nulled = 0
    try:
        global_ids = await _preload_global_ids(session)

        if mode == "replace":
            for table in introspection.deletion_order(ordered):
                await session.execute(sa.delete(table).where(table.c.tenant_id == tenant_id))

        for table in ordered:
            raw_rows = list(cartridge.iter_table_lines(path, table.name))
            prepared, skipped, nulled = _prepare_rows(table, raw_rows, tenant_id, remap_tenant, global_ids)
            total_skipped += skipped
            total_nulled += nulled
            await _insert_rows(session, table, prepared, mode)

        await session.commit()
    except Exception as exc:
        await session.rollback()
        session.add(BackupRestoreLog(
            backup_record_id=backup_record_id, subject_tenant_id=tenant_id, mode=mode,
            status="failed", counts_before=counts_before, error=str(exc)[:2000], created_by=created_by,
        ))
        await session.commit()
        raise

    counts_after = {t.name: await _count_current(session, t, tenant_id) for t in ordered}
    log = BackupRestoreLog(
        backup_record_id=backup_record_id, subject_tenant_id=tenant_id, mode=mode,
        status="completed", counts_before=counts_before, counts_after=counts_after, created_by=created_by,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)

    return {
        "log_id": str(log.id),
        "safety_backup_id": str(safety.id),
        "mode": mode,
        "counts_before": counts_before,
        "counts_after": counts_after,
        "skipped_rows": total_skipped,
        "nulled_fks": total_nulled,
        "warnings": warnings,
    }
