"""
Formato del cartucho `.nodocart` — ZIP portable, metadata-driven.

Estructura del archivo:
    manifest.json          # versión, tenant, revisión de esquema, checksums, conteos
    tables/<tabla>.jsonl   # una fila JSON por línea, en orden de inserción (FK-safe)

La serialización es lossless: UUID → str, datetime/date → ISO 8601, Decimal → str,
bytes → {"__b64__": "..."}. Los valores JSON-nativos (dict/list de columnas JSON,
str base64 de logos) pasan tal cual. La lista de tablas la decide `introspection`,
así que una tabla nueva con tenant_id entra al cartucho sin tocar este archivo.
"""
from __future__ import annotations

import base64
import json
import uuid
import zipfile
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator

from sqlalchemy import types as satypes

FORMAT_VERSION = 1
MANIFEST_NAME = "manifest.json"
TABLES_DIR = "tables"


def encode_value(v: Any) -> Any:
    """Convierte un valor de fila a algo JSON-serializable sin perder información."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"__b64__": base64.b64encode(bytes(v)).decode("ascii")}
    if isinstance(v, (dict, list)):
        return v  # columnas JSON — ya son JSON-nativas
    return str(v)  # fallback defensivo


def dumps_row(row: dict) -> bytes:
    """Una fila → una línea JSONL (bytes, con salto de línea)."""
    encoded = {k: encode_value(v) for k, v in row.items()}
    return (json.dumps(encoded, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def decode_value(v: Any, coltype: Any) -> Any:
    """
    Inversa de encode_value, guiada por el tipo de la columna destino. Necesario
    porque asyncpg exige tipos Python nativos (datetime, uuid.UUID, Decimal…), no
    los strings ISO/base64 del cartucho.
    """
    if v is None:
        return None
    if isinstance(v, dict) and "__b64__" in v:
        return base64.b64decode(v["__b64__"])
    type_name = type(coltype).__name__.lower()
    if isinstance(coltype, getattr(satypes, "Uuid", ())) or "uuid" in type_name:
        return uuid.UUID(v) if isinstance(v, str) else v
    if isinstance(coltype, satypes.DateTime):
        dt = datetime.fromisoformat(v) if isinstance(v, str) else v
        # Normaliza la zona a lo que declara la columna. Algunas columnas guardan
        # datetimes tz-aware pese a ser TIMESTAMP WITHOUT TIME ZONE (drift modelo/DB);
        # asyncpg rechaza mezclar aware/naive, así que alineamos con el tipo destino.
        if isinstance(dt, datetime):
            wants_tz = bool(getattr(coltype, "timezone", False))
            if dt.tzinfo is not None and not wants_tz:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            elif dt.tzinfo is None and wants_tz:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt
    if isinstance(coltype, satypes.Date):
        return date.fromisoformat(v) if isinstance(v, str) else v
    if isinstance(coltype, satypes.Time):
        return time.fromisoformat(v) if isinstance(v, str) else v
    # Numeric (Decimal) pero NO Float: los Decimal viajan como string para no perder precisión.
    if isinstance(coltype, satypes.Numeric) and not isinstance(coltype, satypes.Float):
        return Decimal(v) if isinstance(v, str) else v
    # JSON / String / Boolean / Integer / Float → tal cual (ya son JSON-nativos)
    return v


def table_entry_name(table: str) -> str:
    return f"{TABLES_DIR}/{table}.jsonl"


def read_manifest(cartridge_path: str | Path) -> dict:
    """Lee y parsea manifest.json de un cartucho sin descomprimir el resto."""
    with zipfile.ZipFile(cartridge_path, "r") as zf:
        return json.loads(zf.read(MANIFEST_NAME).decode("utf-8"))


def iter_table_lines(cartridge_path: str | Path, table: str) -> Iterator[dict]:
    """Itera las filas (dicts crudos) de una tabla del cartucho, línea por línea."""
    with zipfile.ZipFile(cartridge_path, "r") as zf:
        try:
            raw = zf.read(table_entry_name(table))
        except KeyError:
            return
        for line in raw.splitlines():
            if line.strip():
                yield json.loads(line)
