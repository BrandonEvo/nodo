#!/bin/bash

# Salir si hay errores
set -e

# 1. Esperar a PostgreSQL (Usa el nombre del servicio 'db' definido en tu docker-compose)
echo "Verificando conexión con la base de datos..."
while ! nc -z db 5432; do
  sleep 0.5
done
echo "PostgreSQL está listo."

# 2. Aplicar migraciones automáticamente
echo "Sincronizando esquemas (Alembic)..."
alembic upgrade head

# 3. Ejecutar Seed (Tu script ya es inteligente y no duplica datos)
echo "Ejecutando carga de datos maestros..."
python seed.py

# 4. Iniciar el proceso principal (FastAPI)
# exec "$@" permite que Uvicorn reciba las señales de Docker correctamente
echo "Lanzando servidor..."
exec "$@"