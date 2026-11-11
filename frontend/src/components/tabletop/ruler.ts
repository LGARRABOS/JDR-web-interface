import type { RulerPoint } from '../../realtime/protocol';

/** Distance en cases entre deux points de la carte (ligne droite). */
export function rulerCells(a: RulerPoint, b: RulerPoint, gridSize: number) {
  if (!(gridSize > 0)) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y) / gridSize;
}

/** « 1 case », « 4,5 cases » : arrondi au dixième, virgule française. */
export function formatCells(cells: number) {
  const rounded = Math.round(cells * 10) / 10;
  const text = rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${text} case${rounded >= 2 ? 's' : ''}`;
}
