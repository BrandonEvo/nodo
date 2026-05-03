import axios from 'axios';

import axios from 'axios';

import axios from 'axios';

const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({
  baseURL: base.endsWith('/api') ? base.replace(/\/api\/?$/, '') : base,
  withCredentials: true,
});

// Interceptor para inyectar el token automáticamente si existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;