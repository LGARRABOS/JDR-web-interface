import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

export const AuthService = {
  login: (payload) => api.post('/auth/login', payload),
  register: (payload) => api.post('/auth/register', payload),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me')
};

export const CharacterService = {
  list: () => api.get('/characters'),
  create: (payload) => api.post('/characters', payload),
  update: (id, payload) => api.put(`/characters/${id}`, payload)
};

export const MapService = {
  list: (params = {}) => api.get('/maps', { params }),
  upload: (formData) =>
    api.post('/maps/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  remove: (id) => api.delete(`/maps/${id}`)
};

export const DiceService = {
  roll: (expression) => api.post('/roll', { expression })
};

export const AssetService = {
  list: (params = {}) => api.get('/assets', { params }),
  upload: (formData) =>
    api.post('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  remove: (id) => api.delete(`/assets/${id}`)
};

export default api;
