# Tabla: BILLING_REQUESTS (solicitudes de suscripción — flujo de pago manual)
import uuid
from typing import Optional
from sqlmodel import Field
from .mixins import AuditBase


class BillingRequest(AuditBase, table=True):
    __tablename__ = "billing_requests"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    plan_id: uuid.UUID = Field(foreign_key="subscription_plans.id", index=True)

    # pending → (admin) confirmed | rejected ; cancelled = el tenant la retiró/reemplazó
    status: str = Field(default="pending", max_length=20, index=True)
    note: Optional[str] = Field(default=None, max_length=500)
