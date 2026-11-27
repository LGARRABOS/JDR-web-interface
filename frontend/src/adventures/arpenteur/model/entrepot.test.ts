import { describe, expect, it } from 'vitest';
import { entrepotAccess } from './entrepot';

describe('entrepôt', () => {
  const base = { sectorNames: {} as Record<string, string> };

  it('reste fermé sans entrepôt acheté', () => {
    const a = entrepotAccess({ ...base, entrepot: '', sector: 'ZENIT' }, false);
    expect(a.owned).toBe(false);
    expect(a.open).toBe(false);
  });

  it("s'ouvre dans n'importe quelle ville", () => {
    const a = entrepotAccess(
      { ...base, entrepot: 'ZENIT', sector: 'RAKDOS' },
      false
    );
    expect(a).toMatchObject({ owned: true, open: true, cityName: 'Zenit' });
  });

  it('reste fermé dans le désert ou en route', () => {
    expect(
      entrepotAccess({ ...base, entrepot: 'ZENIT', sector: 'M2' }, false).open
    ).toBe(false);
    expect(
      entrepotAccess({ ...base, entrepot: 'ZENIT', sector: 'ZENIT' }, true).open
    ).toBe(false);
  });
});
