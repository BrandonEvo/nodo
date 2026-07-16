"""
MÓDULO: SYSTEM — Métricas de infraestructura para el panel Súper Admin.

  GET /api/admin/system/metrics → disco, RAM, versión de Docker, último backup.

El backend corre aislado en el contenedor `nodo_backend` (sin acceso al host),
así que cada métrica sale de la fuente segura correspondiente:
  - Disco: `shutil.disk_usage(BACKUP_DIR)`. BACKUP_DIR es un bind-mount al host,
    así que statvfs cruza al filesystem real del host (el que se llena con los
    dumps). Sin montar el docker.sock ni `/`.
  - RAM + versión de Docker: las escribe un timer del host en
    `{BACKUP_DIR}/status.json` (el contenedor no puede leerlas por su cuenta).
  - Último backup: se deriva de los archivos reales en `{BACKUP_DIR}/daily`.
"""
import json
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.deps import fastapi_users
from core.config import settings
from models import User

router = APIRouter(tags=["Admin: System"])

current_superuser = fastapi_users.current_user(active=True, superuser=True)

STATUS_FRESH_SECONDS = 300  # status.json escrito hace < 5 min se considera fresco


class DiskMetrics(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_used: float
    path: str
    available: bool


class RamMetrics(BaseModel):
    total_bytes: Optional[int] = None
    available_bytes: Optional[int] = None
    percent_used: Optional[float] = None


class BackupMetrics(BaseModel):
    last_backup_at: Optional[datetime] = None
    daily_count: int = 0
    weekly_count: int = 0
    monthly_count: int = 0
    total_bytes: int = 0


class SystemMetrics(BaseModel):
    disk: DiskMetrics
    ram: RamMetrics
    docker_version: Optional[str] = None
    backups: BackupMetrics
    status_fresh: bool
    generated_at: datetime


def _read_status() -> dict:
    try:
        return json.loads((Path(settings.BACKUP_DIR) / "status.json").read_text())
    except Exception:
        return {}


def _disk_metrics() -> DiskMetrics:
    # Si el bind-mount aún no existe (dev, o pre-deploy), medimos '/' para no fallar.
    target = settings.BACKUP_DIR if os.path.isdir(settings.BACKUP_DIR) else "/"
    try:
        du = shutil.disk_usage(target)
        pct = round(du.used / du.total * 100, 1) if du.total else 0.0
        return DiskMetrics(
            total_bytes=du.total, used_bytes=du.used, free_bytes=du.free,
            percent_used=pct, path=target, available=True,
        )
    except OSError:
        return DiskMetrics(
            total_bytes=0, used_bytes=0, free_bytes=0, percent_used=0.0,
            path=target, available=False,
        )


def _backup_metrics() -> BackupMetrics:
    root = Path(settings.BACKUP_DIR)
    counts = {"daily": 0, "weekly": 0, "monthly": 0}
    total = 0
    newest: Optional[datetime] = None
    for tier in counts:
        directory = root / tier
        if not directory.is_dir():
            continue
        for dump in directory.glob("*.dump"):
            try:
                st = dump.stat()
            except OSError:
                continue
            counts[tier] += 1
            total += st.st_size
            mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
            if newest is None or mtime > newest:
                newest = mtime
    return BackupMetrics(
        last_backup_at=newest, total_bytes=total,
        daily_count=counts["daily"], weekly_count=counts["weekly"],
        monthly_count=counts["monthly"],
    )


def _ram_metrics(status: dict) -> RamMetrics:
    total = status.get("ram_total")
    avail = status.get("ram_available")
    if not isinstance(total, (int, float)) or not total:
        return RamMetrics()
    ram = RamMetrics(total_bytes=int(total))
    if isinstance(avail, (int, float)):
        ram.available_bytes = int(avail)
        ram.percent_used = round((total - avail) / total * 100, 1)
    return ram


def _resolve_docker_version(status: dict) -> Optional[str]:
    version = status.get("docker_version") or settings.DOCKER_VERSION or ""
    return version if version and version != "unknown" else None


@router.get("/metrics", response_model=SystemMetrics)
async def system_metrics(_user: User = Depends(current_superuser)):
    status = _read_status()
    generated_epoch = status.get("generated_at")
    status_fresh = (
        isinstance(generated_epoch, (int, float))
        and (time.time() - generated_epoch) < STATUS_FRESH_SECONDS
    )
    return SystemMetrics(
        disk=_disk_metrics(),
        ram=_ram_metrics(status),
        docker_version=_resolve_docker_version(status),
        backups=_backup_metrics(),
        status_fresh=bool(status_fresh),
        generated_at=datetime.now(timezone.utc),
    )
