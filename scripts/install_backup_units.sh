#!/usr/bin/env bash
# ============================================================
# Instala la infraestructura de backup/monitoreo de Nodo (Fase 1).
# Correr UNA vez, con sudo, en el host de producción:
#
#     sudo bash scripts/install_backup_units.sh
#
# Idempotente: se puede volver a correr. NO toca la base de datos ni los
# contenedores; solo crea el directorio de backups y los systemd units.
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="${REPO_DIR}/deploy/systemd"
BACKUP_ROOT="/var/backups/nodo"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: correr con sudo (necesita crear ${BACKUP_ROOT} y units en /etc/systemd)." >&2
  exit 1
fi

echo "==> 1/4  Creando ${BACKUP_ROOT} (daily/weekly/monthly)..."
mkdir -p "${BACKUP_ROOT}"/{daily,weekly,monthly}
chown -R root:root "${BACKUP_ROOT}"
# Los dumps contienen datos sensibles (hashes, todos los tenants): NO world-readable.
chmod -R 750 "${BACKUP_ROOT}"

echo "==> 2/4  Dando acceso de lectura al usuario del contenedor backend (appuser)..."
APPUID="$(docker exec nodo_backend id -u 2>/dev/null || echo 1000)"
if command -v setfacl >/dev/null 2>&1; then
  # Lectura recursiva de los dumps (el backend calcula tamaños/último backup).
  setfacl -R  -m "u:${APPUID}:rX"  "${BACKUP_ROOT}"
  setfacl -R  -d -m "u:${APPUID}:rX"  "${BACKUP_ROOT}"
  # Escritura SOLO en el directorio raíz, para que el backend pueda crear
  # /backups/.trigger (botón "backup ahora" del panel) sin tocar los dumps.
  setfacl      -m "u:${APPUID}:rwX" "${BACKUP_ROOT}"
  echo "    ACL aplicada para uid ${APPUID}."
else
  echo "    ADVERTENCIA: 'setfacl' no está instalado (paquete 'acl')."
  echo "    Instálalo con: apt-get install -y acl  y vuelve a correr este script."
fi

echo "==> 3/4  Instalando systemd units (sustituyendo la ruta del repo)..."
shopt -s nullglob
for unit in "${UNIT_SRC}"/*.service "${UNIT_SRC}"/*.timer "${UNIT_SRC}"/*.path; do
  dest="/etc/systemd/system/$(basename "${unit}")"
  sed "s|__REPO_DIR__|${REPO_DIR}|g" "${unit}" > "${dest}"
  echo "    → ${dest}"
done
shopt -u nullglob

echo "==> 4/4  Habilitando timers y el watcher del trigger..."
systemctl daemon-reload
systemctl enable --now nodo-status.timer
systemctl enable --now nodo-backup.timer
systemctl enable --now nodo-cartridges.timer
systemctl enable --now nodo-backup-trigger.path

echo ""
echo "============================================================"
echo "Listo. Estado:"
systemctl list-timers 'nodo-*' --no-pager || true
echo ""
echo "  • status.json se refresca cada minuto en ${BACKUP_ROOT}/status.json"
echo "  • Bóveda: pg_dump GFS diario a las 03:30 (abuelo-padre-hijo)"
echo "  • Cartuchera: cartucho por empresa + poda a las 03:45 (si está activado en el panel)"
echo "  • probar un backup ahora:   sudo systemctl start nodo-backup.service"
echo "  • ver el próximo disparo:   systemctl list-timers 'nodo-*'"
echo "============================================================"
