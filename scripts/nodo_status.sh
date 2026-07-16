#!/usr/bin/env bash
# Escribe {BACKUP_ROOT}/status.json con métricas que el contenedor backend NO
# puede leer del host por su cuenta (RAM real, versión de Docker, último backup).
# Lo corre un systemd timer del host cada minuto. El backend lo lee para los
# widgets del panel Súper Admin. Escritura atómica (tmp + mv) para no servir un
# JSON a medio escribir.
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nodo}"
OUT="${BACKUP_ROOT}/status.json"
mkdir -p "${BACKUP_ROOT}"

# RAM real del host desde /proc/meminfo (kB → bytes).
read -r MEM_TOTAL_KB MEM_AVAIL_KB < <(
  awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{print t, a}' /proc/meminfo
)
RAM_TOTAL=$(( MEM_TOTAL_KB * 1024 ))
RAM_AVAIL=$(( MEM_AVAIL_KB * 1024 ))

DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"

LAST_DUMP="$(ls -1t "${BACKUP_ROOT}/daily/"*.dump 2>/dev/null | head -n1 || true)"
if [ -n "${LAST_DUMP}" ]; then
  LAST_BACKUP="$(stat -c %Y "${LAST_DUMP}")"
else
  LAST_BACKUP="null"
fi

NOW="$(date +%s)"

TMP="$(mktemp "${BACKUP_ROOT}/.status.XXXXXX")"
cat > "${TMP}" <<JSON
{
  "ram_total": ${RAM_TOTAL},
  "ram_available": ${RAM_AVAIL},
  "docker_version": "${DOCKER_VERSION}",
  "last_backup": ${LAST_BACKUP},
  "generated_at": ${NOW}
}
JSON
chmod 644 "${TMP}"
mv -f "${TMP}" "${OUT}"
