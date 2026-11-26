import { describe, expect, it } from 'vitest';
import {
  addPatch,
  isRevealed,
  isVisibleToPlayers,
  patchContains,
  rectFromCorners,
  type FogPatch,
  type FogState,
} from './fog';

const patch = (
  id: number,
  shape: FogPatch['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  reveal: boolean
): FogPatch => ({ id, mapId: 1, shape, x, y, w, h, reveal });

const fog = (patches: FogPatch[], enabled = true): FogState => ({
  mapId: 1,
  enabled,
  patches,
});

describe('brouillard', () => {
  it('sans brouillard, tout est découvert', () => {
    expect(isRevealed(fog([], false), 10, 10)).toBe(true);
    expect(isRevealed(null, 10, 10)).toBe(true);
  });

  it('avec brouillard, seul ce qui est révélé est visible', () => {
    const f = fog([patch(1, 'rect', 0, 0, 100, 100, true)]);
    expect(isRevealed(f, 50, 50)).toBe(true);
    expect(isRevealed(f, 150, 50)).toBe(false);
  });

  it('la dernière zone dessinée l’emporte', () => {
    const f = fog([
      patch(1, 'rect', 0, 0, 100, 100, true),
      patch(2, 'rect', 40, 40, 20, 20, false),
    ]);
    expect(isRevealed(f, 50, 50)).toBe(false);
    expect(isRevealed(f, 10, 10)).toBe(true);
  });

  it('les ellipses ne couvrent pas leurs coins', () => {
    const e = patch(1, 'ellipse', 0, 0, 100, 50, true);
    expect(patchContains(e, 50, 25)).toBe(true);
    expect(patchContains(e, 2, 2)).toBe(false);
  });

  it('la vision autour des personnages perce le brouillard', () => {
    const f = fog([]);
    const pj = [{ x: 500, y: 500 }];
    expect(isVisibleToPlayers(f, 100, pj, 550, 500)).toBe(true);
    expect(isVisibleToPlayers(f, 100, pj, 700, 500)).toBe(false);
    expect(isVisibleToPlayers(f, 0, pj, 550, 500)).toBe(false);
  });

  it('vision seule (sans brouillard) : visible près des personnages uniquement', () => {
    const pj = [{ x: 0, y: 0 }];
    expect(isVisibleToPlayers(null, 50, pj, 10, 10)).toBe(true);
    expect(isVisibleToPlayers(null, 50, pj, 300, 300)).toBe(false);
    expect(isVisibleToPlayers(null, 0, pj, 300, 300)).toBe(true);
    expect(isVisibleToPlayers(null, 50, [], 300, 300)).toBe(true);
  });

  it('remet un rectangle dessiné à l’envers à l’endroit', () => {
    expect(rectFromCorners({ x: 100, y: 80 }, { x: 40, y: 20 })).toEqual({
      x: 40,
      y: 20,
      w: 60,
      h: 60,
    });
  });

  it('n’ajoute pas deux fois la même zone et garde l’ordre', () => {
    let f = fog([patch(2, 'rect', 0, 0, 1, 1, true)]);
    f = addPatch(f, patch(1, 'rect', 0, 0, 1, 1, false));
    f = addPatch(f, patch(2, 'rect', 0, 0, 1, 1, true));
    expect(f.patches.map((p) => p.id)).toEqual([1, 2]);
  });
});
