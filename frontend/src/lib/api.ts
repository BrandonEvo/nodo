import axios from 'axios';

const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// withCredentials: true envía la httpOnly cookie automáticamente en cada request.
// El CookieToBearerMiddleware del backend la convierte en Authorization: Bearer <token>.
const api = axios.create({
  baseURL: base.endsWith('/api') ? base.replace(/\/api\/?$/, '') : base,
  withCredentials: true,
});

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
