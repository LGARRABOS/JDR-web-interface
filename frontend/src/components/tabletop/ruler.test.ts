import { describe, expect, it } from 'vitest';
import { formatCells, rulerCells } from './ruler';

describe('règle', () => {
  it('compte les cases en ligne droite', () => {
    expect(rulerCells({ x: 0, y: 0 }, { x: 150, y: 0 }, 50)).toBe(3);
    expect(rulerCells({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toBe(5);
    expect(rulerCells({ x: 0, y: 0 }, { x: 30, y: 40 }, 0)).toBe(0);
  });

  it('affiche un nombre lisible', () => {
    expect(formatCells(1)).toBe('1 case');
    expect(formatCells(0.44)).toBe('0,4 case');
    expect(formatCells(4.46)).toBe('4,5 cases');
    expect(formatCells(3)).toBe('3 cases');
  });
});
