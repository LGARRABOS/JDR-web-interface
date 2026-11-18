import type { ArpenteurDoc, Build } from './types';

// Valeurs par défaut, identiques à backend/internal/arpenteur/normalize.go.

export function defaultBuild(): Build {
  return {
    allure: 'protector',
    quille: { type: 'simple', material: 'chene' },
    coque: { type: 'legere', material: 'chene' },
    mats: {
      type: 'triple',
      sailColor: '#e8dcc0',
      flagColor: '#9b2c2c',
      flagEmblem: 'soleil',
    },
    ponts: 1,
    poupe: {
      material: 'chene',
      gouvernail: 'classique',
      luminaires: 'lanternes',
    },
    proue: { sculpture: 'aucune', material: 'flotte' },
    deco: { bands: [], trim: '#c9a227' },
    tenue: { color: '#6b4f2a', accent: '#c9a227' },
    rooms: [],
  };
}

const emptyGuns = () => ({
  A1: { slots: 0, installed: 0, loaded: 0, primed: 0 },
  A2: { slots: 0, installed: 0, loaded: 0, primed: 0 },
  A3: { slots: 0, installed: 0, loaded: 0, primed: 0 },
});

export function emptyArpenteur(): ArpenteurDoc {
  return {
    name: 'Arpenteur',
    number: 1,
    formerOwner: '',
    build: defaultBuild(),
    pending: null,
    history: [],
    expedition: {
      number: 1,
      coupons: 0,
      couponsNote: '',
      patronQuest: '',
      other: '',
      players: '',
      fields: [],
    },
    crew: {
      capacity: 7,
      respectOverride: null,
      fatigueMax: 10,
      respectMax: 20,
      members: [],
    },
    combat: {
      constitution: 10,
      constitutionMax: 10,
      repairParts: 10,
      repairPartsMax: 10,
      decks: [
        {
          id: 'grand',
          name: 'Grand pont',
          available: true,
          guns: {
            A1: { slots: 6, installed: 0, loaded: 0, primed: 0 },
            A2: { slots: 2, installed: 0, loaded: 0, primed: 0 },
            A3: { slots: 1, installed: 0, loaded: 0, primed: 0 },
          },
        },
        {
          id: 'superieur',
          name: 'Pont supérieur',
          available: false,
          guns: emptyGuns(),
        },
        {
          id: 'inferieur',
          name: 'Pont inférieur',
          available: false,
          guns: emptyGuns(),
        },
      ],
      ammo: [
        { id: 'boulets', name: 'Boulets de canon', count: 0 },
        { id: 'filets', name: 'Filets de capture', count: 0 },
      ],
      powderReserve: 0,
      powderReserveMax: 10,
      barrels: [],
      lastSalvo: null,
    },
    orders: { step: 0, ammo: '', target: null },
    hold: { title: 'Cale', description: '', capacity: 0, items: [] },
    cave: { title: 'Cave', description: '', capacity: 0, items: [] },
    map: {
      sector: '',
      destination: '',
      sectorNames: {},
      trail: [],
      imageUrl: '',
      ship: null,
      heading: 0,
      markers: [],
    },
    permissions: {
      ship: { posts: [], fallback: [] },
      expedition: { posts: ['Capitaine'], fallback: [] },
      crew: { posts: ['Capitaine', 'Contremaître'], fallback: [] },
      crewHealth: { posts: ['Chirurgien'], fallback: [] },
      combat: {
        posts: ['Maître canonnier'],
        fallback: ['Capitaine', 'Contremaître'],
      },
      orders: {
        posts: ['Capitaine', 'Guetteur', 'Contremaître', 'Maître canonnier'],
        fallback: [],
      },
      hold: { posts: ['Capitaine', 'Contremaître', 'Mousse'], fallback: [] },
      cave: { posts: ['Capitaine'], fallback: [] },
      map: { posts: ['Capitaine', 'Guetteur'], fallback: [] },
    },
    log: [],
  };
}
