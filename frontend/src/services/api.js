import axios from 'axios';

// Same-origin '/api' is proxied to the backend by nginx (prod) and Vite (dev).
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'janamen.token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: session lives in memory only */ }
};

const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLogin) {
      setToken(null);
      if (window.location.pathname !== '/login') {
        window.location.assign(`/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`);
      }
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from a FastAPI error response. */
export const errorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg || fallback;
  if (error?.code === 'ECONNABORTED' || !error?.response) return 'Сервер недоступен. Попробуйте позже.';
  return fallback;
};

export default api;
