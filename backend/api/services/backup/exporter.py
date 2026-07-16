"""
Exporter de la Cartuchera: un tenant → un cartucho `.nodocart`.

Corre como nodo_admin (RLS bypass) vía get_session y filtra por tenant_id en
código. Escribe por streaming a un archivo temporal (no arma todo en RAM) y luego
lo entrega al driver de almacenamiento. `build_tenant_cartridge` es testeable sin
tocar la DB de registros: solo lee las tablas del tenant y produce el archivo.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.backup import BackupRecord

from . import cartridge, introspection
from .storage import get_driver


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "empresa").strip().lower()).strip("-")
    return s[:40] or "empresa"


def _sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _temp_dir() -> Optional[str]:
    # Temp en el mismo filesystem que el almacén → mover el cartucho es un rename.
    return settings.BACKUP_DIR if os.path.isdir(settings.BACKUP_DIR) else None


async def build_tenant_cartridge(
    session: AsyncSession, tenant_id, tenant_name: str, out_path: str
) -> dict:
    """
    Escribe el `.nodocart` de un tenant en `out_path` y devuelve su manifiesto.
    No toca backup_records — sirve para testear la generación de forma aislada.
    """
    schema_revision = await introspection.current_schema_revision(session)
    tables_meta: dict[str, dict] = {}
    total_rows = 0

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for order, table in enumerate(introspection.cartridge_tables()):
            digest = hashlib.sha256()
            count = 0
            stmt = sa.select(table).where(table.c.tenant_id == tenant_id)
            with zf.open(cartridge.table_entry_name(table.name), "w") as entry:
                result = await session.stream(stmt)
                async for row in result.mappings():
                    line = cartridge.dumps_row(dict(row))
                    entry.write(line)
                    digest.update(line)
                    count += 1
            tables_meta[table.name] = {"order": order, "row_count": count, "sha256": digest.hexdigest()}
            total_rows += count

        manifest = {
            "format_version": cartridge.FORMAT_VERSION,
            "generator": "nodo-cartuchera",
            "kind": "tenant",
            "tenant": {"id": str(tenant_id), "name": tenant_name},
            "schema_revision": schema_revision,
            "created_at": _now().isoformat(),
            "total_rows": total_rows,
            "tables": tables_meta,
        }
        zf.writestr(cartridge.MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2))

    return manifest


async def export_tenant(
    session: AsyncSession,
    tenant,
    *,
    gfs_tier: str = "manual",
    trigger: str = "manual",
    created_by=None,
    driver_name: str = "local",
    storage_config: Optional[dict] = None,
) -> BackupRecord:
    """Exporta un tenant, guarda el cartucho vía el driver y registra el BackupRecord."""
    driver = get_driver(driver_name, storage_config)
    timestamp = _now().strftime("%Y%m%d_%H%M%S")
    filename = f"nodocart_{_slug(tenant.name)}_{timestamp}.nodocart"
    key = f"tenant/{tenant.id}/{filename}"

    fd, tmp = tempfile.mkstemp(suffix=".nodocart", dir=_temp_dir())
    os.close(fd)
    try:
        manifest = await build_tenant_cartridge(session, tenant.id, tenant.name, tmp)
        checksum = _sha256_file(tmp)
        size = os.path.getsize(tmp)
        stored_key = driver.save(key, tmp)  # mueve el temp a su lugar definitivo
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

    record = BackupRecord(
        subject_tenant_id=tenant.id,
        kind="tenant",
        gfs_tier=gfs_tier,
        trigger=trigger,
        schema_revision=manifest.get("schema_revision"),
        format_version=cartridge.FORMAT_VERSION,
        filename=filename,
        storage_driver=driver.name,
        storage_key=stored_key,
        size_bytes=size,
        checksum_sha256=checksum,
        table_counts={t: m["row_count"] for t, m in manifest["tables"].items()},
        status="completed",
        created_by=created_by,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record
