# Tabla: MODULES
import uuid
from typing import List, Optional
from sqlmodel import Field, Relationship
from .mixins import AuditBase

class Module(AuditBase, table=True):
    __tablename__ = "modules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    code: str = Field(max_length=100, unique=True, index=True) # Ej: INVENTORY, POS
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    is_premium: bool = Field(default=False)

    # Relación a las suscripciones activas de este módulo
    subscriptions: List["Subscription"] = Relationship(back_populates="module")