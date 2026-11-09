import { describe, expect, it } from 'vitest';
import { buildFeed, rollAccent, rollDetail } from './feed';
import type { ChatMessage, DiceRoll } from '../../realtime/protocol';

const msg = (id: number, createdAt?: string): ChatMessage => ({
  id,
  userId: 1,
  role: 'PLAYER',
  content: `message ${id}`,
  createdAt,
});

const roll = (id: number, extra: Partial<DiceRoll> = {}): DiceRoll => ({
  id,
  userId: 1,
  expression: '1d20',
  result: 10,
  ...extra,
});

describe('buildFeed', () => {
  it('mélange messages et jets par ordre chronologique', () => {
    const feed = buildFeed(
      [msg(1, '2026-11-09T10:00:00Z'), msg(2, '2026-11-09T10:02:00Z')],
      [roll(7, { createdAt: '2026-11-09T10:01:00Z' })]
    );
    expect(feed.map((i) => i.kind)).toEqual(['message', 'roll', 'message']);
  });

  it('accepte les dates PostgreSQL et RFC 3339 avec fraction de seconde', () => {
    const feed = buildFeed(
      [msg(1, '2026-11-09T10:00:00.123456Z')],
      [roll(2, { createdAt: '2026-11-09T09:59:59.999Z' })]
    );
    expect(feed[0].kind).toBe('roll');
  });
});

describe('rollDetail', () => {
  it('affiche la formule et le détail', () => {
    expect(
      rollDetail(roll(1, { expression: '1d20+5', details: '13 + 5' }))
    ).toBe('1d20+5 · 13 + 5');
    expect(rollDetail(roll(1, { expression: '2d6' }))).toBe('2d6');
  });
});

describe('rollAccent', () => {
  it('met en avant les 20 et les 1 naturels sur un d20', () => {
    expect(
      rollAccent(roll(1, { expression: '1d20+3', details: '20 + 3' }))
    ).toBe('crit');
    expect(rollAccent(roll(1, { expression: 'd20', details: '1' }))).toBe(
      'fumble'
    );
    expect(
      rollAccent(roll(1, { expression: '1d20', details: '12' }))
    ).toBeUndefined();
  });

  it('ignore les autres dés', () => {
    expect(
      rollAccent(roll(1, { expression: '1d200', details: '20' }))
    ).toBeUndefined();
    expect(
      rollAccent(roll(1, { expression: '2d20', details: '20+1' }))
    ).toBeUndefined();
    expect(
      rollAccent(roll(1, { expression: '1d6', details: '1' }))
    ).toBeUndefined();
  });
});
