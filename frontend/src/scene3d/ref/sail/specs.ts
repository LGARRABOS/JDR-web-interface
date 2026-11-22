import type * as THREE from 'three';

// Description des voiles par le navire (positions des attaches).

export interface SquareSpec {
  kind: 'square';
  /** abscisse de la vergue (devant le mât) */
  x: number;
  yardY: number;
  yTop: number;
  yBot: number;
  halfTop: number;
  halfBot: number;
  belly: number;
  /** points d'arrivée des écoutes (bâbord/tribord : z signé) */
  sheetTo: (side: number) => THREE.Vector3;
  /** ordre de manœuvre (0 = bas) et mât */
  tier: number;
  mast: number;
}
export interface JibSpec {
  kind: 'jib';
  tack: THREE.Vector3;
  head: THREE.Vector3;
  clew: THREE.Vector3;
  belly: number;
  sheetTo: (side: number) => THREE.Vector3;
  halyardTo: THREE.Vector3;
  tier: number;
}
/** Voile aileron à lattes (gréement « pique ») : quadrilatère en arrière du mât. */
export interface JunkSpec {
  kind: 'junk';
  /** pied du guindant (mât), tête du guindant, pic, point d'écoute (bôme) */
  tack: THREE.Vector3;
  throat: THREE.Vector3;
  peak: THREE.Vector3;
  clew: THREE.Vector3;
  belly: number;
  sheetTo: (side: number) => THREE.Vector3;
  halyardTo: THREE.Vector3;
  tier: number;
}
export type SailSpec = SquareSpec | JibSpec | JunkSpec;
