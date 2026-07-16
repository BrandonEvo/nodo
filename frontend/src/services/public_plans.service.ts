/**
 * Planes públicos para la landing.
 *
 * Usa `fetch` crudo a propósito, no el cliente `api`: ese lleva
 * `withCredentials` y un interceptor que ante un 401 dispara
 * `/api/auth/refresh`. La landing es anónima y no debe tocar el ciclo de
 * sesión. Timeout corto: si el backend está frío, la landing se queda con el
 * snapshot de `plans.fallback.ts` en vez de esperar.
 */
export interface PublicPlan {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  price: number;
  currency: string;
  billing_period: string;
  features: string[];
  badge_label: string | null;
  cta_label: string | null;
  is_featured: boolean;
  module_names: string[];
}

const base = import.meta.env.VITE_API_URL ?? '';
const root = base.endsWith('/api') ? base.replace(/\/api\/?$/, '') : base;

const TIMEOUT_MS = 6000;

/**
 * `null` significa "el backend no respondió" — ahí sí corresponde el snapshot
 * de respaldo. Una lista vacía significa "respondió y no hay planes
 * publicados": son casos distintos y confundirlos haría que la landing
 * anunciara precios que nadie publicó.
 */
export async function fetchPublicPlans(): Promise<PublicPlan[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${root}/api/public/plans`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
