# Nodo — Sistema de Diseño v2 "Fluid Glass"

Rediseño visual sobre la identidad hellonodo.com. Tres decisiones base:
- **Gradiente contextual** desde `tenantColor` (no fijo, armoniza siempre)
- **Glassmorphism suave** en tarjetas con fondo de página tintado por tenant
- **Bento grid estructurado** con colspan variable, una sola hero por pantalla

---

## 1. Tipografía — Inter Rounded

Reemplaza la fuente actual del sistema. Instalar en `index.html`:

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter+Rounded:wght@300;400;500;600;700;800;900&display=swap"
  rel="stylesheet"
/>
```

En `frontend/src/index.css`, añadir al `:root`:

```css
:root {
  font-family: 'Inter Rounded', 'Inter', system-ui, sans-serif;
}
```

En `tailwind.config.js`:

```js
theme: {
  extend: {
    fontFamily: {
      sans: ["'Inter Rounded'", 'Inter', 'system-ui', 'sans-serif'],
    },
  }
}
```

### Escala tipográfica (sin cambios de nombres, solo add Inter Rounded)

| Rol | Tailwind |
|-----|---------|
| Número hero | `text-[52px] lg:text-[68px] font-black tabular-nums tracking-tighter` |
| Título de módulo | `text-[28px] font-black text-nodo-ink leading-tight` |
| Wordmark "hello**nodo**" | `font-light` + `font-black` en "nodo" (split en spans) |
| Valor KPI | `text-2xl font-black text-nodo-ink tabular-nums` |
| Label KPI | `text-[10px] font-semibold text-nodo-sub` |
| Sección uppercase | `text-[9px] font-bold text-nodo-dim uppercase tracking-[0.14em]` |

---

## 2. Sistema de Color

### 2.1 Paleta base (sin cambios — siguen siendo dark-mode aware)

Los tokens `nodo-*` existentes se mantienen. Solo cambia cómo se usan las superficies.

### 2.2 Gradiente contextual — generado desde `tenantColor`

El gradiente iridiscente se construye rotando el tono del `tenantColor`:
- **Start**: hue −50° del tenant, más saturado y claro → lado cálido
- **Mid**: el `tenantColor` tal cual
- **End**: hue +50° del tenant, hacia cool

Añadir esta función en `AppShell.tsx` (junto al cálculo existente de `tenantCssVars`):

```ts
// AppShell.tsx — función auxiliar
function generateIridescentGradient(hex: string): string {
  const { h, s, l } = hexToHsl(hex);

  const startH = (h - 50 + 360) % 360;
  const endH   = (h + 50) % 360;

  const start = hslToHex({ h: startH, s: Math.min(100, s + 20), l: Math.min(78, l + 18) });
  const end   = hslToHex({ h: endH,   s: Math.min(100, s + 10), l: Math.max(32, l - 8) });

  return `linear-gradient(135deg, ${start} 0%, ${hex} 50%, ${end} 100%)`;
}

// Funciones de color necesarias (añadir en AppShell.tsx)
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
  if (max === min) return { h: 0, s: 0, l: l*100 };
  const d = max - min, s = l > 0.5 ? d/(2-max-min) : d/(max+min);
  const h = max===r ? ((g-b)/d+(g<b?6:0))/6 : max===g ? ((b-r)/d+2)/6 : ((r-g)/d+4)/6;
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}
function hslToHex({ h, s, l }: { h:number; s:number; l:number }): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h/30) % 12;
  const a = s * Math.min(l, 1-l);
  const f = (n: number) => Math.round(255*(l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)))));
  return `#${f(0).toString(16).padStart(2,'0')}${f(8).toString(16).padStart(2,'0')}${f(4).toString(16).padStart(2,'0')}`;
}
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Dentro del bloque tenantCssVars (useMemo en AppShell):
const endColor = hslToHex({ h: (hexToHsl(tenantColor).h + 50) % 360, s: Math.min(100, hexToHsl(tenantColor).s + 10), l: Math.max(32, hexToHsl(tenantColor).l - 8) });
const brandGradient = generateIridescentGradient(tenantColor);

// Versión sutil: misma paleta pero con alpha 0.15
const brandGradientSubtle = brandGradient.replace(
  /linear-gradient\(135deg, (#[0-9a-fA-F]{6}) 0%, (#[0-9a-fA-F]{6}) 50%, (#[0-9a-fA-F]{6}) 100%\)/,
  (_: string, s: string, m: string, e: string) =>
    `linear-gradient(135deg, ${hexToRgba(s, 0.15)} 0%, ${hexToRgba(m, 0.12)} 50%, ${hexToRgba(e, 0.15)} 100%)`
);

document.documentElement.style.setProperty('--nodo-brand-gradient',        brandGradient);
document.documentElement.style.setProperty('--nodo-brand-gradient-subtle', brandGradientSubtle);
document.documentElement.style.setProperty('--nodo-page-tint-start',       hexToRgba(tenantColor, 0.04));
document.documentElement.style.setProperty('--nodo-page-tint-end',         hexToRgba(endColor,    0.06));
```

### 2.3 Nuevas CSS variables (añadir en `index.css` `:root`)

```css
:root {
  /* Gradiente de marca — calculado por AppShell en runtime */
  --nodo-brand-gradient:        linear-gradient(135deg, #FFB86B 0%, #9B59B6 50%, #4158D0 100%);
  --nodo-brand-gradient-subtle: linear-gradient(135deg, rgba(255,184,107,0.15) 0%, rgba(155,89,182,0.12) 50%, rgba(65,88,208,0.15) 100%);

  /* Tinte de fondo de página — calculado por AppShell */
  --nodo-page-tint-start: rgba(155, 89, 182, 0.04);
  --nodo-page-tint-end:   rgba(65, 88, 208, 0.06);

  /* Glass */
  --nodo-glass-bg:     rgba(255, 255, 255, 0.72);
  --nodo-glass-border: rgba(255, 255, 255, 0.35);
  --nodo-glass-blur:   20px;
}

.dark {
  --nodo-glass-bg:     rgba(28, 28, 30, 0.72);
  --nodo-glass-border: rgba(255, 255, 255, 0.08);
}
```

### 2.4 Fondo de página — `nodo-canvas`

El `nodo-canvas` pasa a ser un gradiente muy sutil tintado por el tenant:

```css
/* index.css — actualizar el token nodo-canvas */
:root {
  --nodo-canvas-bg: linear-gradient(
    145deg,
    color-mix(in srgb, white 96%, var(--nodo-primary, #9B59B6)) 0%,
    color-mix(in srgb, #F5F5F7 94%, var(--nodo-primary, #4158D0)) 100%
  );
}
.dark {
  --nodo-canvas-bg: linear-gradient(
    145deg,
    color-mix(in srgb, #0F0F12 96%, var(--nodo-primary, #9B59B6)) 0%,
    color-mix(in srgb, #111115 94%, var(--nodo-primary, #4158D0)) 100%
  );
}
```

En `AppShell.tsx`, el wrapper raíz:
```tsx
<div
  className="min-h-screen"
  style={{ background: 'var(--nodo-canvas-bg)' }}
>
```

### 2.5 Reglas de uso del gradiente

| Elemento | Clase / Token |
|----------|--------------|
| Botón CTA primario | `style={{ background: 'var(--nodo-brand-gradient)' }}` |
| Icono activo del módulo | `style={{ background: 'var(--nodo-brand-gradient)' }}` aplicado con clip |
| Línea hero en gráficas | Color `stroke` del área/línea principal |
| Isotipo / avatar de marca | Fondo del orbe del logo |
| Hover de card primaria | `var(--nodo-brand-gradient-subtle)` como background |
| **NUNCA** | Fondos de página, texto corriente, tablas, inputs |

---

## 3. Superficies — Glassmorphism

### Tokens de clase Tailwind (añadir en `tailwind.config.js`)

```js
// tailwind.config.js
theme: {
  extend: {
    backdropBlur: {
      glass: '20px',
    },
    backgroundColor: {
      'nodo-glass': 'var(--nodo-glass-bg)',
    },
    borderColor: {
      'nodo-glass': 'var(--nodo-glass-border)',
    },
  }
}
```

### Tarjeta glass estándar

```tsx
<div
  className="rounded-[20px] border border-nodo-glass p-5 shadow-sm"
  style={{
    background: 'var(--nodo-glass-bg)',
    backdropFilter: `blur(var(--nodo-glass-blur))`,
    WebkitBackdropFilter: `blur(var(--nodo-glass-blur))`,
  }}
>
  {/* contenido */}
</div>
```

> **Nota de rendimiento:** `backdrop-filter` es costoso en GPU. Usar máximo 6–8 cards con glass simultáneamente. Para listas largas (>10 items) usar `bg-nodo-card` estándar en los ítems secundarios.

### Jerarquía de superficies actualizada

```
Page background (gradiente sutil)
  └─ nodo-glass card      ← panel / tarjeta principal con blur
       └─ bg-nodo-inset   ← inputs, chips (sin blur — anidado)
            └─ bg-nodo-raised ← hover, selected state
```

La regla es: **blur solo en el primer nivel**. Anidar `backdrop-filter` en elementos hijos causa artefactos visuales en Safari.

### Hero card (glass + gradiente)

La hero card usa el gradiente sutil como fondo de la card:

```tsx
<div
  className="rounded-[28px] border border-nodo-glass p-6 col-span-2"
  style={{
    background: `var(--nodo-brand-gradient-subtle), var(--nodo-glass-bg)`,
    backdropFilter: `blur(var(--nodo-glass-blur))`,
    WebkitBackdropFilter: `blur(var(--nodo-glass-blur))`,
    boxShadow: 'var(--nodo-shadow-hero)',
  }}
>
  <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-[0.14em] mb-1">Métrica principal</p>
  <p className="text-[52px] font-black text-nodo-ink tabular-nums tracking-tighter leading-none">
    {valor}
  </p>
  <p className="text-nodo-sub text-sm font-semibold mt-2">{label}</p>
</div>
```

---

## 4. Layout — Bento Grid Estructurado

### Grid base

```tsx
{/* Wrapper de módulo */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
  {/* Hero — ocupa 2 cols en móvil, 2 en desktop */}
  <div className="col-span-2"> ... </div>

  {/* KPI small — 1 col cada uno */}
  <div className="col-span-1"> ... </div>
  <div className="col-span-1"> ... </div>

  {/* Tabla / gráfica — ocupa 3 de 4 cols en desktop */}
  <div className="col-span-2 lg:col-span-3"> ... </div>

  {/* Panel lateral — 1 col */}
  <div className="col-span-2 lg:col-span-1"> ... </div>
</div>
```

### Reglas de colspan

| Tipo de card | Mobile | Desktop |
|-------------|--------|---------|
| Hero / dato principal | `col-span-2` (full) | `col-span-2` |
| KPI pequeño | `col-span-1` | `col-span-1` |
| Tabla / lista | `col-span-2` (full) | `col-span-3` |
| Gráfica secundaria | `col-span-2` (full) | `col-span-2` |
| Panel lateral | `col-span-2` (full) | `col-span-1` |

**Una sola card hero por pantalla** — la que tiene el dato más importante del módulo. El resto son KPIs o tablas.

### Patrón "1 hero + 2 KPI + tabla" (más común)

```
Mobile (2 cols):          Desktop (4 cols):
┌──────────┐              ┌─────────────┬──────┬──────┐
│  Hero    │              │  Hero       │ KPI  │ KPI  │
│ (full)   │              │ (col 2)     │      │      │
├────┬─────┤              ├──────┬──────┴──────┴──────┤
│KPI │ KPI │              │Panel │  Tabla (col 3)     │
├────┴─────┤              │(col1)│                    │
│  Tabla   │              │      │                    │
│ (full)   │              └──────┴────────────────────┘
└──────────┘
```

### Alturas de card — no usar height fija, usar min-h

```tsx
{/* KPI card */}
<div className="col-span-1 min-h-[120px] flex flex-col justify-between ...">

{/* Hero card */}
<div className="col-span-2 min-h-[160px] ...">

{/* Tabla / lista */}
<div className="col-span-2 lg:col-span-3 min-h-[280px] ...">
```

---

## 5. Componentes Actualizados

### Botón primario (CTA gradient)

```tsx
<button
  className="w-full h-14 rounded-full font-black text-sm tracking-wide text-white active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg"
  style={{ background: 'var(--nodo-brand-gradient)' }}
>
  <IconName size={18} />
  ACCIÓN PRINCIPAL
</button>
```

> El texto siempre `text-white` sobre el gradiente — el gradiente es suficientemente oscuro en su zona más oscura para garantizar contraste WCAG AA.

### Botón secundario (glass outline)

```tsx
<button className="h-12 px-5 rounded-full border border-nodo-glass bg-nodo-glass font-bold text-sm text-nodo-ink active:scale-[0.97] transition-transform hover:bg-nodo-raised"
  style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
>
  Cancelar
</button>
```

### Botón icon-only (FAB)

```tsx
<button
  className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
  style={{ background: 'var(--nodo-brand-gradient)', boxShadow: 'var(--nodo-shadow-fab)' }}
>
  <Plus size={22} />
</button>
```

### Input (sin cambios de estructura, solo radio)

```tsx
<input
  type="text"
  placeholder="Placeholder..."
  className="w-full h-12 px-4 bg-nodo-inset border border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-line-s outline-none transition-colors placeholder:text-nodo-dim"
/>
```

### KPI card

```tsx
<div
  className="col-span-1 rounded-[20px] border border-nodo-glass p-4 flex flex-col justify-between min-h-[120px]"
  style={{
    background: 'var(--nodo-glass-bg)',
    backdropFilter: 'blur(var(--nodo-glass-blur))',
    WebkitBackdropFilter: 'blur(var(--nodo-glass-blur))',
  }}
>
  <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-[0.14em]">{label}</p>
  <p className="text-2xl font-black text-nodo-ink tabular-nums">{value}</p>
  {trend && (
    <p className={`text-xs font-semibold ${trend > 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
      {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
    </p>
  )}
</div>
```

### Chip / Badge

```tsx
{/* Chip con gradiente sutil — estado activo */}
<span
  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
  style={{ background: 'var(--nodo-brand-gradient-subtle)', color: 'var(--nodo-primary)' }}
>
  {label}
</span>

{/* Chip neutral */}
<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-nodo-inset text-nodo-sub">
  {label}
</span>
```

---

## 6. Wordmark hellonodo.com en UI

Usar split de spans para el efecto tipográfico de la marca:

```tsx
{/* Wordmark completo */}
<span className="font-light text-nodo-ink">hello</span>
<span className="font-black text-nodo-ink">nodo</span>
<span className="font-light text-nodo-dim">.com</span>

{/* Versión gradient del wordmark */}
<span className="font-light text-nodo-ink">hello</span>
<span
  className="font-black bg-clip-text text-transparent"
  style={{ backgroundImage: 'var(--nodo-brand-gradient)' }}
>
  nodo
</span>
<span className="font-light text-nodo-dim">.com</span>
```

---

## 7. Dark Mode

El dark mode con glassmorphism requiere que el fondo de página sea oscuro con color — de lo contrario el glass no se percibe.

```css
.dark {
  --nodo-glass-bg:     rgba(28, 28, 30, 0.75);
  --nodo-glass-border: rgba(255, 255, 255, 0.07);
  --nodo-glass-blur:   20px;
}
```

El gradiente de página en dark se genera con bases `#0F0F12` y `#111115` tintadas por el tenant (ver sección 2.4).

**Regla**: la percepción del glass en dark depende del contraste fondo/card. Si el fondo y la card son del mismo tono, el glass es invisible. El AppShell debe garantizar al menos un 8% de diferencia de luminancia entre el tinte del fondo y la card.

---

## 8. Sombras (actualizadas)

```css
:root {
  --nodo-shadow-card: 0 2px 12px -2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0,0,0,0.04);
  --nodo-shadow-hero: 0 8px 32px -8px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0,0,0,0.04);
  /* --nodo-shadow-fab se mantiene con primary color */
}
.dark {
  --nodo-shadow-card: 0 2px 12px -2px rgba(0, 0, 0, 0.30);
  --nodo-shadow-hero: 0 8px 32px -8px rgba(0, 0, 0, 0.40);
}
```

Las sombras en glass son más sutiles que en el sistema anterior — el blur ya da profundidad; la sombra solo ancla la card al fondo.

---

## 9. Radios (actualizados)

| Uso | Valor | Tailwind |
|-----|-------|---------|
| Chips, badges | 999px | `rounded-full` |
| Inputs, botones secundarios | 16px | `rounded-2xl` |
| Tarjeta KPI estándar | 20px | `rounded-[20px]` |
| Tarjeta grande / hero | 28px | `rounded-[28px]` |
| Botón CTA, FAB | 999px | `rounded-full` |
| BottomSheet handle | 4px | `rounded` |

El botón primario pasa de `rounded-3xl` a `rounded-full` — consistente con la estética iOS de la marca.

---

## 10. Layout de Módulo — Estructura Actualizada

```tsx
export function NuevoModuloApp(_props: AppProps) {
  return (
    <>
      {/* Toasts */}
      {error   && <ToastError ... />}
      {success && <ToastSuccess ... />}

      <div className="flex flex-col gap-5 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Módulo</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">Subtítulo</p>
        </div>

        {/* Filtros / SegmentedControl */}
        <SegmentedControl ... />

        {/* Bento grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Hero */}
          <HeroCard className="col-span-2" ... />

          {/* KPIs */}
          <KpiCard className="col-span-1" ... />
          <KpiCard className="col-span-1" ... />

          {/* Tabla / contenido principal */}
          <div className="col-span-2 lg:col-span-3 ..."> ... </div>

          {/* Panel lateral */}
          <div className="col-span-2 lg:col-span-1 ..."> ... </div>

        </div>

        {/* CTA — gradient pill */}
        <button
          className="w-full h-14 rounded-full font-black text-sm text-white shadow-lg active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-brand-gradient)' }}
        >
          ACCIÓN PRINCIPAL
        </button>
      </div>

      <BottomSheet ... />
    </>
  );
}
```

---

## 11. Lo que NO Hacer (actualizado)

### Superficies
- ❌ Anidar `backdrop-filter` dentro de otro `backdrop-filter` (artefactos en Safari)
- ❌ Usar `backdrop-filter` en más de 8 elementos simultáneos (perf en móvil)
- ❌ `bg-white` hardcoded — usar `bg-nodo-glass` o `bg-nodo-card`
- ❌ Pasteles en tarjetas (bg-nodo-pastel-*) — reemplazados por glass
- ❌ Botón primario con `bg-nodo-ink` negro — ahora es gradient

### Gradiente
- ❌ Aplicar `var(--nodo-brand-gradient)` en fondos de página o tablas
- ❌ Texto largo sobre gradiente (solo íconos, botones, valores hero)
- ❌ Hardcodear los colores del gradiente (`#FFB86B`, `#8A2BE2`) — siempre usar la CSS var

### Grid
- ❌ Dos hero cards en la misma pantalla
- ❌ `col-span-3` en mobile (el grid tiene 2 cols en mobile, causa overflow)
- ❌ `height` fija en cards — usar `min-h-` para que respiren

---

## 12. Checklist de implementación

Orden recomendado de cambios para no romper el diseño actual:

- [ ] **1. Font**: añadir Inter Rounded en `index.html` y `tailwind.config.js`
- [ ] **2. CSS vars glass**: añadir `--nodo-glass-bg`, `--nodo-glass-border`, `--nodo-glass-blur` en `index.css`
- [ ] **3. Page background**: actualizar `AppShell.tsx` wrapper con `var(--nodo-canvas-bg)` gradiente
- [ ] **4. AppShell gradient**: añadir `generateIridescentGradient` y setear `--nodo-brand-gradient`
- [ ] **5. Botón CTA**: actualizar el patrón del botón primario en todos los módulos (grep `bg-nodo-ink` en botones)
- [ ] **6. Cards glass**: reemplazar `bg-nodo-card border border-nodo-line` por glass en tarjetas top-level
- [ ] **7. Bento grid**: refactorizar layouts de módulos al nuevo grid de 4 cols
- [ ] **8. Pasteles**: retirar `bg-nodo-pastel-*` de tarjetas KPI y reemplazar por glass
- [ ] **9. Botón pill**: cambiar `rounded-3xl` a `rounded-full` en botones CTA
- [ ] **10. Dark mode**: verificar contraste fondo/glass en modo oscuro por módulo

---

## 13. Guía de Migración v1 → v2 por Módulo

Para cada módulo, el patrón de migración es el mismo. Ejemplo con **Bodega**:

### Antes (v1)
```tsx
{/* Card principal */}
<div className="nodo-card p-5">
  <p className="text-[10px] font-bold text-nodo-dim uppercase">TOTAL INSUMOS</p>
  <p className="text-2xl font-black text-nodo-ink tabular-nums">19</p>
</div>

{/* Botón CTA */}
<button className="nodo-btn-primary">
  <Plus size={20} /> AGREGAR INSUMO
</button>
```

### Después (v2)
```tsx
{/* Hero card glass — dato principal */}
<div
  className="col-span-2 rounded-[28px] border p-6 min-h-[160px] flex flex-col justify-between"
  style={{
    background: `var(--nodo-brand-gradient-subtle), var(--nodo-glass-bg)`,
    backdropFilter: 'blur(var(--nodo-glass-blur))',
    WebkitBackdropFilter: 'blur(var(--nodo-glass-blur))',
    borderColor: 'var(--nodo-glass-border)',
    boxShadow: 'var(--nodo-shadow-hero)',
  }}
>
  <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-[0.14em]">TOTAL INSUMOS</p>
  <p className="text-[52px] font-black text-nodo-ink tabular-nums tracking-tighter leading-none">19</p>
  <p className="text-nodo-sub text-sm font-semibold">productos en stock</p>
</div>

{/* Botón CTA gradient pill */}
<button
  className="w-full h-14 rounded-full font-black text-sm text-white shadow-lg active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
  style={{ background: 'var(--nodo-brand-gradient)' }}
>
  <Plus size={18} /> AGREGAR INSUMO
</button>
```

### Tabla de equivalencias v1 → v2

| Elemento | v1 | v2 |
|----------|----|----|
| Card principal | `nodo-card` | glass con `var(--nodo-glass-bg)` + blur |
| Hero / dato grande | `nodo-card-hero` | glass + `var(--nodo-brand-gradient-subtle)` |
| Botón CTA | `nodo-btn-primary` (`bg-nodo-ink`) | `style={{ background: 'var(--nodo-brand-gradient)' }}` + `rounded-full` |
| Botón secundario | `nodo-btn-secondary` | glass outline (`border-nodo-glass bg-nodo-glass`) + `rounded-full` |
| KPI card bg | `bg-nodo-pastel-*` | glass (`var(--nodo-glass-bg)`) |
| Layout | columna única / grid 2 cols | bento grid 4 cols (`grid-cols-2 lg:grid-cols-4`) |
| Inputs | `nodo-input` | sin cambios — inputs NO usan glass |

---

## 14. Variables CSS — Referencia Completa

Todas las variables que deben existir en `index.css` después de la migración v2:

```css
:root {
  /* ── Tokens existentes (sin cambio) ── */
  --nodo-radius-sm:   12px;
  --nodo-radius-md:   20px;
  --nodo-radius-lg:   28px;

  --nodo-shadow-card: 0 2px 12px -2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  --nodo-shadow-hero: 0 8px 32px -8px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04);

  /* ── Nuevos en v2 ── */
  /* Gradiente de marca — runtime, generado por AppShell */
  --nodo-brand-gradient:        linear-gradient(135deg, #FFB86B 0%, #9B59B6 50%, #4158D0 100%);
  --nodo-brand-gradient-subtle: linear-gradient(135deg, rgba(255,184,107,0.15) 0%, rgba(155,89,182,0.12) 50%, rgba(65,88,208,0.15) 100%);

  /* Tinte de fondo de página — runtime, generado por AppShell */
  --nodo-page-tint-start: rgba(155, 89, 182, 0.04);
  --nodo-page-tint-end:   rgba(65, 88, 208, 0.06);

  /* Fondo de página con tinte */
  --nodo-canvas-bg: linear-gradient(
    145deg,
    color-mix(in srgb, white 96%, var(--nodo-primary, #9B59B6)) 0%,
    color-mix(in srgb, #F5F5F7 94%, var(--nodo-primary, #4158D0)) 100%
  );

  /* Glass */
  --nodo-glass-bg:     rgba(255, 255, 255, 0.72);
  --nodo-glass-border: rgba(255, 255, 255, 0.35);
  --nodo-glass-blur:   20px;

  /* Card token (v2: transparente para glass) */
  --nodo-card-bg:   var(--nodo-glass-bg);   /* cambia a glass global */
  --nodo-card-blur: var(--nodo-glass-blur); /* activa blur global */
}

.dark {
  --nodo-canvas-bg: linear-gradient(
    145deg,
    color-mix(in srgb, #0F0F12 96%, var(--nodo-primary, #9B59B6)) 0%,
    color-mix(in srgb, #111115 94%, var(--nodo-primary, #4158D0)) 100%
  );

  --nodo-glass-bg:     rgba(28, 28, 30, 0.75);
  --nodo-glass-border: rgba(255, 255, 255, 0.07);
  --nodo-glass-blur:   20px;
}
```

> **Nota de migración instantánea**: si se actualiza `--nodo-card-bg` y `--nodo-card-blur` en `:root`, **todas** las clases `nodo-card` del sistema pasan a glass automáticamente, sin tocar ningún `.tsx`. Ese es el poder del sistema de tokens.
