/**
 * Brouillard de guerre : zones révélées ou recouvertes par le MJ, appliquées
 * dans l'ordre (la dernière zone qui touche un point décide).
 * Coordonnées en unités de la carte, comme les jetons.
 */

export type FogShape = 'rect' | 'ellipse';

export interface FogPatch {
  id: number;
  mapId: number;
  shape: FogShape;
  /** Coin haut-gauche. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** true : révèle ; false : recouvre. */
  reveal: boolean;
}

export interface FogState {
  mapId: number;
  enabled: boolean;
  patches: FogPatch[];
}

export interface Point {
  x: number;
  y: number;
}

export function patchContains(p: FogPatch, x: number, y: number): boolean {
  if (p.shape === 'ellipse') {
    const rx = p.w / 2;
    const ry = p.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (x - (p.x + rx)) / rx;
    const dy = (y - (p.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

/** Le point est-il découvert par les zones du MJ ? (sans brouillard : oui) */
export function isRevealed(
  fog: FogState | null | undefined,
  x: number,
  y: number
) {
  if (!fog?.enabled) return true;
  for (let i = fog.patches.length - 1; i >= 0; i--) {
    const p = fog.patches[i];
    if (patchContains(p, x, y)) return p.reveal;
  }
  return false;
}

/**
 * Ce qu'un joueur voit en un point : les zones découvertes par le MJ, plus un
 * cercle de vision autour de chaque personnage quand le MJ l'a activé.
 * Sans brouillard ni vision, tout est visible.
 */
export function isVisibleToPlayers(
  fog: FogState | null | undefined,
  visionRadius: number,
  characters: Point[],
  x: number,
  y: number
): boolean {
  const vision = visionRadius > 0 && characters.length > 0;
  const nearCharacter =
    vision &&
    characters.some(
      (c) => (c.x - x) ** 2 + (c.y - y) ** 2 <= visionRadius * visionRadius
    );
  if (nearCharacter) return true;
  if (fog?.enabled) return isRevealed(fog, x, y);
  return !vision;
}

/** Rectangle à l'endroit à partir de deux coins opposés. */
export function rectFromCorners(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/** Ajoute une zone reçue du serveur (ignorée si déjà connue). */
export function addPatch(fog: FogState, patch: FogPatch): FogState {
  if (fog.patches.some((p) => p.id === patch.id)) return fog;
  return {
    ...fog,
    patches: [...fog.patches, patch].sort((a, b) => a.id - b.id),
  };
}
