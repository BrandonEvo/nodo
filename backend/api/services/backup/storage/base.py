"""
Driver de almacenamiento de cartuchos — interfaz enchufable.

Hoy solo `local` (volumen del host, bind-mount). En una fase posterior se agrega
`s3`/`r2` implementando este mismo Protocol, sin tocar el exporter ni el router.
"""
from __future__ import annotations

from typing import BinaryIO, Optional, Protocol, runtime_checkable


@runtime_checkable
class StorageDriver(Protocol):
    name: str

    def save(self, key: str, src_path: str) -> str:
        """Guarda el archivo temporal `src_path` bajo `key`. Devuelve la key definitiva."""
        ...

    def open(self, key: str) -> BinaryIO:
        """Abre el cartucho para lectura (streaming de descarga/import)."""
        ...

    def delete(self, key: str) -> None:
        ...

    def exists(self, key: str) -> bool:
        ...

    def local_path(self, key: str) -> Optional[str]:
        """Ruta local si el driver la tiene (permite FileResponse directo); None si no."""
        ...
