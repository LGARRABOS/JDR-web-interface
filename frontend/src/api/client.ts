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
    if (
      data &&
      typeof data === 'object' &&
      !data.message &&
      err.response?.status
    ) {
      const status = err.response.status;
      if (status === 401) data.message = 'Identifiants incorrects';
      else if (status === 403) data.message = 'Accès refusé';
      else if (status === 404) data.message = 'Ressource introuvable';
      else if (status >= 500)
        data.message = 'Erreur serveur, réessayez plus tard';
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
  update: (
    gameId: number,
    data: { tokenMovementLocked?: boolean; fogVisionRadius?: number }
  ) => api.patch(`/games/${gameId}`, data),
  delete: (id: number) => api.delete(`/games/${id}`),
  /** Un joueur quitte la partie (le MJ, lui, la supprime). */
  leave: (id: number) => api.delete(`/games/${id}/players/me`),
};

/** Bibliothèque personnelle (ressources hors partie). */
export const LibraryAPI = {
  get: () => api.get('/library'),
};

export const CharacterSheetsAPI = {
  get: (gameId: number, userId?: number) =>
    api.get(
      `/games/${gameId}/character-sheet`,
      userId != null ? { params: { userId } } : undefined
    ),
  patch: (gameId: number, data: Record<string, unknown>) =>
    api.patch(`/games/${gameId}/character-sheet`, { data }),
  upload: (gameId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/games/${gameId}/character-sheet`, form);
  },
  uploadAvatar: (gameId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/games/${gameId}/character-sheet/avatar`, form);
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

export type TokenUpdate = Parameters<(typeof TokensAPI)['update']>[1];

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
      elementId?: number;
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
      iconPosX?: number;
      iconPosY?: number;
      iconScale?: number;
      attackRange?: number;
      facing?: number;
      visibleToPlayers?: boolean;
      hp?: number;
      maxHp?: number;
      mana?: number;
      maxMana?: number;
      statusEffects?: Array<{
        name: string;
        effect: string;
        turnsRemaining: number;
      }>;
    }
  ) => api.patch(`/tokens/${id}`, data),
  delete: (id: number) => api.delete(`/tokens/${id}`),
};

export const ElementsAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/elements`),
  get: (gameId: number, id: number) =>
    api.get(`/games/${gameId}/elements/${id}`),
  update: (
    gameId: number,
    id: number,
    data: {
      name?: string;
      description?: string;
      uniqueTrait?: string;
      loot?: string;
      maxHp?: number;
      maxMana?: number;
      iconPosX?: number;
      iconPosY?: number;
      iconScale?: number;
      playerFields?: string[];
    }
  ) => api.patch(`/games/${gameId}/elements/${id}`, data),
  upload: (
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
    return api.post(`/games/${gameId}/elements/upload`, form);
  },
  delete: (gameId: number, id: number) =>
    api.delete(`/games/${gameId}/elements/${id}`),
};

/** Documents montrés aux joueurs (lettres, plans, portraits…). */
export const HandoutsAPI = {
  list: (gameId: number) => api.get(`/games/${gameId}/handouts`),
  create: (gameId: number, title: string, body: string, file?: File) => {
    const form = new FormData();
    form.append('title', title);
    form.append('body', body);
    if (file) form.append('file', file);
    return api.post(`/games/${gameId}/handouts`, form);
  },
  update: (
    gameId: number,
    id: number,
    data: { title?: string; body?: string; shown?: boolean }
  ) => api.patch(`/games/${gameId}/handouts/${id}`, data),
  show: (gameId: number, id: number) =>
    api.post(`/games/${gameId}/handouts/${id}/show`),
  /** Contenu converti d'un document ou tableur importé. */
  content: (gameId: number, id: number) =>
    api.get(`/games/${gameId}/handouts/${id}/content`),
  delete: (gameId: number, id: number) =>
    api.delete(`/games/${gameId}/handouts/${id}`),
};

/** Notes privées du MJ : la partie (sans mapId) ou une carte. */
export const NotesAPI = {
  get: (gameId: number, mapId?: number) =>
    api.get(`/games/${gameId}/notes`, {
      params: mapId ? { mapId } : undefined,
    }),
  put: (gameId: number, body: string, mapId?: number) =>
    api.put(
      `/games/${gameId}/notes`,
      { body },
      { params: mapId ? { mapId } : undefined }
    ),
};

/** Brouillard de guerre (réservé au MJ, sauf la lecture). */
export const FogAPI = {
  get: (mapId: number) => api.get(`/maps/${mapId}/fog`),
  setEnabled: (mapId: number, enabled: boolean) =>
    api.post(`/maps/${mapId}/fog/enabled`, { enabled }),
  addPatch: (
    mapId: number,
    data: {
      shape: 'rect' | 'ellipse';
      x: number;
      y: number;
      w: number;
      h: number;
      reveal: boolean;
    }
  ) => api.post(`/maps/${mapId}/fog/patches`, data),
  undo: (mapId: number) => api.post(`/maps/${mapId}/fog/undo`),
  reset: (mapId: number, revealAll: boolean) =>
    api.post(`/maps/${mapId}/fog/reset`, { revealAll }),
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
