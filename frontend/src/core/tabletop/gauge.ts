/**
 * Interprète la saisie rapide d'une jauge :
 * « 12 » fixe la valeur, « -5 » retire 5, « +3 » ajoute 3.
 * Le résultat est borné entre 0 et le maximum.
 */
export function applyGaugeInput(
  input: string,
  value: number,
  max: number
): number | null {
  const m = input.trim().match(/^([+-])?\s*(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  const next = m[1] === '-' ? value - n : m[1] === '+' ? value + n : n;
  return Math.max(0, max > 0 ? Math.min(max, next) : next);
}
