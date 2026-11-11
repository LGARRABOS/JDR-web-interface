/** Lecture du petit format texte des articles du guide (voir data/guide.ts). */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; id: string; text: string };

export type GuideBlock =
  | { kind: 'heading'; text: Inline[] }
  | { kind: 'paragraph'; text: Inline[] }
  | { kind: 'tip'; text: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'steps'; items: Inline[][] };

const INLINE = /\*\*([^*]+)\*\*|\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: s.slice(last, at) });
    if (m[1] != null) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', id: m[2], text: m[3] ?? m[2] });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

export function parseGuide(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let para: string[] = [];
  let list: { kind: 'bullets' | 'steps'; items: string[] } | null = null;
  let tip: string[] = [];
  const flush = () => {
    if (para.length)
      blocks.push({ kind: 'paragraph', text: parseInline(para.join(' ')) });
    if (list)
      blocks.push({ kind: list.kind, items: list.items.map(parseInline) });
    if (tip.length)
      blocks.push({ kind: 'tip', text: parseInline(tip.join(' ')) });
    para = [];
    list = null;
    tip = [];
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: parseInline(line.slice(3)) });
      continue;
    }
    if (line.startsWith('> ')) {
      if (para.length || list) flush();
      tip.push(line.slice(2));
      continue;
    }
    const bullet = /^- (.*)$/.exec(line);
    const step = /^\d+\. (.*)$/.exec(line);
    if (bullet || step) {
      const kind = bullet ? 'bullets' : 'steps';
      if (para.length || tip.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? step)![1]);
      continue;
    }
    if (list || tip.length) flush();
    para.push(line);
  }
  flush();
  return blocks;
}

/** Liens [[id]] d'un texte (pour vérifier qu'ils mènent quelque part). */
export function linkTargets(body: string): string[] {
  return [...body.matchAll(/\[\[([^|\]]+)/g)].map((m) => m[1]);
}
