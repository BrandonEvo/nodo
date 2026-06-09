#!/usr/bin/env bash
# ============================================================
# Instala Docker Engine + Docker Compose plugin en Ubuntu 24.04
# Ejecutar como root:   sudo bash scripts/setup-docker.sh
# ============================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecutá este script con sudo:  sudo bash scripts/setup-docker.sh" >&2
  exit 1
fi

# Usuario que invocó sudo (para agregarlo al grupo docker)
TARGET_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"

echo "==> 1/6  Removiendo paquetes Docker viejos (si existen)..."
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  apt-get remove -y "$pkg" 2>/dev/null || true
done

echo "==> 2/6  Instalando dependencias base..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg

echo "==> 3/6  Agregando la GPG key oficial de Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "==> 4/6  Agregando el repositorio de Docker..."
ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

echo "==> 5/6  Instalando Docker Engine + Compose plugin..."
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> 6/6  Habilitando el servicio y configurando el grupo docker..."
systemctl enable --now docker
if [ "$TARGET_USER" != "root" ]; then
  usermod -aG docker "$TARGET_USER"
  echo "    Usuario '$TARGET_USER' agregado al grupo 'docker'."
fi

echo ""
echo "============================================================"
docker --version
docker compose version
echo "============================================================"
echo "Docker instalado correctamente."
echo "IMPORTANTE: para usar 'docker' sin sudo, cerrá sesión y volvé a entrar"
echo "(o ejecutá:  newgrp docker)."
