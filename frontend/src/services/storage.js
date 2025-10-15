const STORAGE_KEY = 'eternita_auth';

export const getStoredAuth = () => {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse auth storage', error);
    return { user: null, token: null };
  }
};

export const persistAuth = (value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

export const removeStoredAuth = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
};
