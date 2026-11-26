import { describe, expect, it } from 'vitest';
import { columnLetter, compareCells, visibleRows } from './sheetView';

const rows = [
  ['Nom', 'PV'],
  ['Gobelin', '7'],
  ['Ogre', '59'],
  ['Araignée', '10'],
  ['', ''],
];

describe('lecteur de tableur', () => {
  it('garde l’en-tête et filtre les lignes', () => {
    const v = visibleRows(rows, 'og', null);
    expect(v.header).toEqual(['Nom', 'PV']);
    expect(v.body).toEqual([['Ogre', '59']]);
  });

  it('trie les nombres comme des nombres', () => {
    const v = visibleRows(rows, '', { col: 1, dir: 1 });
    expect(v.body.map((r) => r[1])).toEqual(['7', '10', '59', '']);
    const d = visibleRows(rows, '', { col: 1, dir: -1 });
    expect(d.body.map((r) => r[1])).toEqual(['59', '10', '7', '']);
  });

  it('trie le texte sans tenir compte des accents ni de la casse', () => {
    expect(compareCells('araignée', 'Ogre')).toBeLessThan(0);
    expect(compareCells('1,5', '12')).toBeLessThan(0);
  });

  it('nomme les colonnes comme un tableur', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});
