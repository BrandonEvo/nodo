from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    # Flag Secure de las cookies de sesión. DEBE ser False mientras se sirva por
    # HTTP plano (el navegador descarta cookies Secure sin TLS). Poner en True
    # solo cuando el sitio esté detrás de HTTPS.
    COOKIE_SECURE: bool = False
    # Logging verboso de cada sentencia SQL. Off por defecto: en este VM pequeño
    # el echo añade overhead notable por request. Activar solo para depurar.
    SQL_ECHO: bool = False
    SECRET_KEY: str
    DATABASE_URL: str
    SUPERADMIN_PASSWORD_HASH: str
    RESET_PASSWORD_SECRET: str
    VERIFICATION_TOKEN_SECRET: str
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_CLIENT_ID: str = "833836638249-q9p0ahfn0l4h938ui8acd8psksb08no5.apps.googleusercontent.com"
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY_PEM: str = ""
    VAPID_CONTACT_EMAIL: str = "admin@nodo.app"
    # Relay residencial de scraping de Amazon (la IP del datacenter está bloqueada).
    # Si AMAZON_RELAY_URL está vacío, el backend hace scraping directo (best-effort).
    AMAZON_RELAY_URL: str = ""
    AMAZON_RELAY_TOKEN: str = ""
    # WebAuthn / Passkeys (Face ID, huella, Windows Hello, PIN del dispositivo).
    # RP_ID = dominio registrable; ORIGIN = URL completa del frontend. En prod:
    # WEBAUTHN_RP_ID=hellonodo.com, WEBAUTHN_ORIGIN=https://hellonodo.com
    WEBAUTHN_RP_ID: str = "localhost"
    WEBAUTHN_RP_NAME: str = "Nodo"
    WEBAUTHN_ORIGIN: str = "http://localhost:5173"
    # Directorio de backups (bind-mount al host en prod). El widget de disco mide
    # este path con statvfs → cruza al filesystem real del host. RAM/versión de
    # Docker las escribe un timer del host en {BACKUP_DIR}/status.json.
    BACKUP_DIR: str = "/backups"
    # Versión del Docker del host, inyectada en el deploy (el contenedor no puede
    # leerla sin exponer el docker.sock). Fallback a status.json si está vacía.
    DOCKER_VERSION: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # En Docker las variables de entorno ya están cargadas, no necesitamos buscar un archivo .env interno
    model_config = SettingsConfigDict(extra="ignore")

settings = Settings()