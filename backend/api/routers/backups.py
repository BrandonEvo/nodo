"""
MÓDULO: BACKUPS (Cartuchera) — export/import por empresa. Solo Súper Admin.

  GET   /api/admin/backups/settings              → config de backup (singleton)
  PATCH /api/admin/backups/settings              → actualizar config
  GET   /api/admin/backups/records               → historial de cartuchos
  POST  /api/admin/backups/export/{tenant_id}    → generar cartucho de una empresa
  GET   /api/admin/backups/records/{id}/download → descargar el .nodocart

Corre como nodo_admin (get_session, RLS bypass) porque toca datos de todos los
tenants; el scoping por-tenant se hace en código (exporter). El import/restore
seguro se agrega en la fase siguiente.
"""
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.deps import fastapi_users
from core.limiter import limiter
from core.security_utils import verify_superadmin_password
from db.session import get_session
from models import User, Tenant
from models.backup import BackupRecord, BackupRestoreLog, BackupSettings

from api.services.backup import exporter, importer, scheduler
from api.services.backup.storage import get_driver

# Tope del cartucho subido (anti zip-bomb / subida abusiva).
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

router = APIRouter(tags=["Admin: Backups (Cartuchera)"])

current_superuser = fastapi_users.current_user(active=True, superuser=True)


# ── Schemas ───────────────────────────────────────────────────────────────────

class BackupRecordRead(BaseModel):
    id: uuid.UUID
    subject_tenant_id: Optional[uuid.UUID]
    kind: str
    gfs_tier: str
    trigger: str
    schema_revision: Optional[str]
    filename: str
    storage_driver: str
    size_bytes: int
    checksum_sha256: Optional[str]
    table_counts: Optional[dict]
    status: str
    error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class BackupSettingsRead(BaseModel):
    id: uuid.UUID
    enabled: bool
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    scope: str
    selected_tenants: Optional[list]
    storage_driver: str
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]

    class Config:
        from_attributes = True


class BackupSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    keep_daily: Optional[int] = None
    keep_weekly: Optional[int] = None
    keep_monthly: Optional[int] = None
    scope: Optional[str] = None
    selected_tenants: Optional[list] = None
    storage_driver: Optional[str] = None


class RestoreRecordBody(BaseModel):
    password: str
    mode: str = "replace"                       # replace | merge
    remap_tenant: bool = False
    target_tenant_id: Optional[uuid.UUID] = None  # por defecto: el tenant del cartucho


class RestoreLogRead(BaseModel):
    id: uuid.UUID
    backup_record_id: Optional[uuid.UUID]
    subject_tenant_id: Optional[uuid.UUID]
    mode: str
    status: str
    counts_before: Optional[dict]
    counts_after: Optional[dict]
    error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


def _normalize_mode(mode: str) -> str:
    return mode if mode in ("replace", "merge") else "replace"


def _save_upload(file: UploadFile) -> str:
    """Guarda el cartucho subido en un archivo temporal, con tope de tamaño."""
    fd, tmp = tempfile.mkstemp(suffix=".nodocart")
    written = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="El cartucho supera el tamaño máximo permitido.")
                out.write(chunk)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return tmp


async def _record_path(record: BackupRecord) -> tuple[str, Optional[str]]:
    """Ruta local del cartucho de un registro. Devuelve (path, temp_a_borrar_o_None)."""
    driver = get_driver(record.storage_driver)
    if not driver.exists(record.storage_key):
        raise HTTPException(status_code=410, detail="El archivo del cartucho ya no está disponible.")
    local = driver.local_path(record.storage_key)
    if local:
        return local, None
    fd, tmp = tempfile.mkstemp(suffix=".nodocart")
    with os.fdopen(fd, "wb") as out, driver.open(record.storage_key) as src:
        shutil.copyfileobj(src, out)
    return tmp, tmp


async def _load_tenant_or_404(session: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return tenant


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_settings(session: AsyncSession) -> BackupSettings:
    result = await session.execute(select(BackupSettings).limit(1))
    settings_row = result.scalars().first()
    if not settings_row:
        settings_row = BackupSettings()
        session.add(settings_row)
        await session.commit()
        await session.refresh(settings_row)
    return settings_row


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=BackupSettingsRead)
async def get_settings(
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create_settings(session)


@router.patch("/settings", response_model=BackupSettingsRead)
async def update_settings(
    body: BackupSettingsUpdate,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    settings_row = await _get_or_create_settings(session)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings_row, field, value)
    session.add(settings_row)
    await session.commit()
    await session.refresh(settings_row)
    return settings_row


@router.get("/records", response_model=List[BackupRecordRead])
async def list_records(
    tenant_id: Optional[uuid.UUID] = None,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(BackupRecord).order_by(BackupRecord.created_at.desc())
    if tenant_id:
        stmt = stmt.where(BackupRecord.subject_tenant_id == tenant_id)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/export/{tenant_id}", response_model=BackupRecordRead)
@limiter.limit("10/minute")
async def export_now(
    request: Request,
    tenant_id: uuid.UUID,
    user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    record = await exporter.export_tenant(
        session, tenant, gfs_tier="manual", trigger="manual", created_by=user.id,
    )
    return record


@router.post("/run-now")
@limiter.limit("3/minute")
async def run_scheduled_now(
    request: Request,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    """Corre la tanda automática (todas las empresas en alcance) + poda, sin esperar al timer."""
    return await scheduler.run_scheduled(session, force=True)


@router.get("/records/{record_id}/download")
async def download_record(
    record_id: uuid.UUID,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    record = await session.get(BackupRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cartucho no encontrado")

    driver = get_driver(record.storage_driver)
    if not driver.exists(record.storage_key):
        raise HTTPException(status_code=410, detail="El archivo del cartucho ya no está disponible")

    local = driver.local_path(record.storage_key)
    if local:
        return FileResponse(local, filename=record.filename, media_type="application/octet-stream")
    return StreamingResponse(
        driver.open(record.storage_key),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{record.filename}"'},
    )


# ── Import / Restore ──────────────────────────────────────────────────────────

@router.get("/restore-logs", response_model=List[RestoreLogRead])
async def list_restore_logs(
    tenant_id: Optional[uuid.UUID] = None,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(BackupRestoreLog).order_by(BackupRestoreLog.created_at.desc()).limit(50)
    if tenant_id:
        stmt = stmt.where(BackupRestoreLog.subject_tenant_id == tenant_id)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/import/preview")
@limiter.limit("20/minute")
async def import_preview(
    request: Request,
    tenant_id: uuid.UUID = Form(...),
    remap: bool = Form(False),
    file: UploadFile = File(...),
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    tmp = _save_upload(file)
    try:
        return await importer.preview(session, tmp, tenant_id, remap=remap)
    except importer.CartridgeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        os.unlink(tmp)


@router.post("/import/restore")
@limiter.limit("5/minute")
async def import_restore(
    request: Request,
    tenant_id: uuid.UUID = Form(...),
    password: str = Form(...),
    mode: str = Form("replace"),
    remap: bool = Form(False),
    file: UploadFile = File(...),
    user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    if not verify_superadmin_password(password):
        raise HTTPException(status_code=403, detail="Contraseña de Súper Admin incorrecta.")
    tenant = await _load_tenant_or_404(session, tenant_id)
    tmp = _save_upload(file)
    try:
        return await importer.restore(
            session, tmp, tenant, mode=_normalize_mode(mode), remap_tenant=remap, created_by=user.id,
        )
    except importer.CartridgeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        os.unlink(tmp)


@router.post("/records/{record_id}/preview")
async def record_preview(
    record_id: uuid.UUID,
    tenant_id: Optional[uuid.UUID] = None,
    remap: bool = False,
    _user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    record = await session.get(BackupRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cartucho no encontrado")
    target = tenant_id or record.subject_tenant_id
    if not target:
        raise HTTPException(status_code=400, detail="Falta la empresa destino.")
    path, cleanup = await _record_path(record)
    try:
        return await importer.preview(session, path, target, remap=remap)
    except importer.CartridgeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        if cleanup:
            os.unlink(cleanup)


@router.post("/records/{record_id}/restore")
@limiter.limit("5/minute")
async def record_restore(
    request: Request,
    record_id: uuid.UUID,
    body: RestoreRecordBody,
    user: User = Depends(current_superuser),
    session: AsyncSession = Depends(get_session),
):
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña de Súper Admin incorrecta.")
    record = await session.get(BackupRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cartucho no encontrado")
    target_id = body.target_tenant_id or record.subject_tenant_id
    if not target_id:
        raise HTTPException(status_code=400, detail="Falta la empresa destino.")
    tenant = await _load_tenant_or_404(session, target_id)
    path, cleanup = await _record_path(record)
    try:
        return await importer.restore(
            session, path, tenant, mode=_normalize_mode(body.mode),
            remap_tenant=body.remap_tenant, created_by=user.id, backup_record_id=record.id,
        )
    except importer.CartridgeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        if cleanup:
            os.unlink(cleanup)
