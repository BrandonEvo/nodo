"""Driver de almacenamiento local: cartuchos en el volumen del host (bind-mount)."""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import BinaryIO, Optional


class LocalStorage:
    name = "local"

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _full(self, key: str) -> Path:
        # `key` es una ruta relativa controlada por nosotros (nunca input del usuario).
        return self.root / key

    def save(self, key: str, src_path: str) -> str:
        dst = self._full(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        # move si es el mismo filesystem; si cruza dispositivos, shutil.move copia y borra.
        shutil.move(src_path, dst)
        os.chmod(dst, 0o640)
        return key

    def open(self, key: str) -> BinaryIO:
        return open(self._full(key), "rb")

    def delete(self, key: str) -> None:
        try:
            self._full(key).unlink()
        except FileNotFoundError:
            pass

    def exists(self, key: str) -> bool:
        return self._full(key).is_file()

    def local_path(self, key: str) -> Optional[str]:
        p = self._full(key)
        return str(p) if p.is_file() else None
