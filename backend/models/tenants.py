# Tablas: TENANTS, SUBSCRIPTIONS
import uuid
from datetime import datetime
from typing import List, Optional
from sqlmodel import Field, Relationship
from sqlalchemy import Column, JSON, Text
from .mixins import AuditBase

class Tenant(AuditBase, table=True):
    __tablename__ = "tenants"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255, index=True)
    
    # Apariencia y Branding
    logo_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    theme_color: Optional[str] = Field(default="#69E7A8", max_length=50)

    # Control de Facturación (Stripe)
    stripe_customer_id: Optional[str] = Field(default=None, max_length=255, unique=True, index=True)
    billing_status: str = Field(default="trialing", max_length=50)
    trial_ends_at: Optional[datetime] = Field(default=None)
    current_period_end: Optional[datetime] = Field(default=None)
    # Plan de suscripción asignado (opcional si es trial o free tier sin plan)
    plan_id: Optional[uuid.UUID] = Field(default=None, foreign_key="subscription_plans.id", index=True)

    # Tenant del sistema — jamás se puede desactivar ni eliminar
    is_system: bool = Field(default=False)

    # Relaciones
    members: List["TenantMember"] = Relationship(back_populates="tenant")
    subscriptions: List["Subscription"] = Relationship(back_populates="tenant")

class Subscription(AuditBase, table=True):
    __tablename__ = "subscriptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id", index=True)
    
    stripe_subscription_id: Optional[str] = Field(default=None, max_length=255, unique=True, index=True)
    status: str = Field(default="active", max_length=50)
    assigned_at: datetime = Field(default_factory=datetime.utcnow)

    tenant: Tenant = Relationship(back_populates="subscriptions")
    module: "Module" = Relationship(back_populates="subscriptions")

class PlanModule(AuditBase, table=True):
    __tablename__ = "plan_modules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    plan_id: uuid.UUID = Field(foreign_key="subscription_plans.id", index=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id", index=True)

class SubscriptionPlan(AuditBase, table=True):
    __tablename__ = "subscription_plans"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255, index=True)
    price: float = Field(default=0.0)
    currency: str = Field(default="GTQ", max_length=10)

    # Copy de marketing — lo consume la landing pública vía /api/public/plans.
    # Vive en la BD para que el superadmin edite la página de precios sin deploy.
    tagline: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    features: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    badge_label: Optional[str] = Field(default=None, max_length=40)
    cta_label: Optional[str] = Field(default=None, max_length=40)
    is_featured: bool = Field(default=False)
    billing_period: str = Field(default="month", max_length=20)
    sort_order: int = Field(default=0)
    # Un plan puede existir para cobrar y no anunciarse. Default False a propósito:
    # la migración no debe publicar planes internos que ya existan en producción.
    is_public: bool = Field(default=False)