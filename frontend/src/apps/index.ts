import { lazy, ComponentType } from 'react';

// ============================================================
// REGISTRO CENTRAL DE APPS/MÓDULOS
// ============================================================
// Para añadir una nueva app:
//   1. Crea la carpeta en: src/apps/<nombre-app>/
//   2. Exporta el componente principal desde index.ts
//   3. Añade aquí una entrada: 'CODIGO_MODULO' => lazy(...)
//
// La clave (KEY) debe coincidir con el campo `frontend_route`
// del registro Module en la base de datos (en MINÚSCULAS).
// ============================================================

export type AppComponent = ComponentType<AppProps>;

export interface AppProps {
  /** Nombre del tenant activo, por si la app lo necesita */
  tenantName?: string;
}

// Mapa: frontend_route  →  Componente React (lazy-loaded)
const appRegistry: Record<string, AppComponent> = {
  calc: lazy(() =>
    import('./calculadora').then((m) => ({ default: m.CalculadoraApp }))
  ),
  bodega: lazy(() =>
    import('./bodega').then((m) => ({ default: m.BodegaApp }))
  ),
  cocina: lazy(() =>
    import('./cocina').then((m) => ({ default: m.CocinaApp }))
  ),
  mostrador: lazy(() =>
    import('./mostrador').then((m) => ({ default: m.MostradorApp }))
  ),
  cierre: lazy(() =>
    import('./cierre').then((m) => ({ default: m.CierreApp }))
  ),
  recetas: lazy(() =>
    import('./recetas').then((m) => ({ default: m.RecetasApp }))
  ),
  importaciones: lazy(() =>
    import('./importaciones').then((m) => ({ default: m.ImportacionesApp }))
  ),
  autos: lazy(() =>
    import('./autos').then((m) => ({ default: m.AutosApp }))
  ),
};

/**
 * Resuelve el componente React para un `frontend_route` dado.
 * Retorna `null` si no existe una app registrada para esa ruta.
 */
export function resolveApp(route: string | null | undefined): AppComponent | null {
  if (!route) return null;
  return appRegistry[route.toLowerCase()] ?? null;
}
