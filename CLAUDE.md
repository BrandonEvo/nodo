# Nodo — Guía de Diseño y Desarrollo

Sistema de gestión modular para negocios (SaaS multi-vertical: ventas, inventario, citas, importaciones, catálogo online). FastAPI + PostgreSQL en backend, React + TypeScript + Tailwind en frontend. Arquitectura multi-tenant con autenticación JWT. En textos visibles al usuario y SEO, nunca posicionar el producto como exclusivo de un rubro (p. ej. panaderías).

---

## ⚠️ ESTE HOST CORRE PRODUCCIÓN — NO ES ENTORNO DE DESARROLLO

**Este servidor (`/home/nodo/Docker/nodo`) es el deploy de PRODUCCIÓN de `hellonodo.com`.** Acá **no** se usa el docker de desarrollo. Regla operativa obligatoria:

- Los contenedores vivos son producción real con clientes: `nodo_proxy` (nginx 80/443), `nodo_backend` (uvicorn), `nodo_db` (postgres 16). Levantar con `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` — **nunca** `up` pelado (el `docker-compose.override.yml` es solo dev).
- El backend está **bind-mounted** (`backend/ -> /app`) pero desde 2026-07-12 corre **`--workers 2` SIN `--reload`**: editar un archivo del backend **ya NO recarga solo**. Para aplicar cambios de backend hay que recrear: `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d backend`. ⚠️ **Ese recreate corre `entrypoint.sh` → `alembic upgrade head`**: si hay una migración pendiente, el recreate la aplica a producción. Verificá SIEMPRE `alembic current` vs `heads` antes de recrear.
- **No** aplicar migraciones, ni reiniciar/rebuild del backend, ni matar contenedores, ni correr load tests agresivos **sin confirmar antes con el usuario**. Preferir ventanas off-peak.
- Nota de estado (2026-07-12): capacidad optimizada tras load test — `--workers 2 --proxy-headers` (2 cores), rate-limit por-IP real arreglado (`core/limiter.py`), nginx `api_zone` 300r/m, pool DB 10+15. **Pendiente**: cutover real a `docker-compose.prod.yml` (hoy sigue corriendo el `override.yml` con `ports 8000:8000` publicado y bind-mount) y fix E (adelgazar middlewares). Ver memoria `capacity-plan`.

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy + Alembic + PostgreSQL 16
- **Auth**: fastapi-users + JWT (2h) + refresh token rotante (7d), ambos en httpOnly cookies
- **Estilos**: `darkMode: ["class"]` — la clase `.dark` en `<html>` activa el modo oscuro
- **Alias**: `@/` apunta a `frontend/src/`

---

## Seguridad — Reglas Obligatorias

Todo código nuevo debe cumplir estas reglas sin excepción. No son opcionales.

### Autenticación y sesiones

**El JWT nunca viaja en el body ni en `localStorage`.**

- Login → `POST /api/auth/cookie-login` → setea `access_token` como httpOnly cookie (2h)
- Sesión se mantiene vía refresh token opaco en segunda cookie httpOnly (7d, path restringido)
- El interceptor de axios detecta 401 y llama `/api/auth/refresh` silenciosamente
- `withCredentials: true` en el cliente axios — la cookie va automática en cada request

```python
# CORRECTO
response.set_cookie(key="access_token", value=jwt, httponly=True, samesite="lax")
return {"ok": True}

# INCORRECTO — nunca exponer el JWT
return {"access_token": jwt}
```

```ts
// INCORRECTO — nunca guardar token en JS-land
localStorage.setItem('token', data.access_token)
```

### Row Level Security (RLS) — obligatorio en toda tabla nueva con tenant_id

PostgreSQL tiene RLS activo en las 17 tablas de negocio. **Toda tabla nueva con `tenant_id` debe incluir estas políticas en su migración de Alembic:**

```python
def upgrade() -> None:
    # 1. Crear la tabla normalmente con op.create_table(...)

    # 2. OBLIGATORIO: habilitar RLS y crear las 4 políticas
    op.execute("ALTER TABLE mi_tabla ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY mi_tabla_tenant_select ON mi_tabla FOR SELECT
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY mi_tabla_tenant_insert ON mi_tabla FOR INSERT
        WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY mi_tabla_tenant_update ON mi_tabla FOR UPDATE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY mi_tabla_tenant_delete ON mi_tabla FOR DELETE
        USING (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
    """)
    # 3. OBLIGATORIO: dar acceso al rol de aplicación
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON mi_tabla TO nodo_app")
```

**Cómo funciona:** `get_current_tenant_id` ejecuta `SET LOCAL ROLE nodo_app` + `SET LOCAL app.current_tenant = '{id}'` en cada request. `nodo_app` no es superuser → las políticas aplican. `nodo_admin` (Alembic) es superuser → bypassa RLS automáticamente.

**Usar siempre `get_current_tenant_id` como dependencia** en routers de negocio — activa RLS:

```python
# CORRECTO — activa RLS automáticamente
@router.get("/")
async def list_items(
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    session: AsyncSession = Depends(get_session),
):
    ...

# INCORRECTO — nunca usar get_session solo sin get_current_tenant_id en rutas de negocio
@router.get("/")
async def list_items(session: AsyncSession = Depends(get_session)):
    ...
```

### Rate limiting en endpoints nuevos

```python
from core.limiter import limiter

# Endpoints autenticados de negocio: ya tienen el global 100/min
# Endpoints públicos o de auth: rate limit propio obligatorio
@router.post("/mi-endpoint-sensible")
@limiter.limit("20/minute")   # ajustar según el riesgo del endpoint
async def handler(request: Request, ...):
    ...
```

Referencia de límites actuales:
- Login: 10/min | Registro: 5/min | Tracking público: 20/min | General: 100/min

### Endpoints públicos (sin autenticación)

- Exponer solo campos mínimos seguros — nunca `tenant_id`, teléfonos, precios internos
- Usar UUID v4 como token de acceso, nunca IDs secuenciales
- Añadir `Cache-Control` y `X-Content-Type-Options` en el response
- Registrar en nginx con zona `limit_req` dedicada para producción

### Mensajes de error — no revelar información

```python
# CORRECTO — mensaje genérico
raise HTTPException(status_code=400, detail="Credenciales incorrectas.")

# INCORRECTO — revela si el email existe (user enumeration)
raise HTTPException(status_code=400, detail="El correo no está registrado.")
```

### Política de contraseñas

Usar `_validate_password()` de `api/routers/auth.py` en cualquier flujo nuevo de creación de contraseña. Mínimo: 8 caracteres, una letra, un número, no en blacklist.

---

## Backend — Patrón para Módulos Nuevos

Cada módulo nuevo necesita:
1. **Migración Alembic**: `alembic revision --autogenerate -m "descripcion"`
2. **RLS** en la migración si la tabla tiene `tenant_id` (ver sección de seguridad arriba)
3. **INSERT en `modules`** con `key`, `name`, `description`
4. **INSERT en `tenant_module_subscriptions`** para activar en tenants existentes
5. **Router FastAPI** en `backend/api/routers/nuevo_modulo.py` usando `get_current_tenant_id`
6. **Registrar router** en `backend/main.py`
7. **Service TypeScript** en `frontend/src/services/nuevo_modulo.service.ts`
8. **App component** en `frontend/src/apps/nuevo_modulo/NuevoModuloApp.tsx`
9. **Registrar en** `frontend/src/apps/index.ts`

### Dependencias FastAPI — cuándo usar cada una

| Dependencia | Cuándo usarla |
|-------------|--------------|
| `get_current_tenant_id` | **Toda ruta de negocio con datos de tenant. Activa RLS.** |
| `current_active_user` | Rutas que necesitan el objeto User pero no tenant (perfil). |
| `get_session` | Solo admin/migraciones/seeds — no activa RLS. |
| `get_tenant_session` | Legacy — solo routers con header `X-Tenant-Id`. |

---

## Manual de Diseño — Tokens del Sistema

### Filosofía visual

**Soft modern minimalism + Bento layout**: tarjetas redondeadas en grilla asimétrica, cada tarjeta con su propio fondo pastel. Una sola tarjeta saturada (hero) por pantalla. Datos como protagonistas: número grande bold, etiqueta pequeña muted.

### Primary dinámico — `tenantColor` del usuario

El color primario viene de `tenant_theme_color` en Configuración. `AppShell` lo inyecta como CSS vars al documento:

```ts
// AppShell.tsx — tenantCssVars (se recalcula automáticamente al cambiar tenantColor)
'--nodo-primary'         // = tenantColor
'--nodo-primary-soft'    // rgba(r,g,b, 0.12) — fondos sutiles, pastel del primario
'--nodo-primary-softer'  // rgba(r,g,b, 0.07) — overlays muy sutiles
'--nodo-primary-deep'    // tenantColor oscurecido 15% — hover, sombras
'--nodo-on-primary'      // #111111 si el primario es claro; #FFFFFF si es oscuro
'--nodo-shadow-fab'      // sombra del FAB coloreada con el primario
```

Clases Tailwind correspondientes:

| Clase | Uso |
|---|---|
| `bg-nodo-primary` | Hero card, FAB, botón CTA, tab activo |
| `bg-nodo-primary-soft` | Fondo de badges, chips, hover de tarjetas primarias |
| `text-nodo-on-primary` | Texto sobre fondo `nodo-primary` (negro o blanco según luminancia) |
| `bg-nodo-primary-deep` | Hover sobre hero card |

### Pasteles funcionales — dark-mode aware

Fondos de tarjetas KPI y módulos. Automáticamente cambian en `.dark`:

| Clase Tailwind | Light | Dark |
|---|---|---|
| `bg-nodo-pastel-blue` | `#DCE7FF` | `#1a2744` |
| `bg-nodo-pastel-pink` | `#FFDADD` | `#3d1a1c` |
| `bg-nodo-pastel-peach` | `#FFE9D6` | `#3d2410` |
| `bg-nodo-pastel-mint` | `#D8F0DC` | `#0f2a1c` |
| `bg-nodo-pastel-yellow` | `#FFF4C2` | `#2d2405` |
| `bg-nodo-pastel-lavender` | `#E9E4F5` | `#221a35` |

**Regla**: máximo 3 pasteles por pantalla + 1 primario saturado.

### Sombras del manual

```css
--nodo-shadow-card:  0 4px 16px -4px rgba(15,23,42,0.06)   /* tarjeta estándar */
--nodo-shadow-hero:  0 12px 32px -8px rgba(15,23,42,0.10)   /* tarjeta hero */
--nodo-shadow-fab:   0 8px 20px -4px rgba(r,g,b,0.35)       /* FAB (usa primary) */
```

Uso en código: `style={{ boxShadow: 'var(--nodo-shadow-card)' }}` o `shadow-sm` para el 90% de casos.

### Radios del manual

Definidos en `--nodo-radius-*` (`:root` de `index.css`) y expuestos como `rounded-nodo-*` en Tailwind.

| Uso | CSS var | Tailwind |
|---|---|---|
| Chips, badges | `--nodo-radius-sm` (12px) | `rounded-nodo-sm` |
| Tarjeta estándar, inputs | `--nodo-radius-md` (20px) | `rounded-nodo-md` |
| Tarjeta grande, hero | `--nodo-radius-lg` (28px) | `rounded-nodo-lg` |
| Botones pill, FAB | `--nodo-radius-full` (9999px) | `rounded-full` |

Nunca menos de 16px en tarjetas. Las clases `nodo-card`, `nodo-btn-primary` etc. ya usan los valores correctos.

### Tipografía del manual

| Rol | Tailwind |
|---|---|
| Número hero (dato principal) | `text-[52px] lg:text-[68px] font-black tabular-nums tracking-tighter` |
| Título de módulo / pantalla | `text-[28px] font-black text-nodo-ink leading-tight` |
| Valor KPI | `text-2xl font-black text-nodo-ink tabular-nums` |
| Label de KPI | `text-[10px] font-semibold text-nodo-sub` |
| Sección uppercase | `text-[9px] font-bold text-nodo-dim uppercase tracking-[0.14em]` |

---

## Sistema de Diseño — Reglas Absolutas

### 1. NUNCA usar colores hardcodeados para UI

Prohibido en código nuevo:
```
bg-white      → bg-nodo-card
bg-slate-50   → bg-nodo-inset
bg-slate-100  → bg-nodo-raised
text-[#111]   → text-nodo-ink
text-slate-500/400 → text-nodo-sub / text-nodo-dim
border-slate-100/200 → border-nodo-line / border-nodo-line-s
bg-[#111]     → bg-nodo-ink
text-white (sobre nodo-ink) → text-nodo-canvas
```

Los tokens `nodo-*` son automáticamente dark-mode aware — no usar `dark:` variant para colores de superficie/texto.

### 2. Paleta de tokens semánticos

Definidos en `frontend/src/index.css` (`:root` light, `.dark` iOS).
Expuestos en `frontend/tailwind.config.js` bajo el namespace `nodo`.

| Token Tailwind        | Uso                                      |
|-----------------------|------------------------------------------|
| `bg-nodo-canvas`      | Fondo de página                          |
| `bg-nodo-card`        | Tarjetas, paneles, modales               |
| `bg-nodo-inset`       | Inputs, chips, fondos secundarios        |
| `bg-nodo-raised`      | Hover states, selección activa           |
| `text-nodo-ink`       | Texto primario                           |
| `text-nodo-sub`       | Texto secundario                         |
| `text-nodo-dim`       | Placeholder, texto terciario             |
| `border-nodo-line`    | Bordes sutiles (divisores, cards)        |
| `border-nodo-line-s`  | Bordes más fuertes (inputs focus)        |

**Estados semánticos** — usar SIEMPRE estos, nunca `red-*`/`green-*`/`yellow-*` directo:

| Prefijo              | Uso                                           |
|----------------------|-----------------------------------------------|
| `nodo-danger-{bg/bd/tx}` | Errores, eliminación, pérdidas            |
| `nodo-success-{bg/bd/tx}` | Confirmaciones, ganancias, positivos     |
| `nodo-warn-{bg/bd/tx}`    | Advertencias, márgenes bajos, pendientes |

**Colores de acento fijos** (estos SÍ pueden ser hardcoded porque son intencionales):
- Tarjeta/card → `blue-500/10`, `blue-500/20`, `text-blue-600 dark:text-blue-400`
- Margen saludable → `violet-500/10`, `violet-500/20`, `text-violet-600 dark:text-violet-400`
- POS/Mostrador → `emerald-500` (color de marca para ventas activas)
- Simuladores → `violet-*` con opacidad

### 3. Superficies — jerarquía

```
nodo-canvas     ← fondo de página (AppShell)
  └─ nodo-card  ← panel / tarjeta principal
       └─ nodo-inset  ← input, chip, tabla header, fondo anidado
            └─ nodo-raised  ← hover, selected state
```

---

## Componentes Base — Cómo Usarlos

### BottomSheet (`@/components/ui/BottomSheet`)

Para TODOS los modales, formularios y paneles secundarios. Nunca crear `fixed inset-0` overlays propios.

```tsx
import { BottomSheet } from '@/components/ui/BottomSheet';

<BottomSheet
  open={showForm}
  onClose={() => setShowForm(false)}
  title="Título del panel"
  footer={
    <button
      onClick={handleSubmit}
      disabled={!valid || saving}
      className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
    >
      {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
      GUARDAR
    </button>
  }
>
  {/* contenido del form */}
</BottomSheet>
```

- **Mobile** (`< sm`): sube desde abajo, `max-h-[92dvh]`, drag handle visual
- **Desktop** (`≥ sm`): drawer lateral derecho, `max-w-sm`, alto completo
- `z-[60]` — siempre por encima de BottomNav (`z-50`)
- `footer`: se pega al fondo con `safe-area-inset-bottom` automático

### SegmentedControl (`@/components/ui/SegmentedControl`)

Para tabs y toggles de vista. Nunca crear botones custom de toggle.

```tsx
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const OPTS = [
  { value: 'lista',   label: 'Lista',   icon: <List size={14} /> },
  { value: 'tabla',   label: 'Tabla',   icon: <Table size={14} /> },
];

<SegmentedControl
  options={OPTS}
  value={viewMode}
  onChange={v => setViewMode(v as typeof viewMode)}
  size="sm"   // 'sm' | 'md'
/>
```

---

## Component Tokens — Clases semánticas obligatorias

Las clases `nodo-*` están definidas en `@layer components` de `index.css`. **Usar siempre estas clases** en código nuevo — cuando cambie el diseño, solo se edita el CSS, no los componentes.

> Para migrar toda la app de solid a glass: cambiar `--nodo-card-bg` y `--nodo-card-blur` en `:root`. Para cambiar todos los botones primarios a gradiente: cambiar `--nodo-btn-primary-bg`. Cero ediciones en TSX.

### Referencia rápida

| Clase | Reemplaza a | Uso |
|---|---|---|
| `nodo-card` | `bg-nodo-card border border-nodo-line rounded-[20px] shadow-sm` | Tarjeta estándar |
| `nodo-card-hero` | `bg-nodo-card border border-nodo-line rounded-[28px] shadow-hero` | Tarjeta grande / hero |
| `nodo-btn-primary` | `w-full h-[60px] rounded-full bg-nodo-ink text-nodo-canvas font-black...` | Botón CTA principal |
| `nodo-btn-secondary` | `h-12 px-5 rounded-2xl border-2 border-nodo-line...` | Botón secundario / cancelar |
| `nodo-btn-danger` | `h-14 rounded-2xl bg-nodo-danger-tx text-white...` | Botón destructivo |
| `nodo-input` | `w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl...` | Input de texto |
| `nodo-input-number` | `nodo-input` + sin spinners | Input numérico |
| `nodo-select` | igual que `nodo-input` pero `<select>` | Select |
| `nodo-textarea` | `w-full px-4 py-3 bg-nodo-inset...` | Textarea |
| `nodo-label` | `text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block` | Label de campo |
| `nodo-module-title` | `text-[28px] font-black text-nodo-ink leading-tight` | Título de módulo |
| `nodo-module-subtitle` | `text-nodo-sub text-sm font-medium mt-0.5` | Subtítulo de módulo |
| `nodo-section-label` | `text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-3` | Label de sección |
| `nodo-empty-state` | `flex flex-col items-center justify-center h-40 text-center px-4` | Estado vacío |
| `nodo-spinner-container` | `flex items-center justify-center h-64` | Loading spinner |

### Patrones de UI — Obligatorios

#### Header de módulo

```tsx
<div>
  <h1 className="nodo-module-title">Nombre del Módulo</h1>
  <p className="nodo-module-subtitle">Subtítulo contextual</p>
</div>
```

#### Tarjeta estándar

```tsx
<div className="nodo-card p-5">
  {/* contenido */}
</div>
```

#### Botón primario (acción principal)

```tsx
<button className="nodo-btn-primary">
  <IconName size={20} />
  ACCIÓN
</button>
```

#### Botón secundario / outline

```tsx
<button className="nodo-btn-secondary">
  Cancelar
</button>
```

#### Botón destructivo

```tsx
<button className="nodo-btn-danger">
  Eliminar
</button>
```

#### Inputs

```tsx
<label className="nodo-label">Nombre del campo</label>
<input type="text" placeholder="Placeholder..." className="nodo-input" />

{/* Numérico (sin spinners) */}
<input type="number" className="nodo-input-number" />

{/* Select */}
<select className="nodo-select">...</select>

{/* Textarea */}
<textarea className="nodo-textarea" />
```

#### Toast / Notificación

Siempre `fixed top-4 right-4 z-[70]`. Tres variantes:

```tsx
{/* Error */}
<div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
  <AlertTriangle size={16} className="shrink-0" />
  <span className="flex-1">{error}</span>
  <button onClick={() => setError(null)}><X size={14} /></button>
</div>

{/* Success */}
<div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
  <Check size={16} className="shrink-0" />
  <span>{success}</span>
</div>

{/* Undo (dark) */}
<div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-ink text-nodo-canvas text-sm font-medium px-4 py-3 rounded-2xl shadow-lg max-w-xs">
  <span className="text-nodo-canvas/70 flex-1">"Item" eliminado</span>
  <button onClick={handleUndo} className="text-nodo-canvas font-black text-xs border border-nodo-canvas/30 px-2.5 py-1 rounded-lg">Deshacer</button>
</div>
```

#### Sección con label uppercase

```tsx
<p className="nodo-section-label">Nombre de Sección</p>
```

#### Estado vacío

```tsx
<div className="nodo-empty-state">
  <IconName size={32} className="text-nodo-dim mb-2" />
  <p className="text-sm font-bold text-nodo-dim">Mensaje vacío</p>
</div>
```

#### Loading spinner

```tsx
<div className="nodo-spinner-container">
  <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
</div>
```

#### Stepper −/qty/+

```tsx
<div className="flex items-center gap-2">
  <button onClick={() => setQty(q => Math.max(0, q - 1))}
    className="w-9 h-9 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
    <Minus size={14} />
  </button>
  <span className="w-10 text-center text-sm font-black text-nodo-ink tabular-nums">{qty}</span>
  <button onClick={() => setQty(q => q + 1)}
    className="w-9 h-9 rounded-xl bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 transition-transform">
    <Plus size={14} />
  </button>
</div>
```

---

## Layout de Módulo — Estructura Estándar

```tsx
export function NuevoModuloApp(_props: AppProps) {
  // ... state

  return (
    <>
      {/* Toasts: siempre fuera del flujo normal */}
      {error && <ToastError ... />}
      {success && <ToastSuccess ... />}

      <div className="flex flex-col gap-6 pb-6">
        {/* 1. Header */}
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Módulo</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">Subtítulo</p>
        </div>

        {/* 2. Filtros / SegmentedControl (si aplica) */}
        <SegmentedControl ... />

        {/* 3. Contenido principal */}
        {/* Mobile: columna única / Desktop: grid o master-detail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ... */}
        </div>

        {/* 4. Acción principal al fondo */}
        <button className="w-full h-[60px] rounded-3xl bg-nodo-ink ...">
          ACCIÓN PRINCIPAL
        </button>
      </div>

      {/* BottomSheets — siempre fuera del div principal */}
      <BottomSheet open={showForm} onClose={...} title="..." footer={...}>
        {/* form */}
      </BottomSheet>
    </>
  );
}
```

### Master-Detail (lista + panel, ej. Recetas, Bodega)

```tsx
<div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4">
  {/* Lista — oculta en mobile cuando hay selección */}
  <div className={`lg:w-72 xl:w-80 shrink-0 flex flex-col bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden ${showList ? '' : 'hidden lg:flex'}`}>
    {/* ... */}
  </div>

  {/* Detalle */}
  <div className={`flex-1 min-w-0 min-h-0 ${!showList ? '' : 'hidden lg:flex'}`}>
    {/* ... */}
  </div>
</div>
```

Siempre `min-h-0` en contenedores flex con `overflow-y-auto` dentro de `max-height` — requerido para Safari iOS.

---

## Reglas de Tipografía y Números

- Precios y cantidades numéricas: `tabular-nums`
- Títulos de módulo: `text-[28px] font-black text-nodo-ink`
- Subtítulos de card: `text-lg font-black text-nodo-ink`
- Métricas grandes: `text-3xl font-black` / `text-4xl font-black`
- Labels de sección: `text-[10px] font-bold text-nodo-dim uppercase tracking-wider`
- Cuerpo de tarjeta: `text-sm font-semibold text-nodo-ink`
- Texto secundario: `text-xs text-nodo-sub`

---

## Interactividad — Reglas de Feel

- Botones táctiles: `active:scale-[0.97]` (primarios) / `active:scale-95` (secundarios) / `active:scale-90` (iconos pequeños)
- Transición estándar: `transition-transform` o `transition-colors`
- Bordes redondeados: `rounded-3xl` (cards grandes), `rounded-2xl` (cards medianas, inputs), `rounded-xl` (chips, botones pequeños)
- Sombra de card: `shadow-sm`; botón primario: `shadow-lg`

---

## z-index — Jerarquía Fija

| Elemento        | z-index    |
|-----------------|------------|
| BottomNav       | `z-50`     |
| BottomSheet     | `z-[60]`   |
| Toasts          | `z-[70]`   |

---

## Qué NO Hacer

### Seguridad
- ❌ Devolver el JWT en el body o guardarlo en `localStorage`
- ❌ Crear una tabla con `tenant_id` sin habilitar RLS y sus 4 políticas en la migración
- ❌ Usar `get_session` directamente en rutas de negocio — siempre con `get_current_tenant_id`
- ❌ Endpoints públicos sin rate limit propio (`@limiter.limit(...)`)
- ❌ Mensajes de error que revelen si un email/recurso existe
- ❌ Exponer `tenant_id`, teléfonos o precios internos en endpoints públicos

### Diseño
- ❌ Escribir las clases verbose en lugar de usar los component tokens: `bg-nodo-card border border-nodo-line rounded-[20px] shadow-sm` → usar `nodo-card`; `w-full h-[60px] rounded-full bg-nodo-ink...` → usar `nodo-btn-primary`; etc.
- ❌ `bg-white`, `bg-gray-*`, `bg-slate-*` para superficies de UI
- ❌ `text-[#111]`, `text-gray-*`, `text-black` para texto
- ❌ Modales con `fixed inset-0` propio — usar `BottomSheet`
- ❌ Toggle/tab buttons custom — usar `SegmentedControl`
- ❌ `dark:` variant para colores de superficie (los tokens ya lo manejan)
- ❌ `border-slate-*`, `border-gray-*` — usar `border-nodo-line` / `border-nodo-line-s`
- ❌ `hover:` states con colores hardcoded — usar `hover:bg-nodo-inset` / `hover:bg-nodo-raised`
- ❌ Comments explicando qué hace el código — solo comentar WHY cuando no es obvio
- ❌ Añadir manejo de errores para casos imposibles
- ❌ `padding-bottom` en el wrapper externo del BottomSheet — va en el footer div con `env(safe-area-inset-bottom)`
