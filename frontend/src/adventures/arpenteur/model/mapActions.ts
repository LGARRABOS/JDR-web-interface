import { nodeName, regionById, UNKNOWN } from './keld';
import { TRAVEL_SECONDS } from './travel';
import type { MapState } from './types';

// Déplacements entre secteurs et villes (partagés par l'onglet Carte et la
// maquette 3D) : nouvel état de la carte et ligne du journal.

/** Départ vers une position voisine (voyage animé), ou placement direct par le MJ. */
export function moveTo(
  map: MapState,
  id: string,
  voyage = true
): { next: MapState; log: string } {
  const name = nodeName(id, map.sectorNames);
  // Depuis la position inconnue, le navire surgit toujours d'un portail.
  const fromUnknown = !map.sector;
  const go = (voyage && !!map.sector && map.sector !== id) || fromUnknown;
  return {
    next: {
      ...map,
      sector: id,
      destination: map.destination === id ? '' : map.destination,
      trail: [...map.trail, { sector: id, at: new Date().toISOString() }],
      spot: '',
      hop: null,
      travel: go
        ? {
            from: map.sector || UNKNOWN,
            to: id,
            startedAt: new Date().toISOString(),
            duration: TRAVEL_SECONDS,
          }
        : null,
    },
    log: `${fromUnknown ? "L'arpenteur surgit d'un portail d'Aether :" : go ? 'En route vers' : 'Arrivée :'} ${name}${regionById(id) && name !== id ? ` (${id})` : ''}`,
  };
}

/** Le MJ renvoie le navire à la position inconnue, par un portail. */
export function toUnknown(map: MapState): { next: MapState; log: string } {
  return {
    next: {
      ...map,
      sector: '',
      destination: '',
      spot: '',
      hop: null,
      travel: {
        from: map.sector,
        to: UNKNOWN,
        startedAt: new Date().toISOString(),
        duration: TRAVEL_SECONDS,
      },
    },
    log: "L'arpenteur franchit un portail d'Aether vers l'inconnu",
  };
}
