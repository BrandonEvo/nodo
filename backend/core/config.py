from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    SECRET_KEY: str
    DATABASE_URL: str
    SUPERADMIN_PASSWORD_HASH: str
    RESET_PASSWORD_SECRET: str
    VERIFICATION_TOKEN_SECRET: str
    DEFAULT_SUPERADMIN_PASSWORD: str = "AdminNodo2026!"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    GOOGLE_CLIENT_SECRET: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # En Docker las variables de entorno ya están cargadas, no necesitamos buscar un archivo .env interno
    model_config = SettingsConfigDict(extra="ignore")

settings = Settings()