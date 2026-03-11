import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    delete (config.headers as Record<string, unknown>)['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    if (data && typeof data === 'object' && !data.message && data.error) {
      data.message = data.error;
    }
    if (data && typeof data === 'object' && !data.message && err.response?.status) {
      const status = err.response.status;
      if (status === 401) data.message = 'Identifiants incorrects';
      else if (status === 403) data.message = 'Accès refusé';
      else if (status === 404) data.message = 'Ressource introuvable';
      else if (status >= 500) data.message = 'Erreur serveur, réessayez plus tard';
    }
    return Promise.reject(err);
  }
);

export const AuthAPI = {
  register: (data: { email: string; password: string; displayName: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (data: {
    displayName?: string;
    email?: string;
    password?: string;
  }) => api.patch('/auth/me', data),
  purgeAssets: () => api.post('/auth/me/purge-assets'),
  deleteAccount: () => api.delete('/auth/me'),
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
  update: (gameId: number, data: { tokenMovementLocked?: boolean }) =>
    api.patch(`/games/${gameId}`, data),
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
    return api.post(`/games/${gameId}/character-sheet`, form);
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
  upload: (gameId: number, file: File, name?: string, tags?: string[]) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    if (tags && tags.length > 0) form.append('tags', JSON.stringify(tags));
    return api.post(`/games/${gameId}/maps/upload`, form);
  },
  get: (mapId: number) => api.get(`/maps/${mapId}`),
  update: (mapId: number, data: { name?: string; tags?: string[] }) =>
    api.post(`/maps/${mapId}/update`, data),
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
      iconUrl?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      ownerUserId?: number;
      hp?: number;
      maxHp?: number;
      mana?: number;
      maxMana?: number;
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
      iconUrl?: string;
      width?: number;
      height?: number;
      hp?: number;
      maxHp?: number;
      mana?: number;
      maxMana?: number;
    }
  ) => api.patch(`/tokens/${id}`, data),
  delete: (id: number) => api.delete(`/tokens/${id}`),
};

export const ElementsAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/elements`),
  upload: async (
    gameId: number,
    file: File,
    name?: string,
    category?: string,
    tags?: string[]
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    if (category) form.append('category', category);
    if (tags && tags.length > 0) form.append('tags', JSON.stringify(tags));
    const res = await fetch(`/api/games/${gameId}/elements/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(
        new Error((err as { message?: string }).message ?? res.statusText),
        {
          response: { status: res.status, data: err },
        }
      );
    }
    return { data: await res.json() };
  },
  delete: (gameId: number, id: number) =>
    api.delete(`/games/${gameId}/elements/${id}`),
};

export const MapElementsAPI = {
  list: (mapId: number) => api.get(`/maps/${mapId}/elements`),
  create: (
    mapId: number,
    data: {
      imageUrl: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }
  ) => api.post(`/maps/${mapId}/elements`, data),
  update: (
    id: number,
    data: { x?: number; y?: number; width?: number; height?: number }
  ) => api.patch(`/map-elements/${id}`, data),
  delete: (id: number) => api.delete(`/map-elements/${id}`),
};

export const MessagesAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/messages`),
  create: (gameId: number, data: { content: string }) =>
    api.post(`/games/${gameId}/messages`, data),
};

export const RollsAPI = {
  roll: (gameId: number, data: { expression: string; hidden?: boolean }) =>
    api.post(`/games/${gameId}/roll`, data),
  list: (gameId: number) => api.get(`/games/${gameId}/rolls`),
};

export const MusicAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/music`),
  upload: (gameId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/games/${gameId}/music/upload`, form);
  },
  delete: (gameId: number, trackId: number) =>
    api.delete(`/games/${gameId}/music/${trackId}`),
};
