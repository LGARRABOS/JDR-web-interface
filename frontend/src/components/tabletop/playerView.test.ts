import { describe, expect, it } from 'vitest';
import { elementForPlayers, tokensForPlayers } from './playerView';
import type { Token } from '../../types/game';

const tok = (id: number, extra: Partial<Token>): Token => ({
  id,
  mapId: 1,
  kind: 'PNJ',
  name: `T${id}`,
  color: '#fff',
  x: 0,
  y: 0,
  visibleToPlayers: true,
  ...extra,
});

describe('vue joueur', () => {
  it('retire les jetons cachés et les PV des ennemis', () => {
    const out = tokensForPlayers([
      tok(1, { hp: 5, maxHp: 10 }),
      tok(2, { visibleToPlayers: false }),
      tok(3, { kind: 'PJ', hp: 8, maxHp: 12 }),
    ]);
    expect(out.map((t) => t.id)).toEqual([1, 3]);
    expect(out[0].hp).toBeUndefined();
    expect(out[0].maxHp).toBeUndefined();
    expect(out[1].hp).toBe(8);
  });

  it('ne montre que les rubriques choisies par le MJ', () => {
    const base = {
      id: 1,
      gameId: 1,
      name: 'Gobelin',
      imageUrl: '/g.png',
      category: 'monster',
      createdAt: '',
      description: 'Petit',
      loot: 'Or',
      maxHp: 7,
    };
    const def = elementForPlayers(base);
    expect(def.name).toBe('Gobelin');
    expect(def.description).toBe('Petit');
    expect(def.loot).toBeUndefined();
    expect(def.maxHp).toBeUndefined();

    const lootOnly = elementForPlayers({ ...base, playerFields: ['loot'] });
    expect(lootOnly.name).toBe('Créature inconnue');
    expect(lootOnly.imageUrl).toBe('');
    expect(lootOnly.loot).toBe('Or');
  });
});
