import { describe, expect, it } from 'vitest';
import { presenceChanges } from './PresenceMenu';
import type { Member } from '../../realtime/protocol';

const m = (userId: number, displayName: string): Member =>
  ({ userId, displayName, role: 'PLAYER' }) as Member;

describe('arrivées et départs', () => {
  it('signale qui arrive et qui part, sans soi-même', () => {
    const players = [m(1, 'Moi'), m(2, 'Alice'), m(3, 'Bob')];
    const r = presenceChanges(
      new Set([1, 2]),
      [m(1, 'Moi'), m(3, 'Bob')],
      players,
      1
    );
    expect(r.joined.map((x) => x.displayName)).toEqual(['Bob']);
    expect(r.left.map((x) => x.displayName)).toEqual(['Alice']);
  });
});
