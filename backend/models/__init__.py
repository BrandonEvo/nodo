# El orden importa poco mientras todos sean importados aquí
from .mixins import AuditBase
from .core import Module
from .users import User
from .tenants import Tenant, Subscription, SubscriptionPlan, PlanModule
from .iam import TenantMember, TenantMemberModuleAccess
from .audit import AuditLog
from .invitations import Invitation
from .platform_config import PlatformConfig

# Esto expone los modelos para cuando llames a SQLModel.metadata.create_all() o desde env.py de Alembic
__all__ = [
    "AuditBase",
    "Module",
    "User",
    "Tenant",
    "Subscription",
    "SubscriptionPlan",
    "PlanModule",
    "TenantMember",
    "TenantMemberModuleAccess",
    "AuditLog",
    "Invitation",
    "PlatformConfig",
]