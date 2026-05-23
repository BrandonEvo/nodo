# DOCUMENTACIÓN TÉCNICA — NODO ENTERPRISE
Versión API: 2.0.0 | Última revisión: 2026-05-18

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 1. RESUMEN Y PROPÓSITO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nodo es una plataforma SaaS (Software as a Service) multi-tenant diseñada para
gestionar empresas, usuarios, roles y módulos de negocio de forma escalable.
Utiliza una base de datos compartida con aislamiento lógico por `tenant_id`.

La plataforma combina dos capas:
  1. CORE (infraestructura SaaS): autenticación, multi-tenancy, roles,
     invitaciones, suscripciones, configuración global.
  2. APPS DE NEGOCIO: módulos verticales que cada tenant puede activar
     según su plan — actualmente orientados a panaderías/cafés
     (bodega, recetas, cocina, mostrador, cierre) más utilidades
     adicionales (autos, calculadora, importaciones).

Casos de uso: cualquier sistema que requiera que múltiples empresas (tenants)
operen de forma independiente sobre la misma infraestructura, con usuarios
que pueden pertenecer a varias empresas simultáneamente con roles distintos
en cada una.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 2. STACK TECNOLÓGICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Backend
  - Framework:     FastAPI >= 0.110.0 (Python 3.10+, ASGI asíncrono)
  - Servidor:      Uvicorn >= 0.28.0
  - Base de datos: PostgreSQL 16 — driver asyncpg >= 0.29.0
  - ORM:           SQLModel >= 0.0.16 (SQLAlchemy + Pydantic unificados)
  - Migraciones:   Alembic >= 1.13.1
  - Auth:          fastapi-users[sqlalchemy] >= 12.1.2 (JWT + Google OAuth)
  - Seguridad:     slowapi >= 0.1.9 (rate limiting), passlib[bcrypt]
  - HTTP interno:  httpx >= 0.27.0

### Frontend
  - Core:          React 19 + ReactDOM
  - Lenguaje:      TypeScript ~5.9.3
  - Bundler:       Vite >= 7.3.1
  - Estilos:       TailwindCSS 3.4+ con tailwindcss-animate
  - Componentes:   @radix-ui (primitivas accesibles) + lucide-react (iconos)
  - HTTP:          Axios >= 1.13.6
  - Lazy loading:  Apps de negocio cargadas con React.lazy + dynamic import

### Infraestructura
  - Docker + Docker Compose
  - docker-compose.yml           → definición base de servicios
  - docker-compose.override.yml  → configuración para desarrollo local (hot-reload)
  - docker-compose.prod.yml      → configuración de producción
  - nginx/                       → reverse proxy en producción


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 3. ARQUITECTURA GENERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Patrón: cliente-servidor. El backend expone una REST API que la SPA consume.
Internamente el backend sigue Router → Deps → Model (similar a MVC/MVT).

  [ React SPA :5173 ]
         │  HTTP + JWT
         ▼
  [ FastAPI :8000 ]
    ├── main.py          → punto de entrada, middlewares, registro de routers
    ├── api/deps.py      → dependencias reutilizables (auth, RLS, tenant_id)
    ├── api/helpers.py   → utilidades compartidas entre módulos de negocio
    ├── api/routers/     → endpoints por dominio (core + apps de negocio)
    ├── models/          → entidades SQLModel + schemas Pydantic
    └── core/            → config, auth JWT, utils de seguridad
         │  asyncpg (async)
         ▼
  [ PostgreSQL 16 ]


Middlewares aplicados en orden (main.py):
  1. SlowAPIMiddleware   → rate limiting global 100 req/min/IP
  2. CORSMiddleware      → orígenes configurables via CORS_ORIGINS
  3. CookieToBearerMiddleware → transforma cookie OAuth en header Authorization


Frontend — Registro de Apps (frontend/src/apps/index.ts):
Cada app de negocio se registra en un `appRegistry` que mapea
`frontend_route` (clave en BD del Module) → componente React lazy-loaded.
El AppShell resuelve la app activa según los módulos suscritos por el tenant.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 4. MODELO DE DATOS Y ARQUITECTURA M:N MULTI-TENANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### AuditBase (models/mixins.py)
Clase base de la que heredan TODAS las tablas transaccionales de negocio:

  class AuditBase(SQLModel):
      created_at:  datetime    # timestamp UTC automático
      updated_at:  datetime    # timestamp UTC automático
      created_by:  UUID | None # FK → users.id (trazabilidad)
      is_active:   bool        # borrado lógico (default True)

Cada tabla de negocio añade además su propio `id` (UUID PK) y `tenant_id` (FK).

### Relación M:N (Usuario ↔ Empresa)

  ┌──────────┐         ┌────────────────┐         ┌─────────┐
  │  users   │ ──────► │ tenant_members │ ◄─────── │ tenants │
  │ (global) │         │  (intermedia)  │         │         │
  └──────────┘         │  - user_id     │         └─────────┘
                       │  - tenant_id   │
                       │  - role_id     │
                       └────────────────┘

Un usuario se registra UNA sola vez en la plataforma (tabla `users`).
Puede pertenecer a N empresas con roles distintos en cada una.
El `tenant_id` NUNCA se almacena en `users`; siempre se resuelve en runtime
consultando `tenant_members` + `roles`.

### Jerarquía de Acceso (3 niveles)
  1. Súper Admin     → is_superuser=True en users. Control total del sistema.
  2. Admin de Tenant → role "Propietario" / "Administrador" en tenant_members.
  3. Empleado        → cualquier otro rol. Solo ve módulos asignados.

### Modelos del CORE
  models/users.py          → User (+ onboarding_completed, google_id, picture)
  models/tenants.py        → Tenant, SubscriptionPlan, PlanModule, Subscription
  models/iam.py            → Role, TenantMember, RoleModuleAccess
  models/invitations.py    → Invitation (workflow: pending→accepted|rejected|revoked)
  models/core.py           → Module (módulos de negocio del sistema)
  models/platform_config.py→ PlatformConfig (key-value para Súper Admin)
  models/audit.py          → AuditLog
  models/schemas.py        → Schemas Pydantic (UserRead, SessionRead, y schemas
                             de TODOS los módulos de negocio)

### Modelos de NEGOCIO (models/bakery.py)
Contiene las entidades de los módulos verticales orientados a panaderías:

  Módulo Bodega:
    - InventoryItem          → insumos con stock, costo unitario, categoría
    - InventoryPriceHistory  → bitácora de cambios de precio
    - StockMovement          → entradas/ajustes con stock resultante

  Módulo Recetas:
    - Recipe                 → producto producible (nombre, rendimiento, costo,
                               precio, instrucciones, temp/tiempo de horneado)
    - RecipeIngredient       → relación N:M Recipe ↔ InventoryItem + cantidad

  Módulo Cocina:
    - ProductionOrder        → orden de producción (recipe + cantidad + estado)
    - WasteLog               → mermas por orden de producción

  Módulo Mostrador:
    - Sale                   → venta (total, método de pago)
    - SaleItem               → línea de venta (recipe + cantidad + precio +
                               freshness_tag: "fresco" | "ayer")

  Módulo Cierre:
    - ShiftRegister          → cierre de turno (efectivo esperado vs real,
                               diferencia, tarjetas, tickets, notas)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 5. MÓDULOS DE NEGOCIO (APPS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cada módulo está implementado como:
  Backend  → backend/api/routers/<modulo>.py (+ modelos en models/bakery.py)
  Frontend → frontend/src/apps/<modulo>/<Modulo>App.tsx (+ service en
             frontend/src/services/<modulo>.service.ts)

El registro central de apps está en frontend/src/apps/index.ts.

### 5.1 BODEGA (frontend_route: "bodega")
Inventario de insumos con historial de precios y movimientos de stock.

Funcionalidades:
  - CRUD de insumos (nombre, unidad, stock actual, stock mínimo, categoría)
  - Ajuste de stock con registro automático en StockMovement
  - Captura de `last_unit_cost` cada vez que se reabastece
  - Historial de precios (InventoryPriceHistory) por insumo
  - Historial de movimientos (entrada/ajuste) por insumo
  - Alertas implícitas de stock bajo (current_stock < minimum_stock)

Endpoints (prefix /api/bodega):
  GET    /items                          Listar insumos
  POST   /items                          Crear insumo
  PATCH  /items/{id}                     Editar insumo
  PATCH  /items/{id}/adjust              Ajustar stock (registra movimiento)
  GET    /items/{id}/price-history       Historial de precios
  GET    /items/{id}/movements           Historial de movimientos
  DELETE /items/{id}                     Eliminar (borrado lógico)

### 5.2 RECETAS (frontend_route: "recetas")
Catálogo de productos producibles. Cada receta enlaza insumos de bodega.

Funcionalidades:
  - CRUD de recetas (nombre, unidad base, rendimiento estimado, costo, precio
    de venta, descripción, instrucciones, temperatura/tiempo de horneado,
    dificultad)
  - Gestión de ingredientes por receta (RecipeIngredient: insumo + cantidad)
  - El costo estimado se recalcula a partir de los ingredientes y su costo
    unitario actual

Endpoints (prefix /api/recetas):
  GET    /                                       Listar recetas
  POST   /                                       Crear receta
  GET    /{id}                                   Detalle con ingredientes
  PATCH  /{id}                                   Editar receta
  DELETE /{id}                                   Eliminar receta
  POST   /{id}/ingredients                       Agregar ingrediente
  PATCH  /{id}/ingredients/{ingredient_id}       Editar cantidad
  DELETE /{id}/ingredients/{ingredient_id}       Quitar ingrediente

### 5.3 COCINA (frontend_route: "cocina")
Órdenes de producción con descuento automático de stock y registro de mermas.

Funcionalidades:
  - Crear órdenes de producción a partir de una receta + cantidad
  - Estados: pending → en_proceso → completed
  - Preview pre-producción: muestra ingredientes requeridos vs stock disponible
  - Al completar la orden: descuenta insumos del inventario, registra
    `actual_units` reales producidas, calcula merma vs rendimiento estimado
  - WasteLog: registrar mermas asociadas a una orden con razón

Endpoints (prefix /api/cocina):
  GET    /orders                       Listar órdenes
  GET    /preview/{recipe_id}          Vista previa de insumos requeridos
  POST   /orders                       Crear orden
  PATCH  /orders/{id}/start            Marcar en proceso
  PATCH  /orders/{id}/complete         Completar (descuenta stock)
  POST   /orders/{id}/waste            Registrar merma
  DELETE /orders/{id}                  Cancelar orden

### 5.4 MOSTRADOR (frontend_route: "mostrador")
Punto de venta (POS) para productos finales.

Funcionalidades:
  - Listar productos disponibles (recetas con stock o producción asociada)
  - Crear ventas multi-línea con SaleItem
  - Etiqueta de frescura por línea: "fresco" | "ayer"
  - Métodos de pago: efectivo / tarjeta / otros
  - Historial de ventas

Endpoints (prefix /api/mostrador):
  GET    /products                     Listar productos vendibles
  POST   /sales                        Registrar venta
  GET    /sales                        Historial de ventas

### 5.5 CIERRE (frontend_route: "cierre")
Cierre de turno con conciliación de caja.

Funcionalidades:
  - Resumen del día en vivo: efectivo, tarjeta, total, tickets, ticket promedio
  - Registro de cierre: efectivo contado vs esperado → diferencia automática
  - Notas opcionales por cierre
  - Historial de los últimos 30 cierres

Endpoints (prefix /api/cierre):
  GET    /summary                      Resumen del día actual
  POST   /                             Cerrar turno (registra ShiftRegister)
  GET    /                             Historial de cierres

### 5.6 AUTOS (frontend_route: "autos")
Calculadora de importación de vehículos USA → Guatemala.
No persiste datos: solo procesa entradas y devuelve un desglose de costos.

Funcionalidades:
  - Matriz de estados USA con costos de grúa y barco hasta puerto Houston
  - Tipo de cambio configurable (default Q8.00/USD)
  - Cálculo de comisiones bancarias, transferencias, almacenaje, SAT (~32%),
    trámite aduanero, placas, tacuacina, agencia
  - Sobrecargos por tamaño de vehículo (normal/mediano/grande)
  - Costo opcional de reparación post-importación

Endpoints (prefix /api/autos):
  GET    /estados                      Estados USA disponibles
  POST   /calcular                     Desglose completo de costos

### 5.7 CALCULADORA (frontend_route: "calc")
Calculadora aritmética simple. Frontend-only, no consume backend.

### 5.8 IMPORTACIONES (frontend_route: "importaciones")
Motor de pricing inteligente (SmartCalculator + pricingEngine).
Frontend-only por ahora — sin endpoints backend dedicados.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 6. SISTEMA DE AUTENTICACIÓN Y ONBOARDING (FTUX)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Métodos de login soportados
  - JWT clásico:   POST /api/auth/jwt/login  (email + password)
  - Google OAuth:  GET  /api/auth/google/login → callback → cookie HttpOnly

### Árbol de decisión post-login

  Login exitoso
       │
       ├─ ¿Usuario NO existe en BD?
       │       │
       │       ├─ ¿Tiene invitación pendiente por email?
       │       │       └─ SÍ → Crear usuario (onboarding_completed=True)
       │       │                  Crear TenantMember con el rol de la invitación
       │       │                  Marcar invitación como "accepted"
       │       │
       │       └─ NO (registro orgánico)
       │               └─ Crear usuario (onboarding_completed=False)
       │                  Crear Tenant provisional ("Empresa de [nombre]")
       │                  Crear rol "Propietario"
       │                  Crear TenantMember
       │
       └─ ¿Usuario SÍ existe?
               └─ Cargar sesión enriquecida → GET /api/auth/session

### Sesión enriquecida: GET /api/auth/session
Retorna en una sola llamada:
  - Datos del usuario (id, email, nombre, foto, is_superuser)
  - Datos del tenant activo (tenant_id, tenant_name, role_name, is_tenant_admin)
  - Estado de onboarding (onboarding_completed)
  - Invitaciones pendientes (has_pending_invites, pending_invitations[])

### Modal de Onboarding (Frontend)
Si onboarding_completed === false, el frontend renderiza <OnboardingModal />
sobre el AppShell con backdrop-blur. El modal:
  - No se puede cerrar hasta completar el formulario
  - Pide el nombre real de la empresa (reemplaza el nombre provisional)
  - Hace PATCH /api/onboarding/complete → actualiza Tenant + onboarding_completed=true


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 7. SISTEMA DE INVITACIONES DE EMPLEADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Tabla Invitation
  - email, tenant_id (FK), role_id (FK)
  - token (secrets.token_urlsafe(32), único)
  - status: pending → accepted | rejected | revoked
  - expires_at (configurable por Súper Admin via platform_config)

### Flujo del Admin de Empresa
  1. Panel "Gestión de Equipo" → formulario email + rol → POST /api/invitations/
  2. Tabla de invitaciones con badges de status
  3. Acciones disponibles sobre invitaciones pendientes: Reenviar / Revocar

### Flujo del Empleado Invitado
  1. Hace login → GET /api/auth/session retorna has_pending_invites=true
  2. Frontend muestra <InvitationAcceptanceModal />
  3. POST /api/invitations/{id}/respond con {action: "accept" | "reject"}
  4. Aceptar → crea TenantMember → usuario entra al tenant

### Endpoints de Invitaciones
  POST   /api/invitations/              Crear invitación          [Admin tenant]
  GET    /api/invitations/              Listar invitaciones        [Admin tenant]
  POST   /api/invitations/{id}/respond  Aceptar o rechazar         [Invitado]
  PATCH  /api/invitations/{id}/revoke   Revocar pendiente          [Admin tenant]
  POST   /api/invitations/{id}/resend   Reenviar (nuevo token)     [Admin tenant]

### Validaciones automáticas
  - No duplicar email + tenant (invitación pendiente activa)
  - Límite de invitaciones pendientes por tenant (ver platform_config)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 8. SEGURIDAD Y AISLAMIENTO DE DATOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### RLS Lógico (Row-Level Security a nivel de aplicación)
Todos los endpoints inyectan el tenant_id del usuario autenticado mediante
la dependencia get_current_tenant_id (api/deps.py). Cada query filtra
explícitamente WHERE tenant_id = :tenant_id. Ningún endpoint de negocio
devuelve datos de otro tenant, sin depender de RLS nativo de PostgreSQL.

### Rate Limiting (slowapi)
Límite global: 100 peticiones / minuto / IP.
Una IP que supere el límite recibe HTTP 429 (Too Many Requests).
Protege contra fuerza bruta en login y ataques DDoS básicos.

### CORS Dinámico
Los orígenes permitidos se configuran via variable de entorno CORS_ORIGINS
(lista separada por comas). No hay orígenes fijos en el código fuente.
Ejemplo: CORS_ORIGINS="https://app.mi-dominio.com,https://api.mi-dominio.com"

### Cookie-to-Bearer Middleware
El flujo de Google OAuth entrega el JWT en una cookie HttpOnly (más segura
que localStorage). CookieToBearerMiddleware extrae el token de la cookie e
inyecta el header Authorization: Bearer para que fastapi-users lo valide
de forma transparente, sin cambios en la lógica de autenticación existente.

### RBAC Granular (Roles + Módulos)
  - Role:             definido globalmente (Superadmin) o por tenant (is_custom=True)
  - RoleModuleAccess: tabla que cruza role_id + module_id con booleanos:
                      can_read, can_write, can_delete
  - TenantModule:     módulos suscritos por cada empresa
  - Combinado: un empleado solo puede acceder a módulos que su empresa tenga
               suscritos Y que su rol tenga habilitados.

### Endpoint de salud
  GET /health → {"status": "ok", "environment": "...", "database": "connected"}
  Útil para healthchecks de Docker, load balancers y monitoreo.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 9. PARAMETRIZACIÓN DEL SÚPER ADMIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

La tabla platform_config almacena pares clave-valor editables en runtime
sin requerir recompilación ni redeployment.

  Clave                              Default  Descripción
  ─────────────────────────────────  ───────  ─────────────────────────────────────
  invitation_token_validity_days     7        Días de validez de un token de invitación
  max_pending_invitations_per_tenant 50       Límite de invitaciones pendientes por tenant

Gestión: panel Súper Admin → Configuración de Plataforma
  GET   /api/admin/config/   → leer configuración actual
  PATCH /api/admin/config/   → actualizar un valor


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 10. VARIABLES DE ENTORNO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copiar .env.example → .env y completar los valores antes de levantar Docker.

  Variable                    Requerida  Descripción
  ──────────────────────────  ─────────  ─────────────────────────────────────────────
  ENVIRONMENT                 Sí         "development" o "production"
                                         En production: /docs y /redoc quedan ocultos.
  SECRET_KEY                  Sí         Clave maestra JWT (mínimo 32 bytes hex).
                                         Generar: openssl rand -hex 32
  DATABASE_URL                Sí         postgresql+asyncpg://user:pass@db:5432/dbname
  POSTGRES_USER               Sí         Usuario de PostgreSQL
  POSTGRES_PASSWORD           Sí         Contraseña de PostgreSQL
  POSTGRES_DB                 Sí         Nombre de la base de datos
  SUPERADMIN_PASSWORD_HASH    Sí         Hash bcrypt del password del superadmin.
                                         Generar: python -c "from passlib.hash import bcrypt; print(bcrypt.hash('mi_pass'))"
  RESET_PASSWORD_SECRET       Sí         Secreto para tokens de reset de contraseña
  VERIFICATION_TOKEN_SECRET   Sí         Secreto para tokens de verificación de email
  CORS_ORIGINS                No         Orígenes permitidos (coma-separados).
                                         Default: http://localhost:5173,http://127.0.0.1:5173
  GOOGLE_CLIENT_SECRET        No         Secreto del cliente OAuth de Google.
                                         Solo requerido si se usa login con Google.

Nota: en desarrollo, VITE_API_URL se configura en docker-compose.override.yml
(default: http://localhost:8000/api). No requiere .env del frontend.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 11. COMANDOS FRECUENTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Docker
  docker-compose up -d --build          Levantar todos los servicios (con rebuild)
  docker-compose up -d                  Levantar sin rebuild
  docker-compose down                   Bajar todos los servicios
  docker-compose down -v                Bajar y eliminar volúmenes (reset de BD)
  docker-compose logs -f backend        Ver logs del backend en tiempo real
  docker-compose logs -f frontend       Ver logs del frontend en tiempo real
  docker-compose ps                     Ver estado de los contenedores

### Alembic (migraciones de BD)
  # Siempre ejecutar desde el host, el comando corre dentro del contenedor backend
  docker-compose exec backend alembic revision --autogenerate -m "descripcion_del_cambio"
  docker-compose exec backend alembic upgrade head
  docker-compose exec backend alembic downgrade -1    # Revertir última migración
  docker-compose exec backend alembic current         # Ver migración activa
  docker-compose exec backend alembic history         # Ver historial de migraciones

### Seeds y utilidades
  docker-compose exec backend python seed.py          Poblar datos iniciales


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 12. ESTRUCTURA DE ARCHIVOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Backend
  backend/
  ├── main.py                        Punto de entrada FastAPI: middlewares + routers
  ├── seed.py                        Script de datos iniciales (roles, módulos, superadmin)
  ├── requirements.txt               Dependencias Python
  ├── Dockerfile                     Imagen del backend
  ├── entrypoint.sh                  Script de inicio (migraciones automáticas + uvicorn)
  ├── alembic.ini                    Configuración de Alembic
  ├── migrations/                    Versiones Alembic (versions/*.py)
  ├── core/
  │   ├── config.py                  Settings (pydantic-settings, lee variables de entorno)
  │   ├── auth.py                    JWT: BearerTransport + JWTStrategy
  │   └── security_utils.py          Hash/verificación de contraseñas (bcrypt)
  ├── db/
  │   └── session.py                 Motor async SQLAlchemy + fábrica de sesiones
  ├── api/
  │   ├── deps.py                    Dependencias centrales: fastapi_users, get_current_tenant_id
  │   ├── helpers.py                 Utilidades compartidas (parseo, cálculos, etc.)
  │   ├── manager.py                 UserManager (fastapi-users: hooks de registro/login)
  │   └── routers/
  │       ├── auth.py                POST /api/auth/workspace (registro con tenant)
  │       ├── auth_google.py         Google OAuth 2.0: login + callback + lógica M:N
  │       ├── session.py             GET /api/auth/session (sesión enriquecida)
  │       ├── invitations.py         CRUD completo de invitaciones de equipo
  │       ├── onboarding.py          PATCH /api/onboarding/complete
  │       ├── platform_config.py     GET/PATCH /api/admin/config/ (Súper Admin)
  │       ├── tenant_me.py           Rutas del admin del tenant (/api/me/*)
  │       ├── tenants.py             CRUD de empresas (Súper Admin)
  │       ├── tenant_members.py      Gestión de membresías M:N
  │       ├── tenant_modules.py      Módulos asignados a cada tenant
  │       ├── modules.py             CRUD de módulos del sistema (Súper Admin)
  │       ├── plans.py               Planes de suscripción
  │       │
  │       │   ── APPS DE NEGOCIO ──
  │       ├── bodega.py              Inventario + precios + movimientos
  │       ├── recetas.py             Recetas + ingredientes
  │       ├── cocina.py              Órdenes de producción + mermas
  │       ├── mostrador.py           Ventas (POS)
  │       ├── cierre.py              Cierre de turno
  │       └── autos.py               Calculadora importación vehículos
  └── models/
      ├── __init__.py                Importación central (Alembic necesita ver todos los modelos)
      ├── mixins.py                  AuditBase (created_at, updated_at, created_by, is_active)
      ├── users.py                   User (onboarding_completed, google_id, full_name, picture)
      ├── tenants.py                 Tenant, SubscriptionPlan, PlanModule, Subscription
      ├── iam.py                     Role, TenantMember, RoleModuleAccess
      ├── invitations.py             Invitation (status workflow)
      ├── platform_config.py         PlatformConfig (key-value)
      ├── core.py                    Module (módulos de negocio)
      ├── audit.py                   AuditLog
      ├── bakery.py                  TODOS los modelos de negocio (bodega, recetas,
      │                              cocina, mostrador, cierre)
      └── schemas.py                 Schemas Pydantic de core y de cada app

### Frontend
  frontend/src/
  ├── App.tsx                        Estado global de auth + árbol de modales (onboarding/invitaciones)
  ├── main.tsx                       Punto de entrada React
  ├── lib/
  │   ├── api.ts                     Axios client (withCredentials=true + interceptor de token)
  │   └── utils.ts                   Utilidades generales
  ├── services/
  │   ├── auth.service.ts            login, me, session enriquecida, registerWorkspace
  │   ├── invitations.service.ts     CRUD de invitaciones
  │   ├── onboarding.service.ts      Completar onboarding
  │   ├── modules.service.ts         Módulos activos del tenant
  │   ├── tenantMe.service.ts        Admin de tenant: roles, miembros
  │   ├── tenants.service.ts         CRUD de tenants (Súper Admin)
  │   ├── subscriptions.service.ts   Gestión de suscripciones
  │   ├── plans.service.ts           Planes de suscripción
  │   │   ── SERVICES DE APPS ──
  │   ├── bodega.service.ts          Inventario
  │   ├── recetas.service.ts         Recetas e ingredientes
  │   ├── cocina.service.ts          Órdenes de producción
  │   ├── mostrador.service.ts       Ventas
  │   ├── cierre.service.ts          Cierre de turno
  │   └── autos.service.ts           Cálculo de importación
  ├── apps/                          REGISTRO DE APPS DE NEGOCIO
  │   ├── index.ts                   appRegistry (frontend_route → componente lazy)
  │   ├── bodega/BodegaApp.tsx
  │   ├── recetas/RecetasApp.tsx + RecipeFormModal.tsx
  │   ├── cocina/CocinaApp.tsx
  │   ├── mostrador/MostradorApp.tsx
  │   ├── cierre/CierreApp.tsx
  │   ├── autos/AutosApp.tsx
  │   ├── calculadora/CalculadoraApp.tsx
  │   └── importaciones/             SmartCalculator + pricingEngine
  └── components/
      ├── OnboardingModal.tsx         Modal FTUX, no cerrable hasta completar
      ├── InvitationAcceptanceModal.tsx Modal para aceptar/rechazar invitaciones
      ├── AppShell.tsx               Layout principal: sidebar + topbar + canvas
      ├── Login.tsx                  Pantalla de login y registro
      ├── OrgSelector.tsx            Selector de organización activa
      ├── Launcher.tsx               Lanzador rápido de módulos
      ├── navigation/
      │   ├── Sidebar.tsx            Navegación desktop (colapsable)
      │   ├── Topbar.tsx             Barra superior
      │   └── BottomNav.tsx          Navegación móvil
      ├── dashboard/
      │   └── DashboardCanvas.tsx    Router de vistas internas + PlatformConfigPanel
      └── admin/
          ├── AdminTenants.tsx       CRUD de empresas
          ├── AdminModules.tsx       CRUD de módulos
          ├── AdminUsers.tsx         CRUD de usuarios
          ├── AdminRoles.tsx         CRUD de roles
          ├── AdminSubscriptions.tsx CRUD de planes
          └── TeamManagement.tsx     Panel de invitaciones del admin de empresa


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 13. GUÍA: AGREGAR UNA NUEVA APP DE NEGOCIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Seguir este orden garantiza consistencia con el patrón del proyecto.

### Paso 1 — Crear el Modelo
Editar backend/models/bakery.py (o crear un archivo dedicado e importarlo en
models/__init__.py). Heredar de AuditBase e incluir id y tenant_id propios:

  import uuid
  from sqlmodel import Field
  from .mixins import AuditBase

  class Product(AuditBase, table=True):
      __tablename__ = "products"
      id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
      tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
      name: str = Field(max_length=150)
      price: float = Field(default=0.0)

### Paso 2 — Registrar el Modelo
Importar la clase en backend/models/__init__.py para que Alembic la detecte.

### Paso 3 — Generar y Aplicar la Migración
  docker-compose exec backend alembic revision --autogenerate -m "tabla_productos"
  docker-compose exec backend alembic upgrade head

### Paso 4 — Crear los Schemas
Agregar ProductCreate / ProductRead / ProductUpdate en backend/models/schemas.py.

### Paso 5 — Crear el Router
Crear backend/api/routers/products.py. SIEMPRE usar Depends(get_current_tenant_id)
para filtrar por tenant:

  @router.get("/", response_model=list[ProductRead])
  async def list_products(
      tenant_id: uuid.UUID = Depends(get_current_tenant_id),
      db: AsyncSession = Depends(get_session)
  ):
      result = await db.execute(
          select(Product).where(Product.tenant_id == tenant_id, Product.is_active == True)
      )
      return result.scalars().all()

### Paso 6 — Registrar el Router en main.py
  from api.routers import products as products_router
  app.include_router(products_router.router, prefix="/api/products", tags=["Productos"])

### Paso 7 — Crear el Module en BD
El Súper Admin registra el módulo desde el panel AdminModules con:
  - frontend_route: "products"  (clave que usará el appRegistry)
  - icono, nombre, descripción, plan al que pertenece

### Paso 8 — Frontend: Service
Crear frontend/src/services/products.service.ts consumiendo /api/products.

### Paso 9 — Frontend: App
  - Crear frontend/src/apps/products/ProductsApp.tsx
  - Crear frontend/src/apps/products/index.ts exportando { ProductsApp }
  - Registrar en frontend/src/apps/index.ts:
      products: lazy(() => import('./products').then(m => ({ default: m.ProductsApp })))
  - El JWT viaja automáticamente via Axios (api.ts tiene withCredentials=true)

### Reglas que NUNCA romper
  - Todo endpoint de negocio DEBE usar Depends(get_current_tenant_id)
  - Toda query DEBE filtrar por tenant_id (RLS lógico)
  - Todo modelo de negocio DEBE heredar de AuditBase
  - Nunca almacenar tenant_id en la tabla users
  - Siempre importar el modelo en models/__init__.py antes de migrar
  - El frontend_route del Module en BD DEBE coincidir con la clave en appRegistry


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 14. MAPA COMPLETO DE ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Core / Plataforma
  Método  Ruta                              Descripción                    Acceso
  ──────  ────────────────────────────────  ─────────────────────────────  ─────────────
  GET     /health                           Healthcheck del servidor        Público
  POST    /api/auth/jwt/login               Login con email+password        Público
  POST    /api/auth/jwt/logout              Logout (invalida token)         Autenticado
  POST    /api/auth/register                Registro global de usuario      Público
  POST    /api/auth/workspace               Registro con tenant             Público
  GET     /api/auth/session                 Sesión enriquecida M:N          Autenticado
  GET     /api/auth/google/login            Iniciar flujo Google OAuth      Público
  GET     /api/auth/google/callback         Callback de Google OAuth        Público
  GET     /api/users/me                     Perfil del usuario              Autenticado
  PATCH   /api/users/me                     Actualizar perfil               Autenticado
  PATCH   /api/onboarding/complete          Completar onboarding            Autenticado

  GET     /api/me/roles                     Roles del tenant activo         Admin tenant
  GET     /api/me/members                   Miembros del tenant activo      Admin tenant

  POST    /api/invitations/                 Crear invitación                Admin tenant
  GET     /api/invitations/                 Listar invitaciones             Admin tenant
  POST    /api/invitations/{id}/respond     Aceptar o rechazar              Invitado
  PATCH   /api/invitations/{id}/revoke      Revocar invitación              Admin tenant
  POST    /api/invitations/{id}/resend      Reenviar invitación             Admin tenant

  GET     /api/tenants/                     Listar empresas                 Súper Admin
  POST    /api/tenants/                     Crear empresa                   Súper Admin
  GET     /api/tenants/{id}                 Ver empresa                     Súper Admin
  PATCH   /api/tenants/{id}                 Editar empresa                  Súper Admin
  DELETE  /api/tenants/{id}                 Eliminar empresa                Súper Admin

  GET     /api/members/                     Listar miembros del tenant      Admin tenant
  POST    /api/members/                     Agregar miembro                 Admin tenant
  DELETE  /api/members/{id}                 Remover miembro                 Admin tenant

  GET     /api/admin/modules/               Listar módulos del sistema      Súper Admin
  POST    /api/admin/modules/               Crear módulo                    Súper Admin
  PATCH   /api/admin/modules/{id}           Editar módulo                   Súper Admin

  GET     /api/plans/                       Listar planes de suscripción    Autenticado
  POST    /api/plans/                       Crear plan                      Súper Admin

  GET     /api/tenant-modules/              Módulos del tenant activo       Autenticado
  POST    /api/tenant-modules/              Asignar módulo al tenant        Admin tenant

  GET     /api/admin/config/                Leer configuración global       Súper Admin
  PATCH   /api/admin/config/                Actualizar configuración        Súper Admin

  (En development) GET /docs               Swagger UI interactivo
  (En development) GET /redoc              ReDoc

### Apps de Negocio
  Método  Ruta                                      Descripción                          Acceso
  ──────  ────────────────────────────────────────  ───────────────────────────────────  ────────────
  GET     /api/bodega/items                         Listar insumos                        Autenticado
  POST    /api/bodega/items                         Crear insumo                          Autenticado
  PATCH   /api/bodega/items/{id}                    Editar insumo                         Autenticado
  PATCH   /api/bodega/items/{id}/adjust             Ajustar stock                         Autenticado
  GET     /api/bodega/items/{id}/price-history      Historial de precios                  Autenticado
  GET     /api/bodega/items/{id}/movements          Historial de movimientos              Autenticado
  DELETE  /api/bodega/items/{id}                    Eliminar insumo                       Autenticado

  GET     /api/recetas/                             Listar recetas                        Autenticado
  POST    /api/recetas/                             Crear receta                          Autenticado
  GET     /api/recetas/{id}                         Detalle con ingredientes              Autenticado
  PATCH   /api/recetas/{id}                         Editar receta                         Autenticado
  DELETE  /api/recetas/{id}                         Eliminar receta                       Autenticado
  POST    /api/recetas/{id}/ingredients             Agregar ingrediente                   Autenticado
  PATCH   /api/recetas/{id}/ingredients/{ing_id}    Editar ingrediente                    Autenticado
  DELETE  /api/recetas/{id}/ingredients/{ing_id}    Quitar ingrediente                    Autenticado

  GET     /api/cocina/orders                        Listar órdenes de producción          Autenticado
  GET     /api/cocina/preview/{recipe_id}           Preview de insumos vs stock           Autenticado
  POST    /api/cocina/orders                        Crear orden                           Autenticado
  PATCH   /api/cocina/orders/{id}/start             Marcar en proceso                     Autenticado
  PATCH   /api/cocina/orders/{id}/complete          Completar (descuenta stock)           Autenticado
  POST    /api/cocina/orders/{id}/waste             Registrar merma                       Autenticado
  DELETE  /api/cocina/orders/{id}                   Cancelar orden                        Autenticado

  GET     /api/mostrador/products                   Productos vendibles                   Autenticado
  POST    /api/mostrador/sales                      Registrar venta                       Autenticado
  GET     /api/mostrador/sales                      Historial de ventas                   Autenticado

  GET     /api/cierre/summary                       Resumen del día                       Autenticado
  POST    /api/cierre/                              Cerrar turno                          Autenticado
  GET     /api/cierre/                              Historial de cierres                  Autenticado

  GET     /api/autos/estados                        Estados USA con costos                Autenticado
  POST    /api/autos/calcular                       Desglose de importación               Autenticado


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 15. ESCALABILIDAD Y CONCURRENCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FastAPI con Uvicorn (ASGI) + asyncpg permite manejar miles de conexiones
concurrentes sin bloquear hilos. El cuello de botella en producción de alta
carga suele ser el pool de conexiones a PostgreSQL, no el CPU.

Estrategias de escala cuando la carga lo requiera:
  - Múltiples réplicas del contenedor backend (horizontal scaling)
  - PgBouncer como pooler de conexiones frente a PostgreSQL
  - CDN para los assets estáticos del frontend (dist/)
  - Redis como backend de rate limiting distribuido (reemplazar slowapi in-memory)
  - RLS nativo de PostgreSQL como segunda capa de seguridad (complementa el RLS lógico)
  - Code-splitting: cada app de negocio ya se carga lazy en el frontend, lo
    que reduce el bundle inicial y mejora el TTI
