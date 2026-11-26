import { describe, expect, it } from 'vitest';
import { applyGaugeInput } from './gauge';

describe('applyGaugeInput', () => {
  it('fixe la valeur saisie', () => {
    expect(applyGaugeInput('12', 5, 20)).toBe(12);
  });
  it('retire ou ajoute un montant', () => {
    expect(applyGaugeInput('-5', 12, 20)).toBe(7);
    expect(applyGaugeInput('+3', 12, 20)).toBe(15);
    expect(applyGaugeInput(' - 4 ', 12, 20)).toBe(8);
  });
  it('reste entre 0 et le maximum', () => {
    expect(applyGaugeInput('-50', 12, 20)).toBe(0);
    expect(applyGaugeInput('+50', 12, 20)).toBe(20);
    expect(applyGaugeInput('99', 12, 20)).toBe(20);
  });
  it('ignore une saisie invalide', () => {
    expect(applyGaugeInput('abc', 12, 20)).toBeNull();
    expect(applyGaugeInput('', 12, 20)).toBeNull();
    expect(applyGaugeInput('1.5', 12, 20)).toBeNull();
  });
});
