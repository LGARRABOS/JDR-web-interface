import { POSTS } from './catalog';
import type {
  ArpenteurDoc,
  Battery,
  Combat,
  CrewMember,
  GunType,
  HealthUpdate,
  Item,
  Section,
  SelfUpdate,
  ShipSection,
  Target,
} from './types';

// Logique partagée de l'arpenteur : droits par poste (mêmes règles que le
// serveur, backend/internal/arpenteur/perm.go), prix, canons et portées.

export const GUN_TYPE_IDS: GunType[] = ['A1', 'A2', 'A3'];

/** Minuscules, sans accents ni espaces : « Contre-maître » → « contremaitre ». */
export function foldKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Poste canonique (« contremaitre » → « Contremaître »), inconnu gardé tel quel. */
export function canonicalPost(p: string): string {
  const k = foldKey(p);
  if (!k) return '';
  if (k === 'medecin') return 'Chirurgien';
  if (k === 'canonnier' || k === 'maitrecanonier') return 'Maître canonnier';
  return POSTS.find((c) => foldKey(c) === k) ?? p.trim();
}

function userPosts(doc: ArpenteurDoc, userId: number): Set<string> {
  const out = new Set<string>();
  for (const m of doc.crew.members) {
    if (m.userId === userId && m.post) out.add(foldKey(canonicalPost(m.post)));
  }
  return out;
}

function playerHoldsAny(doc: ArpenteurDoc, posts: string[]): boolean {
  const want = new Set(posts.map(foldKey));
  return doc.crew.members.some(
    (m) => m.userId != null && want.has(foldKey(canonicalPost(m.post)))
  );
}

/** Ce participant peut-il modifier la section ? */
export function canEdit(
  doc: ArpenteurDoc,
  section: Section,
  userId: number,
  isGM: boolean
): boolean {
  if (isGM) return true;
  if (section === 'permissions') return false;
  if (section === 'crewSelf')
    return doc.crew.members.some((m) => m.userId === userId);
  if (section === 'crewHealth' && canEdit(doc, 'crew', userId, false))
    return true;
  const perm = doc.permissions[section];
  if (!perm) return false;
  const mine = userPosts(doc, userId);
  if (perm.posts.some((p) => mine.has(foldKey(p)))) return true;
  return (
    perm.fallback.length > 0 &&
    !playerHoldsAny(doc, perm.posts) &&
    perm.fallback.some((p) => mine.has(foldKey(p)))
  );
}

export type Rights = Record<Section, boolean>;

export function rightsFor(
  doc: ArpenteurDoc,
  userId: number,
  isGM: boolean
): Rights {
  const sections: Section[] = [
    'ship',
    'expedition',
    'crew',
    'crewHealth',
    'combat',
    'orders',
    'hold',
    'cave',
    'map',
    'permissions',
    'crewSelf',
  ];
  return Object.fromEntries(
    sections.map((s) => [s, canEdit(doc, s, userId, isGM)])
  ) as Rights;
}

/** Postes occupés par ce joueur (affichage). */
export function postsOf(doc: ArpenteurDoc, userId: number): string[] {
  return doc.crew.members
    .filter((m) => m.userId === userId && m.post)
    .map((m) => canonicalPost(m.post));
}

/** Contenu actuel d'une section (pour l'envoyer modifié). */
export function shipSection(doc: ArpenteurDoc): ShipSection {
  return {
    name: doc.name,
    number: doc.number,
    formerOwner: doc.formerOwner,
    build: doc.build,
    pending: doc.pending,
    history: doc.history,
  };
}

/** Applique localement une section (affichage immédiat avant la réponse du serveur). */
export function withSection(
  doc: ArpenteurDoc,
  section: Section,
  value: unknown
): ArpenteurDoc {
  switch (section) {
    case 'ship':
      return { ...doc, ...(value as ShipSection) };
    case 'crewHealth': {
      const byId = new Map((value as HealthUpdate[]).map((h) => [h.id, h]));
      return {
        ...doc,
        crew: {
          ...doc.crew,
          members: doc.crew.members.map((m) => {
            const h = byId.get(m.id);
            return h ? { ...m, vie: h.vie, fatigue: h.fatigue } : m;
          }),
        },
      };
    }
    case 'crewSelf': {
      const byId = new Map((value as SelfUpdate[]).map((h) => [h.id, h]));
      return {
        ...doc,
        crew: {
          ...doc.crew,
          members: doc.crew.members.map((m) => {
            const h = byId.get(m.id);
            return h ? { ...m, vieMax: h.vieMax } : m;
          }),
        },
      };
    }
    case 'permissions':
      return { ...doc, permissions: value as ArpenteurDoc['permissions'] };
    default:
      return { ...doc, [section]: value } as ArpenteurDoc;
  }
}

export function newId(): string {
  const a = new Uint8Array(6);
  (
    globalThis.crypto ?? {
      getRandomValues: (x: Uint8Array) =>
        x.map(() => Math.floor(Math.random() * 256)),
    }
  ).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Équipage -------------------------------------------------------------------

/** Places occupées : les personnages des joueurs ne comptent pas. */
export function crewPlaces(members: CrewMember[]): number {
  return members.filter((m) => !m.pc).length;
}

/** Respect moyen de l'équipage (hors personnages joueurs), ou la valeur fixée. */
export function averageRespect(doc: ArpenteurDoc): {
  value: number;
  computed: number;
} {
  const npcs = doc.crew.members.filter((m) => !m.pc);
  const computed = npcs.length
    ? Math.round(npcs.reduce((s, m) => s + m.respect, 0) / npcs.length)
    : 0;
  return { value: doc.crew.respectOverride ?? computed, computed };
}

/** Adéquation du poste affecté : bon, mauvais ou neutre. */
export function postFit(m: CrewMember): 'good' | 'bad' | 'neutral' {
  const p = foldKey(canonicalPost(m.post));
  if (!p) return 'neutral';
  if (m.goodPost && foldKey(canonicalPost(m.goodPost)) === p) return 'good';
  if (m.badPost && foldKey(canonicalPost(m.badPost)) === p) return 'bad';
  return 'neutral';
}

export function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// --- Monnaie --------------------------------------------------------------------

const COIN_VALUES: Record<string, number> = { pc: 1, pa: 10, po: 100 };

/** « 3 PA » → 30 (en pièces de cuivre). « Gratuit » → 0. Illisible → null. */
export function parsePrice(price: string): number | null {
  const s = price.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('gratuit')) return 0;
  const re = /(\d+(?:[.,]\d+)?)\s*(pc|pa|po)\b/g;
  let total = 0;
  let found = false;
  for (const m of s.matchAll(re)) {
    total += parseFloat(m[1].replace(',', '.')) * COIN_VALUES[m[2]];
    found = true;
  }
  if (!found && /^\d+$/.test(s)) return parseInt(s, 10);
  return found ? Math.round(total) : null;
}

/** 34 → « 3 PA 4 PC » ; 160 → « 16 PA » (les feuilles comptent en PA et PC). */
export function formatCoins(pc: number): string {
  if (pc <= 0) return '0 PC';
  const pa = Math.floor(pc / 10);
  const c = pc % 10;
  return [pa && `${pa} PA`, c && `${c} PC`].filter(Boolean).join(' ');
}

/** Coupons suggérés pour un prix : la moitié, arrondie au-dessus (règle de la feuille de cale). */
export function suggestCoupons(price: string): number | null {
  const pc = parsePrice(price);
  return pc == null ? null : Math.ceil(pc / 2);
}

export function inventoryTotals(items: Item[]) {
  let weight = 0;
  let value = 0;
  let coupons = 0;
  for (const it of items) {
    weight += it.weight;
    value += parsePrice(it.price) ?? 0;
    coupons += it.coupons ?? 0;
  }
  return { weight: Math.round(weight * 10) / 10, value, coupons };
}

// --- Canons ---------------------------------------------------------------------

/** Canons prêts à tirer (chargés et amorcés) sur les ponts utilisables. */
export function readyGuns(combat: Combat): number {
  let n = 0;
  for (const d of combat.decks) {
    if (!d.available) continue;
    for (const t of GUN_TYPE_IDS)
      n += Math.min(d.guns[t].loaded, d.guns[t].primed);
  }
  return n;
}

export function installedGuns(combat: Combat): {
  installed: number;
  slots: number;
} {
  let installed = 0;
  let slots = 0;
  for (const d of combat.decks) {
    for (const t of GUN_TYPE_IDS) {
      installed += d.guns[t].installed;
      slots += d.guns[t].slots;
    }
  }
  return { installed, slots };
}

export function clampBattery(b: Battery): Battery {
  const slots = Math.max(0, Math.min(99, b.slots));
  const installed = Math.max(0, Math.min(slots, b.installed));
  return {
    slots,
    installed,
    loaded: Math.max(0, Math.min(installed, b.loaded)),
    primed: Math.max(0, Math.min(installed, b.primed)),
  };
}

/**
 * Prépare les canons (étape 4) : charge chaque canon installé avec la munition
 * choisie et l'amorce avec la poudre des barils montés, tant qu'il en reste.
 */
export function prepareGuns(
  combat: Combat,
  ammoId: string
): { combat: Combat; loaded: number; primed: number } {
  const ammo = combat.ammo.map((a) => ({ ...a }));
  const stock = ammo.find((a) => a.id === ammoId) ?? ammo[0];
  const barrels = combat.barrels.map((b) => ({ ...b }));
  let loaded = 0;
  let primed = 0;
  const decks = combat.decks.map((d) => {
    if (!d.available) return d;
    const guns = { ...d.guns };
    for (const t of GUN_TYPE_IDS) {
      const b = { ...guns[t] };
      while (b.loaded < b.installed && stock && stock.count > 0) {
        b.loaded++;
        stock.count--;
        loaded++;
      }
      while (b.primed < b.installed) {
        const barrel = barrels.find((x) => x.uses > 0);
        if (!barrel) break;
        barrel.uses--;
        b.primed++;
        primed++;
      }
      guns[t] = b;
    }
    return { ...d, guns };
  });
  return { combat: { ...combat, decks, ammo, barrels }, loaded, primed };
}

/** Tire tous les canons prêts : ils redeviennent vides. */
export function fireGuns(combat: Combat): { combat: Combat; fired: number } {
  let fired = 0;
  const decks = combat.decks.map((d) => {
    if (!d.available) return d;
    const guns = { ...d.guns };
    for (const t of GUN_TYPE_IDS) {
      const ready = Math.min(guns[t].loaded, guns[t].primed);
      if (ready > 0) {
        guns[t] = {
          ...guns[t],
          loaded: guns[t].loaded - ready,
          primed: guns[t].primed - ready,
        };
        fired += ready;
      }
    }
    return { ...d, guns };
  });
  return { combat: { ...combat, decks }, fired };
}

/** Expression de dés des dégâts d'une salve (boulets : 2D6 par canon). */
export function salvoDice(ammoName: string, guns: number): string | null {
  if (guns <= 0) return null;
  const k = foldKey(ammoName);
  if (k.includes('filet')) return null;
  return `${guns * 2}d6`;
}

// --- Portées (schéma de combat) -------------------------------------------------

export type Side = 'A' | 'B' | 'C' | 'D';
export type RangeBand = 'courte' | 'moyenne' | 'longue' | 'hors';

/** Couloirs de tir, d'après le schéma : demi-largeurs avant/arrière (m) et angle des flancs (°). */
export const RANGES = {
  short: 50,
  medium: 150,
  long: 300,
  frontLane: 8,
  rearLane: 14,
  beamAngle: 12,
};

export const SIDE_LABELS: Record<Side, string> = {
  A: 'Avant (A)',
  B: 'Arrière (B)',
  C: 'Bâbord (C)',
  D: 'Tribord (D)',
};

/** Distance, côté du navire et zone de tir d'une cible (navire vers le haut). */
export function rangeInfo(t: Target): {
  distance: number;
  side: Side;
  band: RangeBand;
  inLane: boolean;
} {
  const distance = Math.hypot(t.x, t.y);
  const ahead = -t.y;
  const angle = (Math.atan2(t.x, ahead) * 180) / Math.PI; // 0 = devant, 90 = tribord
  const abs = Math.abs(angle);
  const side: Side = abs <= 45 ? 'A' : abs >= 135 ? 'B' : angle > 0 ? 'D' : 'C';
  const band: RangeBand =
    distance <= RANGES.short
      ? 'courte'
      : distance <= RANGES.medium
        ? 'moyenne'
        : distance <= RANGES.long
          ? 'longue'
          : 'hors';
  let inLane = false;
  if (band === 'courte') inLane = true;
  else if (band === 'moyenne') {
    if (side === 'A') inLane = Math.abs(t.x) <= RANGES.frontLane;
    else if (side === 'B') inLane = Math.abs(t.x) <= RANGES.rearLane;
    else inLane = Math.abs(abs - 90) <= RANGES.beamAngle;
  }
  return { distance, side, band, inLane };
}

// --- Dates ----------------------------------------------------------------------

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
