"""
Cartuchera — servicios de backup por-empresa (metadata-driven).

Este paquete implementa el backup application-level "cartucho" (.nodocart):
export/import de los datos de UN tenant, con la lista de tablas derivada
automáticamente de `SQLModel.metadata`. Agregar una tabla nueva con columna
`tenant_id` la incorpora al backup sin tocar código aquí — ese es el "hook".

Fase 0: `introspection` (fuente de verdad + guard de cobertura/RLS).
Fase 2: `cartridge` (formato .nodocart), `storage` (driver local) y `exporter`.
Fase 3: `importer` (preview + restore seguro wipe-and-load).
Fase 5: `retention` (poda GFS) y `scheduler` (automático por-empresa).

`scheduler` NO se importa acá: el timer lo corre con `python -m
api.services.backup.scheduler`, y si el paquete ya lo tuviera en sys.modules,
runpy lo ejecutaría una segunda vez como `__main__` (RuntimeWarning + módulo
duplicado). Quien lo necesite hace `from api.services.backup import scheduler`.
"""
from . import cartridge, exporter, importer, introspection, retention, storage

__all__ = [
    "introspection", "cartridge", "exporter", "importer", "storage",
    "retention",
]
