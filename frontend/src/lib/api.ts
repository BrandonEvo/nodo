import axios from 'axios';

const base = import.meta.env.VITE_API_URL ?? '';

// withCredentials: true envía la httpOnly cookie automáticamente en cada request.
// El CookieToBearerMiddleware del backend la convierte en Authorization: Bearer <token>.
const api = axios.create({
  baseURL: base.endsWith('/api') ? base.replace(/\/api\/?$/, '') : base,
  withCredentials: true,
  // Tras inactividad la 1ª request puede tardar (cold start). 45s da margen;
  // si lo supera, tratamos al servidor como no disponible y mostramos aviso.
  timeout: 45000,
});

/**
 * Distingue "el servidor no respondió" (red caída, timeout, o 502/503/504 del
 * proxy) de un error real de la app. Útil para mostrar "reintenta" en vez de
 * un mensaje engañoso como "credenciales inválidas".
 */
// Cliente para datos PÚBLICOS (catálogo/pulso): sin withCredentials → no manda la
// cookie de sesión, así una cookie residual (el dueño mirando su propio link) nunca
// desactiva el cache de Cloudflare. Sin interceptor de refresh (no hay auth que refrescar).
export const publicApi = axios.create({
  baseURL: base.endsWith('/api') ? base.replace(/\/api\/?$/, '') : base,
  timeout: 45000,
});

export function isServerUnreachable(error: any): boolean {
  if (error?.code === 'ECONNABORTED') return true;   // timeout de axios
  if (error?.code === 'ERR_NETWORK') return true;    // sin red / DNS / CORS
  if (!error?.response) return true;                  // sin respuesta del backend
  const s = error.response.status;
  return s === 502 || s === 503 || s === 504;
}

// ── Refresh silencioso ────────────────────────────────────────────────────────
let _refreshing = false;
let _refreshQueue: Array<(ok: boolean) => void> = [];

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config;
    const status   = error.response?.status;

    // Solo intentar refresh en 401, una sola vez por request, y no en el propio refresh
    if (
      status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/cookie-login') &&
      !original.url?.includes('/auth/session')
    ) {
      original._retried = true;

      if (_refreshing) {
        // Encolar hasta que el refresh en curso termine
        return new Promise((resolve, reject) => {
          _refreshQueue.push(ok => ok ? resolve(api(original)) : reject(error));
        });
      }

      _refreshing = true;
      try {
        await api.post('/api/auth/refresh');
        _refreshQueue.forEach(cb => cb(true));
        return api(original); // reintentar la request original
      } catch {
        _refreshQueue.forEach(cb => cb(false));
        // Refresh falló → sesión expirada, recargar para ir al login
        window.location.reload();
        return Promise.reject(error);
      } finally {
        _refreshing = false;
        _refreshQueue = [];
      }
    }

    return Promise.reject(error);
  }
);

export default api;
