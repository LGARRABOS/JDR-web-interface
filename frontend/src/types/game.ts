/** Types métier partagés par la table de jeu (alignés sur backend/internal/domain). */

export interface StatusEffect {
  name: string;
  effect: string;
  turnsRemaining: number;
}

export interface Token {
  id: number;
  mapId: number;
  kind: string;
  name: string;
  color: string;
  iconUrl?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  iconPosX?: number;
  iconPosY?: number;
  iconScale?: number;
  attackRange?: number;
  /** Direction du regard en degrés : 0 bas, 90 gauche, 180 haut, 270 droite. */
  facing?: number;
  visibleToPlayers: boolean;
  ownerUserId?: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  elementId?: number;
  statusEffects?: StatusEffect[];
}

export interface MapData {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  tags?: string[];
}

export interface MapView {
  scale: number;
  offset: { x: number; y: number };
}

export interface MapElement {
  id: number;
  mapId: number;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt?: string;
}
