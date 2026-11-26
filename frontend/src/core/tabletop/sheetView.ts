/** Outils du lecteur de tableur : filtre et tri des lignes. */

export type SortState = { col: number; dir: 1 | -1 } | null;

const collator = new Intl.Collator('fr', {
  numeric: true,
  sensitivity: 'base',
});

function asNumber(v: string): number | null {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^-?\d+(\.\d+)?%?$/.test(s)) return null;
  return parseFloat(s);
}

/** Compare deux cellules : nombres entre eux, sinon ordre alphabétique (vides à la fin). */
export function compareCells(a: string, b: string): number {
  if (a.trim() === '' && b.trim() !== '') return 1;
  if (b.trim() === '' && a.trim() !== '') return -1;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na != null && nb != null) return na - nb;
  return collator.compare(a, b);
}

/**
 * Lignes affichées : la première ligne sert d'en-tête (jamais filtrée ni
 * triée), les autres sont filtrées par le texte cherché puis triées.
 */
export function visibleRows(
  rows: string[][],
  query: string,
  sort: SortState
): { header: string[]; body: string[][] } {
  const [header = [], ...rest] = rows;
  const q = query.trim().toLocaleLowerCase('fr');
  let body = q
    ? rest.filter((r) => r.some((c) => c.toLocaleLowerCase('fr').includes(q)))
    : rest;
  if (sort) {
    body = [...body].sort((x, y) => {
      const a = x[sort.col] ?? '';
      const b = y[sort.col] ?? '';
      // Les cellules vides restent en bas, quel que soit le sens du tri.
      const ea = a.trim() === '';
      const eb = b.trim() === '';
      if (ea !== eb) return ea ? 1 : -1;
      return sort.dir * compareCells(a, b);
    });
  }
  return { header, body };
}

/** Lettre de colonne façon tableur : 0 -> A, 26 -> AA. */
export function columnLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
