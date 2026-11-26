/** Remplace le dé d'une formule en gardant le modificateur : « 1d20+5 » + d8 → « 1d8+5 ». */
export function withDie(expr: string, sides: number) {
  const m = expr.trim().match(/^(\d*)d\d+(.*)$/i);
  const modifier = m ? m[2].replace(/\s+/g, '') : '';
  return `1d${sides}${/^[+-]\d+$/.test(modifier) ? modifier : ''}`;
}

/** Nombre de faces du dé d'une formule (« 2d6+3 » → 6), ou null. */
export function currentSides(expr: string) {
  const m = expr.trim().match(/^\d*d(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}
