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
  upload: (formData) =>
    api.post('/maps/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
};

export const DiceService = {
  roll: (expression) => api.post('/roll', { expression })
};

export default api;
