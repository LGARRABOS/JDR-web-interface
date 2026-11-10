/** Petits personnages des joueurs : direction du regard et apparence. */

/** Flèche du clavier -> direction (degrés, sens horaire, 0 = vers le bas). */
export const ARROW_FACING: Record<string, number> = {
  ArrowDown: 0,
  ArrowLeft: 90,
  ArrowUp: 180,
  ArrowRight: 270,
};

export function facingFromKey(key: string): number | null {
  return key in ARROW_FACING ? ARROW_FACING[key] : null;
}

const SKIN_TONES = ['#f3d2b3', '#e0ac7e', '#b97a4f', '#7a4b2a'];
const HAIR_COLORS = [
  '#2b1d14',
  '#5a3a22',
  '#a8742f',
  '#d9c27a',
  '#8a3324',
  '#3b3b45',
];

/** Teinte de peau et cheveux stables pour un même joueur. */
export function characterLook(seed: number) {
  const n = Math.abs(Math.trunc(seed));
  return {
    skin: SKIN_TONES[n % SKIN_TONES.length],
    hair: HAIR_COLORS[Math.floor(n / SKIN_TONES.length) % HAIR_COLORS.length],
  };
}

/** Assombrit une couleur #rrggbb (contour du personnage). */
export function darken(hex: string, amount = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#1f2937';
  const v = parseInt(m[1], 16);
  const f = (c: number) => Math.round(c * (1 - amount));
  const r = f((v >> 16) & 255);
  const g = f((v >> 8) & 255);
  const b = f(v & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
