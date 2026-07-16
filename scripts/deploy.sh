#!/usr/bin/env bash
# ============================================================
# Despliegue de PRODUCCIÓN de Nodo
# Uso:   bash scripts/deploy.sh
# (si docker requiere sudo:  sudo bash scripts/deploy.sh)
#
# Idempotente: se puede correr varias veces. La generación del hash del
# superadmin solo ocurre la primera vez (mientras el .env tenga el placeholder).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # raíz del proyecto

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Password en claro del superadmin — OBLIGATORIO pasar por variable de entorno.
# Ejemplo:  SUPERADMIN_PASSWORD='miClave' bash scripts/deploy.sh
if [[ -z "${SUPERADMIN_PASSWORD:-}" ]]; then
  echo "ERROR: la variable SUPERADMIN_PASSWORD es obligatoria." >&2
  echo "  Uso:  SUPERADMIN_PASSWORD='miClave' bash scripts/deploy.sh" >&2
  exit 1
fi

echo "==> Verificando Docker..."
docker --version
docker compose version

echo ""
echo "==> 1/4  Construyendo imágenes de producción (backend + proxy)..."
$COMPOSE build

# --- 2. Hash bcrypt del superadmin (solo si el .env tiene el placeholder) ---
if grep -q '__PENDING_BCRYPT_HASH__' .env; then
  echo ""
  echo "==> 2/4  Generando hash bcrypt del superadmin..."
  HASH="$($COMPOSE run --rm --no-deps --entrypoint python backend \
      -c "from passlib.hash import bcrypt; print(bcrypt.hash('${SUPERADMIN_PASSWORD}'))" \
      | tr -d '\r' | tail -n1)"
  if [[ "$HASH" != \$2* ]]; then
    echo "ERROR: no se pudo generar el hash bcrypt. Salida: '$HASH'" >&2
    exit 1
  fi
  # docker-compose interpreta '$' como sustitución de variables: hay que
  # duplicarlos ('$' -> '$$') o el hash llega corrupto al contenedor.
  HASH_ESCAPED="${HASH//\$/\$\$}"
  # '|' como delimitador: el alfabeto bcrypt es ./A-Za-z0-9$ y nunca contiene '|'
  sed -i "s|__PENDING_BCRYPT_HASH__|${HASH_ESCAPED}|" .env
  echo "    Hash escrito en .env (con '\$' escapados)."
else
  echo ""
  echo "==> 2/4  Hash del superadmin ya presente en .env (omitido)."
fi

echo ""
echo "==> 3/4  Compilando el frontend (frontend/dist) con node:20-alpine..."
docker run --rm \
  -v "$(pwd)/frontend":/app -w /app \
  node:20-alpine sh -c "npm ci && npm run build"

echo ""
echo "==> 4/4  Levantando el stack de producción..."
# Versión del Docker del host → la lee el widget de infra del panel admin.
# (El contenedor no puede obtenerla sin exponer el docker.sock.) Se interpola
# en docker-compose.prod.yml al hacer 'up'.
export DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
$COMPOSE up -d

echo ""
echo "==> Estado de los contenedores:"
$COMPOSE ps

echo ""
echo "==> Esperando healthcheck del backend (hasta 60s)..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost/health >/dev/null 2>&1; then
    echo "    OK: el sitio responde en http://localhost/health"
    break
  fi
  sleep 2
done

echo ""
echo "============================================================"
echo "Despliegue finalizado."
echo "  App:        https://hellonodo.com"
echo "  Superadmin: admin@nodo.com"
echo "  Logs:       $COMPOSE logs -f backend"
echo "============================================================"
