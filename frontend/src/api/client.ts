import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export const AuthAPI = {
  register: (data: { email: string; password: string; displayName: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const GamesAPI = {
  list: () => api.get('/games'),
  create: (data: { name?: string; isGemma?: boolean }) =>
    api.post('/games', data),
  join: (data: { inviteCode: string }) => api.post('/games/join', data),
  get: (id: number) => api.get(`/games/${id}`),
  players: (id: number) => api.get(`/games/${id}/players`),
  updateMe: (id: number, data: { characterName: string }) =>
    api.patch(`/games/${id}/me`, data),
  setCurrentMap: (gameId: number, mapId: number) =>
    api.patch(`/games/${gameId}/current-map`, { mapId }),
  delete: (id: number) => api.delete(`/games/${id}`),
};

export const CharacterSheetsAPI = {
  get: (gameId: number, userId?: number) =>
    api.get(
      `/games/${gameId}/character-sheet`,
      userId != null ? { params: { userId } } : undefined
    ),
  upload: (gameId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/games/${gameId}/character-sheet`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const MapsAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/maps`),
  create: (
    gameId: number,
    data: {
      name?: string;
      imageUrl?: string;
      width?: number;
      height?: number;
      gridSize?: number;
    }
  ) => api.post(`/games/${gameId}/maps`, data),
  upload: (gameId: number, file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return api.post(`/games/${gameId}/maps/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  get: (mapId: number) => api.get(`/maps/${mapId}`),
  delete: (mapId: number) => api.delete(`/maps/${mapId}`),
};

export const TokensAPI = {
  list: (mapId: number) => api.get(`/maps/${mapId}/tokens`),
  create: (
    mapId: number,
    data: {
      kind?: string;
      name?: string;
      color?: string;
      x?: number;
      y?: number;
      ownerUserId?: number;
      hp?: number;
      maxHp?: number;
      visibleToPlayers?: boolean;
    }
  ) => api.post(`/maps/${mapId}/tokens`, data),
  update: (
    id: number,
    data: {
      x?: number;
      y?: number;
      name?: string;
      color?: string;
      hp?: number;
      maxHp?: number;
    }
  ) => api.patch(`/tokens/${id}`, data),
  delete: (id: number) => api.delete(`/tokens/${id}`),
};

export const MessagesAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/messages`),
  create: (gameId: number, data: { content: string }) =>
    api.post(`/games/${gameId}/messages`, data),
};

export const RollsAPI = {
  roll: (gameId: number, data: { expression: string }) =>
    api.post(`/games/${gameId}/roll`, data),
  list: (gameId: number) => api.get(`/games/${gameId}/rolls`),
};

export const MusicAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/music`),
  upload: (gameId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/games/${gameId}/music/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (gameId: number, trackId: number) =>
    api.delete(`/games/${gameId}/music/${trackId}`),
};
