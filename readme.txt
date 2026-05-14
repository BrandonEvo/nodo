# DOCUMENTACIÓN TÉCNICA DEL SISTEMA: NODO ENTERPRISE

## 1. RESUMEN DEL SISTEMA Y ARQUITECTURA GLOBAL
Nodo es una plataforma SaaS (Software as a Service) multi-inquilino (multi-tenant) diseñada para gestionar empresas, usuarios y módulos de forma escalable. Utiliza una arquitectura de base de datos compartida con aislamiento lógico por identificadores de empresa.

**Patrón de Arquitectura:** 
El sistema sigue una arquitectura cliente-servidor, donde el backend funciona como una API RESTful. Internamente, el backend adopta un patrón basado en **Routers, Servicios y Modelos** (una variante orientada a APIs similar a MVC/MVT):
- **Models (Modelos)**: Entidades y esquemas definidos con SQLModel y Pydantic, representan la capa de datos y validación.
- **Routers/Controllers (Controladores)**: Endpoints de FastAPI que reciben las peticiones, manejan la lógica de negocio apoyándose en dependencias (`deps.py`) y retornan respuestas.
- **Frontend (Vista)**: Una Single Page Application (SPA) que consume la API de manera independiente.

## 2. STACK TECNOLÓGICO Y VERSIONES
El stack está diseñado para alto rendimiento y tipado estricto (TypeScript en frontend y Type Hints en backend):

### Backend
- **Framework**: FastAPI (>=0.110.0, Python 3.10+) - Framework asíncrono basado en Starlette.
- **Servidor ASGI**: Uvicorn (>=0.28.0) - Sirve la aplicación FastAPI.
- **Base de Datos**: PostgreSQL - Motor relacional principal. Driver: `asyncpg` (>=0.29.0) para conexiones no bloqueantes.
- **ORM**: SQLModel (>=0.0.16) - Wrapper sobre SQLAlchemy y Pydantic. Facilita compartir esquemas entre base de datos y API.
- **Migraciones**: Alembic (>=1.13.1) - Control de cambios en los esquemas de base de datos.
- **Autenticación**: `fastapi-users[sqlalchemy]` (>=12.1.2) empleando JWT (JSON Web Tokens) y hashing de contraseñas con `bcrypt`.
- **Seguridad**: `slowapi` (>=0.1.9) para rate limiting.

### Frontend
- **Librería Core**: React (^19.2.0) y ReactDOM (^19.2.0).
- **Lenguaje**: TypeScript (~5.9.3) para seguridad de tipos.
- **Bundler y Tooling**: Vite (^7.3.1) - Reemplaza a Webpack para tiempos de construcción ultrarrápidos.
- **Estilos**: TailwindCSS (^3.4.1) con plugins como `tailwindcss-animate`.
- **Componentes y UI**: `@radix-ui` para primitivas accesibles y `lucide-react` para iconografía.
- **Peticiones HTTP**: Axios (^1.13.6).

### Infraestructura (Docker)
- **Contenerización**: Docker y Docker Compose para levantar todos los servicios unificados. Se usan distintos archivos como `docker-compose.yml` (base), `docker-compose.override.yml` (desarrollo local) y `docker-compose.prod.yml` (producción). Incluye contenedores separados para: Frontend, Backend, PostgreSQL, y un proxy inverso Nginx (en algunos despliegues).

## 3. ARQUITECTURA DE DATOS (M:N) Y MODELOS
### Modelo Base (AuditBase)
Para estandarizar y facilitar la extensión, todas las tablas transaccionales del negocio heredan de un **Modelo Base** (ej. `AuditBase`). Este incluye:
- `id` (UUID principal).
- `tenant_id` (UUID foráneo para relacionar el registro con una empresa).
- Campos de auditoría como `created_at` o `updated_at`.
- `created_by` (UUID foráneo a `users.id` para trazabilidad).
- `is_active` (booleano para borrado lógico).

### Flujo Multi-Tenant (M:N)
El flujo de pertenencia de un usuario al sistema funciona de la siguiente manera:
1. **Tenants (Empresas)**: Entidades raíz. Todo registro de negocio cuelga de un `tenant_id`.
2. **Users (Usuarios)**: Cuentas globales (`users` tabla). Un usuario se registra una vez en toda la plataforma de manera global. Incluye campos OAuth (`google_id`, `full_name`, `picture`) y un campo `onboarding_completed` para rastrear si completó la configuración inicial.
3. **TenantMembers (Membresías)**: Tabla intermedia (`tenant_members`) que vincula un Usuario con una Empresa (Tenant) y le asigna un `role_id` específico dentro de esa empresa. Así, un usuario puede tener el rol "Propietario" en la Empresa A y "Cajero" en la Empresa B usando las mismas credenciales.

### Jerarquía de 3 Niveles de Acceso
El sistema reconoce tres niveles de usuario, resueltos dinámicamente desde la arquitectura M:N:
1. **Súper Admin** (`is_superuser=True`): Control total del sistema. Gestiona empresas, módulos, roles, planes y configuración global.
2. **Admin de Empresa** (Propietario/Administrador): Su rol en `tenant_members` es "Propietario", "Administrador" o "Super Administrador". Puede invitar empleados, gestionar roles y configurar su empresa.
3. **Empleado**: Cualquier otro rol. Solo ve los módulos asignados a su empresa.

**Nota Importante:** El sistema NO almacena `tenant_id` ni `is_tenant_admin` directamente en la tabla `User`. Estos se resuelven en runtime consultando `TenantMember` + `Role`, lo que permite la arquitectura M:N (un usuario en múltiples empresas con roles distintos).

## 4. SISTEMA DE ONBOARDING INTELIGENTE (FTUX)
### Flujo de Enrutamiento Post-Login
Cuando un usuario inicia sesión (JWT o Google OAuth), el sistema ejecuta un árbol de decisión:

1. **¿El usuario NO existe en BD?**
   - Se consulta la tabla `invitations` por su email.
   - *Si TIENE invitación:* Se crea el usuario con `onboarding_completed=True`, se vincula al tenant de la invitación con el rol especificado, y se marca la invitación como `accepted`.
   - *Si NO TIENE invitación (orgánico):* Se crea el usuario con `onboarding_completed=False`, se crea un Tenant provisional ("Empresa de [nombre/email]"), se crea un rol "Propietario", y se asigna la membresía.
2. **¿El usuario SÍ existe en BD?**
   - Se retornan sus datos enriquecidos vía `GET /api/auth/session`.

### Endpoint de Sesión Enriquecida
`GET /api/auth/session` retorna un payload que combina:
- Datos del usuario (id, email, nombre, foto, is_superuser).
- Datos M:N del tenant activo (tenant_id, tenant_name, role_name, is_tenant_admin).
- Estado de onboarding (`onboarding_completed`).
- Invitaciones pendientes (`has_pending_invites`, `pending_invitations[]`).

### Modal de Onboarding (Frontend)
Si `onboarding_completed === false`, el frontend renderiza un `<OnboardingModal />` sobre el AppShell con `backdrop-blur`. Este modal:
- **No se puede cerrar** hasta completar el formulario.
- Pide el nombre real de la empresa (reemplaza el nombre provisional).
- Hace PATCH a `/api/onboarding/complete` que actualiza el Tenant y marca `onboarding_completed = true`.

## 5. SISTEMA DE INVITACIONES DE EMPLEADOS
### Tabla `Invitation`
Hereda de `AuditBase` y contiene:
- `email` (indexado), `tenant_id` (FK), `role_id` (FK).
- `token` (alfanumérico único, generado con `secrets.token_urlsafe(32)`).
- `status` (workflow: `pending` → `accepted` | `rejected` | `revoked`).
- `expires_at` (configurable por el Súper Admin).

### Flujo del Dueño (Admin)
- Panel "Gestión de Equipo" en el dashboard (`/api/invitations/`).
- Formulario: email + selector de rol → POST crea invitación con status `pending`.
- Tabla: muestra todas las invitaciones con badges de status, permite "Reenviar" y "Revocar" si la invitación está pendiente.
- Validaciones: límite configurable de invitaciones pendientes por tenant, no duplicar email+tenant.

### Flujo del Empleado Invitado
- Al hacer login, si tiene invitaciones pendientes (`has_pending_invites=True`), aparece un `<InvitationAcceptanceModal />`.
- Muestra: "La empresa [nombre] te ha invitado como [rol]" con botones Aceptar/Rechazar.
- Aceptar: POST `/api/invitations/{id}/respond` con `{action: "accept"}` → crea `TenantMember`, actualiza status a `accepted`.
- Rechazar: actualiza status a `rejected`.

### Endpoints de Invitaciones
| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | `/api/invitations/` | Crear invitación | Admin del tenant |
| GET | `/api/invitations/` | Listar invitaciones del tenant | Admin del tenant |
| POST | `/api/invitations/{id}/respond` | Aceptar/rechazar | Usuario invitado |
| PATCH | `/api/invitations/{id}/revoke` | Revocar invitación pendiente | Admin del tenant |
| POST | `/api/invitations/{id}/resend` | Reenviar (nuevo token) | Admin del tenant |

## 6. SEGURIDAD Y AISLAMIENTO DE DATOS
Recientemente se implementaron múltiples capas de seguridad:
- **Aislamiento de Datos (Logical RLS)**: Aunque PostgreSQL soporta RLS (Row-Level Security) nativo, el sistema implementa un **RLS Lógico a nivel de aplicación**. Todos los endpoints requieren que se inyecte el `tenant_id` actual mediante la dependencia `get_current_tenant_id` en FastAPI. Cada consulta a la base de datos filtra explícitamente `WHERE tenant_id = :tenant_id`, evitando fuga de datos entre empresas.
- **CORS Dinámico**: Los orígenes permitidos ya no están fijos en el código. Se configuran mediante la variable de entorno `CORS_ORIGINS` (ej: `CORS_ORIGINS="https://mi-dominio.com,https://api.mi-dominio.com"`). Esto evita peticiones no autorizadas desde otros dominios.
- **Rate Limiting (Anti-DDoS y Fuerza Bruta)**: Se implementó la librería `slowapi`. Actualmente, el sistema limita globalmente a **100 peticiones por minuto por IP**. Si una IP excede este límite (como en un ataque de fuerza bruta al login), el servidor devuelve un error HTTP 429 (Too Many Requests), protegiendo la disponibilidad de PostgreSQL y FastAPI.
- **Cookie-to-Bearer Middleware**: Para el flujo de Google OAuth, el JWT se entrega en una cookie `HttpOnly`. Un middleware (`CookieToBearerMiddleware`) extrae el token de la cookie y lo inyecta como header `Authorization: Bearer` para que `fastapi-users` lo valide normalmente.

## 7. SISTEMA DE ROLES Y PERMISOS
El sistema utiliza Control de Acceso Basado en Roles (RBAC) con un enfoque granular en módulos:
- **Roles**: Se definen globalmente (por el Superadmin) o localmente (creados por un admin del tenant, `is_custom=True`).
- **Roles especiales**: "Propietario" es el rol canónico de dueño de empresa. "Administrador" y "Super Administrador" también tienen privilegios de admin.
- **RoleModuleAccess**: Una tabla que cruza un `role_id` con un `module_id` (ej. Módulo de Inventarios) y define booleanos explícitos de permisos: `can_read`, `can_write`, `can_delete`.
- **Módulos y Subscripciones**: Las empresas se suscriben a módulos (`tenant_modules`). Los roles de esa empresa dictan quién puede usar dicho módulo basado en los accesos configurados.

## 8. PARAMETRIZACIÓN DEL SÚPER ADMIN
La tabla `platform_config` (key-value) permite configurar parámetros globales sin requerir recompilación:
- `invitation_token_validity_days` (default: 7): Días de validez de un token de invitación.
- `max_pending_invitations_per_tenant` (default: 50): Límite máximo de invitaciones pendientes por empresa.

Estos valores se gestionan desde el panel Súper Admin → Configuración de Plataforma (`GET/PATCH /api/admin/config/`).

## 9. GUÍA PARA EL PROGRAMADOR (EXTENSIBILIDAD)

### Comandos Frecuentes (Docker y Alembic)
- **Levantar el entorno completo**:
  `docker-compose up -d --build`
- **Bajar el entorno**:
  `docker-compose down`
- **Crear una nueva migración de BD (después de cambiar un modelo)**:
  `docker-compose exec backend alembic revision --autogenerate -m "añadir_nueva_tabla"`
- **Aplicar migraciones a la Base de Datos**:
  `docker-compose exec backend alembic upgrade head`

### Flujo Completo: Cómo crear una nueva Tabla (Ej: "Productos")

1. **Crear el Modelo (backend/models/products.py)**
   Crea un archivo o edita uno existente asegurando que herede de `AuditBase` e incluya `tenant_id`.
   ```python
   import uuid
   from sqlmodel import Field
   from .mixins import AuditBase

   class Product(AuditBase, table=True):
       __tablename__ = "products"
       
       id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
       tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
       name: str = Field(max_length=150)
       price: float = Field(default=0.0)
   ```

2. **Registrar el Modelo**
   Asegúrate de importar `Product` en `backend/models/__init__.py` para que Alembic lo detecte.

3. **Generar y Aplicar Migración**
   Ejecuta en consola:
   `docker-compose exec backend alembic revision --autogenerate -m "tabla_productos"`
   `docker-compose exec backend alembic upgrade head`

4. **Crear el Schema (backend/models/schemas.py)**
   Crea Pydantic models para validar la entrada/salida:
   ```python
   from pydantic import BaseModel
   import uuid

   class ProductCreate(BaseModel):
       name: str
       price: float

   class ProductRead(ProductCreate):
       id: uuid.UUID
       tenant_id: uuid.UUID
   ```

5. **Crear el Endpoint (backend/api/routers/products.py)**
   Crea el router, *siempre* filtrando e insertando el `tenant_id` del usuario autenticado:
   ```python
   from fastapi import APIRouter, Depends
   from sqlalchemy.ext.asyncio import AsyncSession
   from db.session import get_session
   from models import Product
   from api.deps import get_current_tenant_id

   router = APIRouter()

   @router.post("/", response_model=ProductRead)
   async def create_product(
       product: ProductCreate, 
       tenant_id: uuid.UUID = Depends(get_current_tenant_id),
       db: AsyncSession = Depends(get_session)
   ):
       db_obj = Product(**product.dict(), tenant_id=tenant_id)
       db.add(db_obj)
       await db.commit()
       await db.refresh(db_obj)
       return db_obj
   ```

6. **Registrar el Endpoint**
   En `backend/main.py`:
   ```python
   from api.routers import products
   app.include_router(products.router, prefix="/api/products", tags=["Productos"])
   ```

### Cómo crear una nueva Pantalla en Frontend
1. En `frontend/src/pages/` crea `ProductsPage.tsx`.
2. Añade la ruta en `frontend/src/App.tsx` o tu router principal.
3. Utiliza la librería de peticiones (Axios/Fetch) asegurándote de que el JWT viaja en los headers (o que la cookie está configurada).

### Estructura de Archivos del Backend
```
backend/
├── main.py                      # Punto de entrada FastAPI + registro de routers
├── seed.py                      # Script de datos iniciales
├── core/
│   ├── auth.py                  # Configuración JWT (BearerTransport + JWTStrategy)
│   ├── config.py                # Variables de entorno (Settings)
│   └── security_utils.py        # Hash/verificación de passwords
├── db/
│   └── session.py               # Motor async + fábrica de sesiones
├── api/
│   ├── deps.py                  # Dependencias: fastapi_users, RLS middleware
│   ├── manager.py               # UserManager (fastapi-users)
│   └── routers/
│       ├── auth.py              # Registro de workspace (JWT)
│       ├── auth_google.py       # Google OAuth 2.0 con lógica M:N + onboarding
│       ├── session.py           # GET /api/auth/session (sesión enriquecida)
│       ├── invitations.py       # CRUD de invitaciones de equipo
│       ├── onboarding.py        # PATCH /api/onboarding/complete
│       ├── platform_config.py   # Configuración global del Súper Admin
│       ├── tenant_me.py         # Rutas del admin del tenant (M:N)
│       ├── tenants.py           # CRUD de empresas (SuperAdmin)
│       ├── roles.py             # CRUD de roles (RLS)
│       ├── tenant_members.py    # Membresías M:N
│       ├── modules.py           # CRUD de módulos (SuperAdmin)
│       ├── plans.py             # Planes de suscripción
│       └── tenant_modules.py    # Módulos asignados a tenants
└── models/
    ├── __init__.py              # Registro central de modelos
    ├── mixins.py                # AuditBase (created_at, updated_at, is_active)
    ├── users.py                 # User (+ onboarding_completed)
    ├── tenants.py               # Tenant, Subscription, PlanModule, SubscriptionPlan
    ├── iam.py                   # Role, TenantMember, RoleModuleAccess
    ├── invitations.py           # Invitation (status workflow)
    ├── platform_config.py       # PlatformConfig (key-value global)
    ├── core.py                  # Module
    ├── audit.py                 # AuditLog
    └── schemas.py               # Pydantic schemas (UserRead, SessionRead, InvitationRead, etc.)
```

### Estructura de Archivos del Frontend
```
frontend/src/
├── App.tsx                              # Estado global de auth + modales de onboarding/invitaciones
├── main.tsx                             # Punto de entrada React
├── lib/
│   ├── api.ts                           # Axios client (withCredentials + token interceptor)
│   └── utils.ts                         # Utilidades
├── services/
│   ├── auth.service.ts                  # login, me, session (enriquecida), registerWorkspace
│   ├── invitations.service.ts           # CRUD invitaciones
│   ├── onboarding.service.ts            # Completar onboarding
│   ├── modules.service.ts               # Módulos activos
│   ├── tenantMe.service.ts              # Admin de tenant: roles, users
│   ├── tenants.service.ts               # CRUD tenants (SuperAdmin)
│   └── subscriptions.service.ts         # Suscripciones
└── components/
    ├── OnboardingModal.tsx               # FTUX modal (3 pasos, no cerrable)
    ├── InvitationAcceptanceModal.tsx      # Modal aceptar/rechazar invitaciones
    ├── AppShell.tsx                      # Layout principal (sidebar + topbar + canvas)
    ├── Login.tsx                         # Pantalla de login/registro
    ├── OrgSelector.tsx                   # Selector de organización
    ├── Launcher.tsx                      # Lanzador rápido
    ├── navigation/
    │   ├── Sidebar.tsx                   # Navegación desktop (colapsable)
    │   ├── Topbar.tsx                    # Barra superior (impersonación)
    │   └── BottomNav.tsx                 # Navegación móvil
    ├── dashboard/
    │   └── DashboardCanvas.tsx           # Router de vistas internas + PlatformConfigPanel
    └── admin/
        ├── AdminTenants.tsx              # CRUD empresas
        ├── AdminModules.tsx              # CRUD módulos
        ├── AdminUsers.tsx                # CRUD usuarios
        ├── AdminRoles.tsx                # CRUD roles
        ├── AdminSubscriptions.tsx        # CRUD planes
        └── TeamManagement.tsx            # Panel de invitaciones del tenant admin
```

## 10. CAPACIDAD DE CONCURRENCIA
Con la configuración asíncrona de `FastAPI` (junto con Uvicorn/Gunicorn) y `asyncpg` para PostgreSQL, Nodo puede escalar horizontalmente en múltiples contenedores. La limitación no será el CPU, sino la RAM y el número de conexiones a PostgreSQL (que se soluciona fácilmente utilizando PgBouncer o servicios similares si la demanda excede los miles de usuarios simultáneos).
