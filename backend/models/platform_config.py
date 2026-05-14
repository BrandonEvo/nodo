# Tabla: PLATFORM_CONFIG (Configuración Global del Súper Admin)
from sqlmodel import Field, SQLModel

class PlatformConfig(SQLModel, table=True):
    __tablename__ = "platform_config"

    key: str = Field(max_length=100, primary_key=True)
    value: str = Field(max_length=500)
    description: str = Field(default="", max_length=1000)
