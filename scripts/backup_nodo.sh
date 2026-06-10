#!/usr/bin/env bash
# Backup rotativo abuelo-padre-hijo para nodo_db (PostgreSQL en Docker)
#
# Estructura de retención:
#   daily/   → 7 días   (hijo)
#   weekly/  → 4 semanas (padre)   — se crea cada domingo
#   monthly/ → 6 meses  (abuelo)  — se crea el día 1 de cada mes

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
CONTAINER="nodo_db"
DB_USER="nodo_admin"
DB_NAME="nodo_db"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nodo}"

DAILY_KEEP=7
WEEKLY_KEEP=28    # 4 semanas en días
MONTHLY_KEEP=180  # 6 meses en días

LOG_FILE="${LOG_FILE:-/var/log/nodo_backup.log}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

fail() { log "ERROR: $*"; exit 1; }

# ── Verificaciones previas ────────────────────────────────────────────────────
docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" \
  || fail "Container ${CONTAINER} no está corriendo"

mkdir -p "${BACKUP_ROOT}/daily" "${BACKUP_ROOT}/weekly" "${BACKUP_ROOT}/monthly"

# ── Generar dump ──────────────────────────────────────────────────────────────
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
TMP_FILE="${BACKUP_ROOT}/tmp_${TIMESTAMP}.dump"

log "Iniciando pg_dump → ${TMP_FILE}"

docker exec "${CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -Z 6 \
  > "${TMP_FILE}" \
  || fail "pg_dump falló (código $?)"

SIZE=$(du -sh "${TMP_FILE}" | cut -f1)
log "Dump completado — tamaño: ${SIZE}"

# ── Clasificar y mover a la carpeta correcta ──────────────────────────────────
DOW=$(date '+%u')   # 1=lunes … 7=domingo
DOM=$(date '+%d')   # día del mes

DEST_DAILY="${BACKUP_ROOT}/daily/nodo_${TIMESTAMP}.dump"
cp "${TMP_FILE}" "${DEST_DAILY}"
log "Copia diaria guardada: ${DEST_DAILY}"

if [ "${DOW}" = "7" ]; then
  DEST_WEEKLY="${BACKUP_ROOT}/weekly/nodo_${TIMESTAMP}.dump"
  cp "${TMP_FILE}" "${DEST_WEEKLY}"
  log "Copia semanal guardada: ${DEST_WEEKLY}"
fi

if [ "${DOM}" = "01" ]; then
  DEST_MONTHLY="${BACKUP_ROOT}/monthly/nodo_${TIMESTAMP}.dump"
  cp "${TMP_FILE}" "${DEST_MONTHLY}"
  log "Copia mensual guardada: ${DEST_MONTHLY}"
fi

rm -f "${TMP_FILE}"

# ── Rotación: eliminar backups viejos ─────────────────────────────────────────
log "Rotando backups antiguos..."

find "${BACKUP_ROOT}/daily"   -name "*.dump" -mtime +${DAILY_KEEP}   -delete
find "${BACKUP_ROOT}/weekly"  -name "*.dump" -mtime +${WEEKLY_KEEP}  -delete
find "${BACKUP_ROOT}/monthly" -name "*.dump" -mtime +${MONTHLY_KEEP} -delete

# ── Verificar que el dump es legible ─────────────────────────────────────────
docker exec -i "${CONTAINER}" pg_restore --list < "${DEST_DAILY}" > /dev/null 2>&1 \
  && log "Verificación OK — dump válido" \
  || log "ADVERTENCIA: la verificación del dump falló — revisar manualmente"

log "Backup finalizado correctamente"
