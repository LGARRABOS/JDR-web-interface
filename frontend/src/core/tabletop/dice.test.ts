import { describe, expect, it } from 'vitest';
import { currentSides, withDie } from './dice';

describe('withDie', () => {
  it('change de dé en gardant le modificateur', () => {
    expect(withDie('1d20+5', 8)).toBe('1d8+5');
    expect(withDie('2d6-1', 20)).toBe('1d20-1');
  });

  it('repart de zéro si la formule est invalide ou complexe', () => {
    expect(withDie('', 6)).toBe('1d6');
    expect(withDie('bonjour', 12)).toBe('1d12');
    expect(withDie('1d20+1d4', 10)).toBe('1d10');
  });

  it('ignore les espaces', () => {
    expect(withDie(' 1d20 + 3 ', 4)).toBe('1d4+3');
  });
});

describe('currentSides', () => {
  it('lit le nombre de faces', () => {
    expect(currentSides('1d20+5')).toBe(20);
    expect(currentSides('d100')).toBe(100);
    expect(currentSides('3D6')).toBe(6);
  });

  it('retourne null sans dé', () => {
    expect(currentSides('')).toBeNull();
    expect(currentSides('12')).toBeNull();
  });
});
