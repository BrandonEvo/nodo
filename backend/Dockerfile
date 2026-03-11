FROM python:3.12-slim

# Mantenemos tus optimizaciones de entorno profesional
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias de sistema: netcat-openbsd es vital para el entrypoint
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Solución al error de passlib/bcrypt en Python 3.12
RUN pip install --no-cache-dir setuptools

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 1. Copiamos TODO el proyecto primero
COPY . .

# 2. Como ROOT, garantizamos permisos de ejecución y cambiamos el dueño
# Esto corrige el error "permission denied" al arrancar el contenedor
RUN chmod +x /app/entrypoint.sh \
    && adduser --disabled-password --gecos "" appuser \
    && chown -R appuser /app

# 3. Cambiamos al usuario de ejecución no privilegiado
USER appuser

# Punto de entrada técnico (asegúrate de que el archivo se llame así)
ENTRYPOINT ["/app/entrypoint.sh"]

# Comando por defecto (pasado como argumentos al entrypoint)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]