// Point d'entrée public de l'aventure « Désert de Keld » (l'arpenteur).
// Le cœur du site (core/) n'importe l'aventure que par ce fichier. La vue
// complète (ArpenteurView, 3D comprise) est chargée à la demande par
// pages/TabletopPage via import('@/adventures/arpenteur/ui/ArpenteurView').
export type * from './model/types';
export { emptyArpenteur, defaultBuild } from './model/defaults';
