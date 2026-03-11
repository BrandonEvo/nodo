from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    SECRET_KEY: str
    DATABASE_URL: str

    # Permite leer del archivo .env local, pero las variables de Docker (OS) tienen prioridad
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()