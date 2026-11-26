import { useCallback, useEffect, useState } from 'react';

/** Palettes disponibles. Les couleurs elles-mêmes sont dans src/index.css. */
export const THEMES = [
  {
    id: 'braise',
    name: 'Braise',
    description: 'Bruns profonds et or chaud',
    swatches: ['#120f0c', '#1d1813', '#d4a83a', '#e08a6d'],
  },
  {
    id: 'arcane',
    name: 'Nuit arcane',
    description: 'Bleu nuit, or et violet',
    swatches: ['#0e1018', '#171a26', '#dcb65c', '#a99bff'],
  },
  {
    id: 'foret',
    name: 'Forêt ancienne',
    description: 'Vert profond et bronze',
    swatches: ['#0d1210', '#151c18', '#cda65e', '#7cc7a4'],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_STORAGE_KEY = 'jdr-theme';
const DEFAULT_THEME: ThemeId = 'braise';

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applique un thème à la page et le mémorise dans ce navigateur. */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // stockage indisponible (navigation privée) : le thème reste valable pour la session
  }
  window.dispatchEvent(new CustomEvent('jdr-theme-change', { detail: id }));
}

/** Thème courant et fonction pour le changer (synchronisé entre composants et onglets). */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme);

  useEffect(() => {
    const sync = () => setThemeState(readStoredTheme());
    window.addEventListener('jdr-theme-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jdr-theme-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Un autre onglet a changé de thème : on l'applique aussi ici.
  useEffect(() => {
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => applyTheme(id), []);
  return { theme, setTheme };
}
