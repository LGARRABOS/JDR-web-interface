import { describe, expect, it } from 'vitest';
import { characterLook, darken, facingFromKey } from './character';

describe('personnages', () => {
  it('les flèches donnent la direction du regard', () => {
    expect(facingFromKey('ArrowDown')).toBe(0);
    expect(facingFromKey('ArrowLeft')).toBe(90);
    expect(facingFromKey('ArrowUp')).toBe(180);
    expect(facingFromKey('ArrowRight')).toBe(270);
    expect(facingFromKey('a')).toBeNull();
  });

  it('un joueur garde toujours la même apparence', () => {
    expect(characterLook(7)).toEqual(characterLook(7));
    expect(characterLook(-3)).toEqual(characterLook(3));
  });

  it('assombrit une couleur', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('rouge')).toBe('#1f2937');
  });
});
