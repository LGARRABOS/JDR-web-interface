import type { Stage } from './stage';

// Scène 3D en cours (le navire affiché en haut de la page) : la carte des
// points d'intérêt y lit la position du navire et y emprunte ses modèles.
export const live: { stage: Stage | null; mapOpen: boolean } = {
  stage: null,
  mapOpen: false,
};
