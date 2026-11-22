import type { Build } from '../arpenteur/types';
import type { Mat4 } from './math';
import type { Lighting } from './renderer';
import type { CrewMember, CrewStyle, ShipParts } from './shipModel';

// Couche « native » : quand le moteur de rendu sait dessiner lui-même le
// navire, l'équipage, le sol et les paysages (rendu réaliste), la mise en
// scène lui confie ces éléments au lieu de pousser ses propres maillages.
// Ce fichier ne contient que des types : le moteur maison n'en dépend pas.

export interface NativeShipOptions {
  guns?: number;
  crew?: number;
  damage?: number;
  scaffolding?: boolean;
  /** Métriques du modèle classique (calage du cadrage, des quais, du hangar). */
  parts: ShipParts;
}

export interface NativeFrame {
  time: number;
  dt: number;
  /** Matrice du navire (pont principal vers y = 0, comme le modèle classique). */
  shipM: Mat4;
  /** 0 = en route, 1 = amarré. */
  dock: number;
  scroll: number;
  calm: number;
  calmX: number;
  biome: string;
  duneAmp: number;
  inVoid: boolean;
  ground: boolean;
  /** Bande de curiosités visible (pas de ville proche). */
  features: boolean;
  night: boolean;
  light: Lighting;
  /** Navires du port (ville affichée). */
  npc: { key: string; build: Build; model: Mat4; glow: number }[];
  /** Habitants (style : indice de tenue). */
  crowd: { member: CrewMember; style: CrewStyle; base: Mat4 }[];
  /** Équipage du navire. */
  crew: CrewMember[];
}

export interface NativeHost {
  /** Prêt à dessiner (matériaux fabriqués). */
  readonly ready: boolean;
  setShip(build: Build, opts: NativeShipOptions): void;
  frame(f: NativeFrame): void;
}
