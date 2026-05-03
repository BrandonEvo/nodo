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

### Flujo Multi-Tenant (M:N)
El flujo de pertenencia de un usuario al sistema funciona de la siguiente manera:
1. **Tenants (Empresas)**: Entidades raíz. Todo registro de negocio cuelga de un `tenant_id`.
2. **Users (Usuarios)**: Cuentas globales (`users` tabla). Un usuario se registra una vez en toda la plataforma de manera global.
3. **TenantMembers (Membresías)**: Tabla intermedia (`tenant_members`) que vincula un Usuario con una Empresa (Tenant) y le asigna un `role_id` específico dentro de esa empresa. Así, un usuario puede tener el rol "Admin" en la Empresa A y "Vendedor" en la Empresa B usando las mismas credenciales.

## 4. SEGURIDAD Y AISLAMIENTO DE DATOS
Recientemente se implementaron múltiples capas de seguridad:
- **Aislamiento de Datos (Logical RLS)**: Aunque PostgreSQL soporta RLS (Row-Level Security) nativo, el sistema implementa un **RLS Lógico a nivel de aplicación**. Todos los endpoints requieren que se inyecte el `tenant_id` actual mediante la dependencia `get_current_tenant_id` en FastAPI. Cada consulta a la base de datos filtra explícitamente `WHERE tenant_id = :tenant_id`, evitando fuga de datos entre empresas.
- **CORS Dinámico**: Los orígenes permitidos ya no están fijos en el código. Se configuran mediante la variable de entorno `CORS_ORIGINS` (ej: `CORS_ORIGINS="https://mi-dominio.com,https://api.mi-dominio.com"`). Esto evita peticiones no autorizadas desde otros dominios.
- **Rate Limiting (Anti-DDoS y Fuerza Bruta)**: Se implementó la librería `slowapi`. Actualmente, el sistema limita globalmente a **100 peticiones por minuto por IP**. Si una IP excede este límite (como en un ataque de fuerza bruta al login), el servidor devuelve un error HTTP 429 (Too Many Requests), protegiendo la disponibilidad de PostgreSQL y FastAPI.

## 5. SISTEMA DE ROLES Y PERMISOS
El sistema utiliza Control de Acceso Basado en Roles (RBAC) con un enfoque granular en módulos:
- **Roles**: Se definen globalmente (por el Superadmin) o localmente (creados por un admin del tenant, `is_custom=True`).
- **RoleModuleAccess**: Una tabla que cruza un `role_id` con un `module_id` (ej. Módulo de Inventarios) y define booleanos explícitos de permisos: `can_read`, `can_write`, `can_delete`.
- **Módulos y Subscripciones**: Las empresas se suscriben a módulos (`tenant_modules`). Los roles de esa empresa dictan quién puede usar dicho módulo basado en los accesos configurados.

## 6. GUÍA PARA EL PROGRAMADOR (EXTENSIBILIDAD)

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

## 7. CAPACIDAD DE CONCURRENCIA
Con la configuración asíncrona de `FastAPI` (junto con Uvicorn/Gunicorn) y `asyncpg` para PostgreSQL, Nodo puede escalar horizontalmente en múltiples contenedores. La limitación no será el CPU, sino la RAM y el número de conexiones a PostgreSQL (que se soluciona fácilmente utilizando PgBouncer o servicios similares si la demanda excede los miles de usuarios simultáneos).
