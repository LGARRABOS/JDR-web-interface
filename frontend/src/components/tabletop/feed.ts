import type { ChatMessage, DiceRoll } from '../../realtime/protocol';

export type FeedItem =
  | { kind: 'message'; at: number; message: ChatMessage }
  | { kind: 'roll'; at: number; roll: DiceRoll };

function timeOf(iso: string | undefined, fallback: number) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? fallback : t;
}

/** Messages et jets mélangés par ordre chronologique. */
export function buildFeed(
  messages: ChatMessage[],
  rolls: DiceRoll[]
): FeedItem[] {
  const all: FeedItem[] = [
    ...messages.map((m, i) => ({
      kind: 'message' as const,
      at: timeOf(m.createdAt, i),
      message: m,
    })),
    ...rolls.map((r, i) => ({
      kind: 'roll' as const,
      at: timeOf(r.createdAt, i),
      roll: r,
    })),
  ];
  // Tri stable : à heure égale, l'ordre d'arrivée est conservé.
  return all.sort((a, b) => a.at - b.at);
}

/** Détail lisible d'un jet : « 1d20+5 · 13 + 5 ». */
export function rollDetail(roll: DiceRoll) {
  if (!roll.details) return roll.expression;
  return `${roll.expression} · ${roll.details}`;
}

/**
 * Réussite ou échec critique sur un d20 unique (20 ou 1 naturel).
 * Retourne undefined pour les autres jets.
 */
export function rollAccent(roll: DiceRoll): 'crit' | 'fumble' | undefined {
  if (!/^1?d20(?![\d])/i.test(roll.expression.trim()) || !roll.details)
    return undefined;
  const natural = parseInt(roll.details, 10);
  if (natural === 20) return 'crit';
  if (natural === 1) return 'fumble';
  return undefined;
}
