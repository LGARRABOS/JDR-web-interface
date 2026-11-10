import type { Token } from '../../types/game';
import type { GameElementFull } from '../MonsterEditorModal';

/**
 * Ce que le serveur envoie aux joueurs, reproduit côté MJ pour la vue
 * « comme un joueur » : jetons cachés retirés, PV et mana des ennemis masqués.
 */
export function tokensForPlayers(tokens: Token[]): Token[] {
  return tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) =>
      t.kind === 'PJ'
        ? t
        : {
            ...t,
            hp: undefined,
            maxHp: undefined,
            mana: undefined,
            maxMana: undefined,
          }
    );
}

const DEFAULT_FIELDS = ['name', 'image', 'description'];

/** Fiche d'un monstre vaincu réduite aux rubriques visibles par les joueurs. */
export function elementForPlayers(e: GameElementFull): GameElementFull {
  const show = new Set(e.playerFields ?? DEFAULT_FIELDS);
  return {
    id: e.id,
    gameId: e.gameId,
    category: e.category,
    createdAt: e.createdAt,
    iconPosX: e.iconPosX,
    iconPosY: e.iconPosY,
    iconScale: e.iconScale,
    playerFields: e.playerFields,
    name: show.has('name') ? e.name : 'Créature inconnue',
    imageUrl: show.has('image') ? e.imageUrl : '',
    description: show.has('description') ? e.description : undefined,
    uniqueTrait: show.has('uniqueTrait') ? e.uniqueTrait : undefined,
    loot: show.has('loot') ? e.loot : undefined,
    maxHp: show.has('stats') ? e.maxHp : undefined,
    maxMana: show.has('stats') ? e.maxMana : undefined,
  };
}
