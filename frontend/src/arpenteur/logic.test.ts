import { describe, expect, it } from 'vitest';
import { emptyArpenteur } from './defaults';
import {
  averageRespect,
  canEdit,
  canonicalPost,
  crewPlaces,
  fireGuns,
  formatCoins,
  inventoryTotals,
  parsePrice,
  postFit,
  prepareGuns,
  rangeInfo,
  readyGuns,
  salvoDice,
  suggestCoupons,
  withSection,
} from './logic';
import type { ArpenteurDoc, CrewMember } from './types';

function member(p: Partial<CrewMember>): CrewMember {
  return {
    id: p.id ?? p.name ?? 'x',
    name: 'X',
    playerName: '',
    pc: false,
    userId: null,
    sex: '',
    race: '',
    loyalty: '',
    combat: 0,
    extraction: 0,
    entretien: 0,
    expertise: 0,
    post: '',
    goodPost: '',
    badPost: '',
    price: '',
    coupons: '',
    vie: 0,
    vieMax: 0,
    fatigue: 0,
    respect: 0,
    sortie: false,
    note: '',
    ...p,
  };
}

function crewDoc(): ArpenteurDoc {
  const d = emptyArpenteur();
  d.crew.members = [
    member({
      id: 'malrik',
      name: 'Malrik',
      pc: true,
      userId: 10,
      post: 'Capitaine',
    }),
    member({
      id: 'ssythik',
      name: 'Ssythik',
      pc: true,
      userId: 11,
      post: 'Chirurgien',
    }),
    member({
      id: 'ehpu',
      name: 'Ehpu-Ki',
      post: 'Maître canonnier',
      respect: 10,
    }),
    member({ id: 'hezkan', name: 'Hezkan', post: 'Guetteur', respect: 16 }),
  ];
  return d;
}

describe('droits par poste', () => {
  it('reprend les règles du serveur', () => {
    const d = crewDoc();
    expect(canEdit(d, 'crew', 10, false)).toBe(true);
    expect(canEdit(d, 'crew', 11, false)).toBe(false);
    expect(canEdit(d, 'crewHealth', 11, false)).toBe(true);
    // Canonnier PNJ : le capitaine prend la relève.
    expect(canEdit(d, 'combat', 10, false)).toBe(true);
    expect(canEdit(d, 'combat', 11, false)).toBe(false);
    d.crew.members.push(
      member({
        id: 'd',
        name: 'Destructus',
        userId: 12,
        post: 'maitre-canonnier',
      })
    );
    expect(canEdit(d, 'combat', 10, false)).toBe(false);
    expect(canEdit(d, 'combat', 12, false)).toBe(true);
    expect(canEdit(d, 'permissions', 10, false)).toBe(false);
    expect(canEdit(d, 'permissions', 1, true)).toBe(true);
  });

  it('reconnaît les postes écrits autrement', () => {
    expect(canonicalPost('Contre-maître')).toBe('Contremaître');
    expect(canonicalPost('medecin')).toBe('Chirurgien');
    expect(canonicalPost('Navigateur')).toBe('Navigateur');
  });
});

describe('équipage', () => {
  it('compte les places et le respect sans les personnages joueurs', () => {
    const d = crewDoc();
    expect(crewPlaces(d.crew.members)).toBe(2);
    expect(averageRespect(d)).toEqual({ value: 13, computed: 13 });
    d.crew.respectOverride = 14;
    expect(averageRespect(d).value).toBe(14);
  });

  it('juge le poste affecté', () => {
    expect(postFit(member({ post: 'Guetteur', goodPost: 'Guetteur' }))).toBe(
      'good'
    );
    expect(
      postFit(member({ post: 'Contre-maître', badPost: 'Contremaître' }))
    ).toBe('bad');
    expect(postFit(member({ post: 'Mousse' }))).toBe('neutral');
  });

  it('applique les soins localement sans toucher au reste', () => {
    const d = withSection(crewDoc(), 'crewHealth', [
      { id: 'hezkan', vie: 5, fatigue: 2 },
    ]);
    const h = d.crew.members.find((m) => m.id === 'hezkan')!;
    expect(h.vie).toBe(5);
    expect(h.post).toBe('Guetteur');
  });
});

describe('monnaie', () => {
  it('convertit les prix en pièces de cuivre', () => {
    expect(parsePrice('3 PA')).toBe(30);
    expect(parsePrice('15 PC')).toBe(15);
    expect(parsePrice('1 PO 2 PA 5 PC')).toBe(125);
    expect(parsePrice('Gratuit')).toBe(0);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('beaucoup')).toBeNull();
    expect(formatCoins(34)).toBe('3 PA 4 PC');
    expect(formatCoins(0)).toBe('0 PC');
    expect(formatCoins(160)).toBe('16 PA');
  });

  it('suggère les coupons comme la feuille de cale (moitié arrondie au-dessus)', () => {
    expect(suggestCoupons('3 PA')).toBe(15);
    expect(suggestCoupons('5 PC')).toBe(3);
    expect(suggestCoupons('18 PC')).toBe(9);
  });

  it('additionne poids, valeur et coupons', () => {
    const t = inventoryTotals([
      {
        id: '1',
        type: '',
        name: 'a',
        effect: '',
        weight: 10,
        rarity: 'D',
        price: '3 PA',
        coupons: 15,
      },
      {
        id: '2',
        type: '',
        name: 'b',
        effect: '',
        weight: 2.5,
        rarity: 'C',
        price: '5 PC',
        coupons: null,
      },
    ]);
    expect(t).toEqual({ weight: 12.5, value: 35, coupons: 15 });
  });
});

describe('canons', () => {
  it('prépare, tire et décompte munitions et poudre', () => {
    const d = emptyArpenteur();
    d.combat.decks[0].guns.A1 = {
      slots: 6,
      installed: 4,
      loaded: 2,
      primed: 2,
    };
    d.combat.ammo[0].count = 1;
    d.combat.barrels = [{ id: 'b', uses: 1, max: 5 }];
    expect(readyGuns(d.combat)).toBe(2);
    const prep = prepareGuns(d.combat, 'boulets');
    expect(prep.loaded).toBe(1);
    expect(prep.primed).toBe(1);
    expect(prep.combat.ammo[0].count).toBe(0);
    expect(prep.combat.barrels[0].uses).toBe(0);
    expect(readyGuns(prep.combat)).toBe(3);
    const shot = fireGuns(prep.combat);
    expect(shot.fired).toBe(3);
    expect(shot.combat.decks[0].guns.A1).toEqual({
      slots: 6,
      installed: 4,
      loaded: 0,
      primed: 0,
    });
  });

  it('ne tire pas depuis un pont impossible', () => {
    const d = emptyArpenteur();
    d.combat.decks[1].guns.A1 = {
      slots: 2,
      installed: 2,
      loaded: 2,
      primed: 2,
    };
    expect(readyGuns(d.combat)).toBe(0);
  });

  it('lance 2D6 par boulet, rien pour les filets', () => {
    expect(salvoDice('Boulets de canons', 3)).toBe('6d6');
    expect(salvoDice('Filets de capture', 2)).toBeNull();
    expect(salvoDice('Boulets', 0)).toBeNull();
  });
});

describe('portées', () => {
  it('situe la cible autour du navire', () => {
    expect(rangeInfo({ x: 0, y: -30, label: '' })).toMatchObject({
      side: 'A',
      band: 'courte',
      inLane: true,
    });
    expect(rangeInfo({ x: 100, y: 5, label: '' })).toMatchObject({
      side: 'D',
      band: 'moyenne',
      inLane: true,
    });
    expect(rangeInfo({ x: -80, y: -80, label: '' })).toMatchObject({
      band: 'moyenne',
      inLane: false,
    });
    expect(rangeInfo({ x: 3, y: -120, label: '' })).toMatchObject({
      side: 'A',
      inLane: true,
    });
    expect(rangeInfo({ x: 0, y: 200, label: '' })).toMatchObject({
      side: 'B',
      band: 'longue',
      inLane: false,
    });
    expect(rangeInfo({ x: 400, y: 0, label: '' }).band).toBe('hors');
  });
});
