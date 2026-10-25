import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('notiq_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('notiq_token');
      localStorage.removeItem('notiq_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// --- Auth ---
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  brototypeSync: (data: any) => api.post('/auth/brototype-sync', data),
  getMe: () => api.get('/auth/me'),
  updateMe: (data: any) => api.put('/auth/me', data),
};

// --- Workspaces ---
export const workspaceApi = {
  getAll: () => api.get('/workspaces'),
  create: (data: any) => api.post('/workspaces', data),
  update: (id: string, data: any) => api.put(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
};

// --- Pages ---
export const pageApi = {
  getAll: (workspaceId: string) => api.get(`/pages?workspaceId=${workspaceId}`),
  getOne: (id: string) => api.get(`/pages/${id}`),
  create: (data: any) => api.post('/pages', data),
  update: (id: string, data: any) => api.put(`/pages/${id}`, data),
  delete: (id: string) => api.delete(`/pages/${id}`),
  getTrash: (workspaceId: string) => api.get(`/pages/trash?workspaceId=${workspaceId}`),
  restore: (id: string) => api.post(`/pages/${id}/restore`),
};

// --- Todos ---
export const todoApi = {
  getAll: (params: any) => api.get('/todos', { params }),
  create: (data: any) => api.post('/todos', data),
  update: (id: string, data: any) => api.put(`/todos/${id}`, data),
  delete: (id: string, params?: any) => api.delete(`/todos/${id}`, { params }),
  deleteAll: (params?: any) => api.delete('/todos', { params }),
  getStats: (workspaceId: string) => api.get(`/todos/stats?workspaceId=${workspaceId}`),
};
