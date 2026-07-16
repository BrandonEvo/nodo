"""Registry de drivers de almacenamiento de cartuchos."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.config import settings

from .base import StorageDriver
from .local import LocalStorage

__all__ = ["StorageDriver", "LocalStorage", "get_driver"]


def get_driver(name: str = "local", config: Optional[dict] = None) -> StorageDriver:
    if name == "local":
        return LocalStorage(Path(settings.BACKUP_DIR) / "cartridges")
    # s3 / r2 se agregan en una fase posterior implementando StorageDriver.
    raise ValueError(f"Driver de almacenamiento no soportado todavía: {name!r}")
