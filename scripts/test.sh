#!/usr/bin/env bash
# Corre la suite en un contenedor descartable.
#
# Dos precauciones que NO son opcionales en este host:
#   --entrypoint sh  → el entrypoint de la imagen corre `alembic upgrade head` y los
#                      seeds; sin esto, lanzar los tests le aplica migraciones a la
#                      base de PRODUCCIÓN.
#   tests/unit       → por defecto sólo los tests puros, que no tocan la base. La
#                      suite de integración crea un tenant real (ver conftest.py).
#
#   ./scripts/test.sh              → sólo los puros (seguro, ~1s)
#   ./scripts/test.sh tests        → todo, incluida la integración que escribe en la BD
set -euo pipefail

cd "$(dirname "$0")/.."
TARGET="${1:-tests/unit}"

exec docker run --rm --entrypoint sh \
  --network nodo_nodo_network \
  --env-file .env \
  -v "$PWD/backend":/app -w /app -e PYTHONPATH=/app \
  nodo-backend \
  -c "pip install -q pytest pytest-asyncio 2>/dev/null; python -m pytest ${TARGET} -q -p no:warnings"
