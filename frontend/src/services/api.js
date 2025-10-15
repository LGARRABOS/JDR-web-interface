import axios from 'axios';
import { getStoredAuth } from './storage.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const client = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

client.interceptors.request.use((config) => {
  const { token } = getStoredAuth();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const registerUser = (payload) => client.post('/auth/register', payload);
export const loginUser = (payload) => client.post('/auth/login', payload);
export const fetchCharacters = (params) => client.get('/characters', { params });
export const createCharacter = (payload) => client.post('/characters', payload);
export const updateCharacter = (id, payload) => client.put(`/characters/${id}`, payload);
export const uploadMap = (formData) =>
  client.post('/maps/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const rollDiceApi = (payload) => client.post('/roll', payload);
