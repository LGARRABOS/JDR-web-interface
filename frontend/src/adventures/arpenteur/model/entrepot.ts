import { cityById, nodeName } from './keld';
import type { MapState } from './types';

// Entrepôt de l'équipage : il s'achète à la table, comme le hangar, puis le
// MJ l'attribue à une ville depuis la carte. Son stock se consulte partout,
// mais on n'y dépose ou n'y retire des objets que l'arpenteur amarré dans une
// ville, n'importe laquelle (le réseau des entrepôts suit le navire).

export interface EntrepotAccess {
  /** L'équipage possède un entrepôt. */
  owned: boolean;
  /** Nom de la ville où il a été acheté ('' : aucun). */
  cityName: string;
  /** Dépôts et retraits possibles maintenant (hors droits des postes). */
  open: boolean;
  /** Pourquoi c'est fermé ('' quand c'est ouvert). */
  reason: string;
}

export function entrepotAccess(
  map: Pick<MapState, 'entrepot' | 'sector' | 'sectorNames'>,
  travelling: boolean
): EntrepotAccess {
  const id = map.entrepot ?? '';
  const owned = !!id && !!cityById(id);
  const cityName = owned ? nodeName(id, map.sectorNames) : '';
  if (!owned)
    return {
      owned,
      cityName,
      open: false,
      reason:
        "L'équipage n'a pas d'entrepôt : il s'achète à la table, puis le MJ l'attribue dans une ville depuis l'onglet Carte.",
    };
  if (travelling)
    return {
      owned,
      cityName,
      open: false,
      reason:
        "L'arpenteur est en route : l'entrepôt sera accessible à l'amarrage dans une ville.",
    };
  if (!cityById(map.sector))
    return {
      owned,
      cityName,
      open: false,
      reason:
        "L'entrepôt n'est accessible que depuis une ville : amarrez l'arpenteur dans n'importe quelle ville.",
    };
  return { owned, cityName, open: true, reason: '' };
}
