# El orden importa poco mientras todos sean importados aquí
from .mixins import AuditBase
from .core import Module
from .users import User
from .tenants import Tenant, Subscription, SubscriptionPlan, PlanModule
from .iam import TenantMember, TenantMemberModuleAccess
from .audit import AuditLog
from .invitations import Invitation
from .platform_config import PlatformConfig
from .importaciones import ImportCotizacion, ImportCliente
from .bakery import (
    InventoryItem,
    Recipe,
    RecipeIngredient,
    ProductionOrder,
    WasteLog,
    Sale,
    SaleItem,
    ShiftRegister,
)
from .store import (
    StoreSettings,
    StoreProduct,
    StoreOrder,
    StoreOrderItem,
    StoreStockMove,
    StorePromotion,
)
from .citas import (
    BookingSettings,
    BookingService,
    BookingHour,
    BookingException,
    BookingAppointment,
    BookingOffer,
)
from .billing import BillingRequest

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
    # Importaciones
    "ImportCotizacion",
    "ImportCliente",
    # Bakery modules
    "InventoryItem",
    "Recipe",
    "RecipeIngredient",
    "ProductionOrder",
    "WasteLog",
    "Sale",
    "SaleItem",
    "ShiftRegister",
    # Ventas (catálogo público)
    "StoreSettings",
    "StoreProduct",
    "StoreOrder",
    "StoreOrderItem",
    "StoreStockMove",
    "StorePromotion",
    # Citas (agenda pública)
    "BookingSettings",
    "BookingService",
    "BookingHour",
    "BookingException",
    "BookingAppointment",
    "BookingOffer",
    # Billing (suscripción del tenant)
    "BillingRequest",
]