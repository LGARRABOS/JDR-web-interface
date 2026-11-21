/**
 * Guide du jeu. Chaque article est écrit dans un petit format texte :
 *   paragraphes séparés par une ligne vide, « - » pour une liste,
 *   « 1. » pour des étapes, « > » pour une astuce, « ## » pour un intertitre,
 *   **gras**, et [[id-article|texte]] pour un lien vers un autre article.
 */

export type Audience = 'tous' | 'joueur' | 'mj';

export interface GuideChapter {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface GuideArticle {
  id: string;
  chapter: string;
  title: string;
  /** Une phrase : ce que l'article permet de faire. */
  summary: string;
  audience: Audience;
  keywords: string[];
  body: string;
  related?: string[];
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: 'demarrer',
    title: 'Bien démarrer',
    description: 'Compte, parties, invitations',
    icon: '🚀',
  },
  {
    id: 'table',
    title: 'À la table',
    description: 'Carte, dés, chat, documents',
    icon: '🎲',
  },
  {
    id: 'personnage',
    title: 'Mon personnage',
    description: 'Jeton, fiche, PV',
    icon: '🧝',
  },
  {
    id: 'mj-preparer',
    title: 'Préparer (MJ)',
    description: 'Cartes, monstres, musiques, bibliothèque',
    icon: '📚',
  },
  {
    id: 'mj-mener',
    title: 'Mener la partie (MJ)',
    description: 'Jetons, brouillard, tours, documents',
    icon: '🧙',
  },
  {
    id: 'gemma',
    title: 'Univers GEMMA',
    description: 'Ce qui change dans une partie GEMMA',
    icon: '✨',
  },
  {
    id: 'compte',
    title: 'Compte et réglages',
    description: 'Profil, couleurs, données',
    icon: '⚙️',
  },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  // --- Bien démarrer -------------------------------------------------------
  {
    id: 'compte',
    chapter: 'demarrer',
    title: 'Créer un compte et se connecter',
    summary: 'Un compte suffit pour jouer comme pour mener des parties.',
    audience: 'tous',
    keywords: ['inscription', 'connexion', 'mot de passe'],
    body: `Sur la page d'accueil, choisissez « Créer un compte », puis renseignez un nom d'affichage, une adresse e-mail et un mot de passe. Le même compte sert pour être joueur dans certaines parties et MJ dans d'autres.

Votre nom d'affichage est celui que voient les autres à la table. Vous pouvez le changer à tout moment dans [[profil|votre profil]].`,
    related: ['creer-partie', 'rejoindre-partie'],
  },
  {
    id: 'creer-partie',
    chapter: 'demarrer',
    title: 'Créer une partie',
    summary: 'Ouvrir une table dont vous êtes le Maître du Jeu.',
    audience: 'mj',
    keywords: ['nouvelle partie', 'MJ', 'code', 'invitation', 'GEMMA', 'test'],
    body: `1. Sur « Mes parties », remplissez le cadre « Créer une partie » (le nom est facultatif).
2. Cochez « Univers GEMMA » si vous jouez dans cet univers : ce choix ne se change plus ensuite (voir [[gemma|Univers GEMMA]]). Choisissez alors « GEMMA classique » ou « GEMMA Arpenteur » ([[arpenteur|le vaisseau des sables]]).
3. Pour essayer les mécaniques seul, cochez « Partie test » : vous y incarnez des joueurs fictifs (voir [[partie-test|Partie test]]).
4. Cliquez sur « Créer » : vous êtes le MJ de la partie.

Un code d'invitation est créé. Copiez-le depuis la carte de la partie ou, à la table, avec le bouton « Inviter » en haut à droite, puis envoyez-le à vos joueurs.

> Préparez vos cartes et monstres à l'avance dans [[bibliotheque|Ma bibliothèque]] : ils seront disponibles dans toutes vos parties.`,
    related: ['rejoindre-partie', 'preparer', 'bibliotheque', 'partie-test'],
  },
  {
    id: 'rejoindre-partie',
    chapter: 'demarrer',
    title: 'Rejoindre une partie',
    summary: 'Entrer à la table avec le code donné par le MJ.',
    audience: 'joueur',
    keywords: ['code', 'invitation', 'rejoindre'],
    body: `1. Demandez le code d'invitation au MJ (6 caractères).
2. Sur « Mes parties », saisissez-le dans « Rejoindre une partie » puis validez.
3. La partie apparaît dans votre liste : cliquez sur « Ouvrir ».

Dès qu'une carte est affichée, votre personnage y apparaît, au centre, avec les autres joueurs.`,
    related: ['decouvrir-table', 'mon-personnage'],
  },
  {
    id: 'mes-parties',
    chapter: 'demarrer',
    title: 'Mes parties : ouvrir, quitter, supprimer',
    summary: 'Retrouver vos tables et en sortir proprement.',
    audience: 'tous',
    keywords: ['quitter', 'supprimer', 'liste', 'lobby'],
    body: `La page « Mes parties » liste toutes vos tables, avec la carte affichée et le nombre de joueurs. « Ouvrir » vous emmène à la table.

## Quitter (joueur)
Le bouton de sortie, sur la carte de la partie, vous retire de la table après confirmation. Votre personnage disparaît des cartes ; votre fiche est gardée et vous la retrouvez si vous revenez avec le code.

## Supprimer (MJ)
Pour le MJ, quitter sa partie revient à la supprimer pour tout le monde (fiches, messages et lancers compris). Un avertissement s'affiche avant. Vos cartes, monstres, décors et musiques ne sont pas perdus : ils sont rangés dans [[bibliotheque|Ma bibliothèque]].`,
  },

  // --- À la table ------------------------------------------------------------
  {
    id: 'decouvrir-table',
    chapter: 'table',
    title: 'Découvrir la table',
    summary: 'Ce que contient chaque zone de l’écran.',
    audience: 'tous',
    keywords: ['interface', 'écran', 'panneau', 'barre'],
    body: `La carte occupe tout l'écran. Autour d'elle :

- **En haut à gauche** : retour à « Mes parties », nom de la partie, choix de la carte (MJ) et [[regle|la règle de mesure]].
- **En haut à droite** : [[qui-est-la|les participants]], l'état de la connexion, le bouton « Inviter » et « Ressources » (MJ), et le bouton « ? » qui ouvre ce guide.
- **À droite** : le panneau à onglets (Chat, Fiche, Musique, Docs… ; le MJ a aussi Jetons, Fiches et Notes). La flèche le replie pour libérer la carte.
- **En bas** : [[des|la barre de dés]] et le lecteur de musique.
- **À gauche (MJ)** : [[outils-mj|la barre d'outils du MJ]].

> Sur téléphone, le panneau s'ouvre en bas de l'écran avec le bouton « Panneau » (voir [[mobile|Téléphone et tablette]]).`,
    related: ['qui-est-la', 'carte-vue'],
  },
  {
    id: 'qui-est-la',
    chapter: 'table',
    title: 'Qui est à la table ?',
    summary: 'Voir d’un coup d’œil qui est connecté.',
    audience: 'tous',
    keywords: ['connectés', 'présence', 'hors ligne', 'joueurs'],
    body: `En haut à droite, la liste des participants montre le MJ et chaque joueur, avec une pastille : **verte** s'il est connecté, **grise** s'il est absent. Le compteur indique combien de personnes sont présentes.

Cliquez sur la liste pour voir le détail : nom du personnage, nom du joueur, rôle et état de connexion. Sur la carte, le personnage d'un joueur absent reste à sa place avec la mention « hors ligne ».

La couleur d'un joueur se retrouve sur sa pastille, ses messages et sa règle de mesure. Quand quelqu'un arrive ou s'en va, une courte notification s'affiche sous la barre du haut.`,
  },
  {
    id: 'carte-vue',
    chapter: 'table',
    title: 'Se déplacer sur la carte',
    summary: 'Zoomer et faire glisser la carte.',
    audience: 'tous',
    keywords: ['zoom', 'vue', 'recentrer', 'molette'],
    body: `- **Zoomer** : molette de la souris, ou pincer à deux doigts.
- **Faire glisser la carte** : cliquer-glisser sur une zone vide (ou au doigt).

Le MJ cadre la carte pour tout le monde : quand il zoome ou la déplace, les joueurs suivent. Un joueur peut ajuster sa propre vue, utile sur un petit écran ; elle se recale au prochain recadrage du MJ.

> MJ : le bouton « Recentrer la carte pour tout le monde » de la barre d'outils remet la carte entière à l'écran chez tous.`,
  },
  {
    id: 'regle',
    chapter: 'table',
    title: 'Mesurer une distance',
    summary: 'La règle compte les cases entre deux points.',
    audience: 'tous',
    keywords: ['règle', 'distance', 'cases', 'portée'],
    body: `1. Cliquez sur le bouton règle, en haut à gauche, à côté du nom de la partie.
2. Glissez sur la carte (souris ou doigt) : la distance s'affiche en cases, en ligne droite.
3. Relâchez pour terminer. Recliquez sur la règle, ou appuyez sur Échap, pour revenir au mode normal.

Les autres voient votre mesure en direct, à votre couleur et avec votre nom.`,
  },
  {
    id: 'des',
    chapter: 'table',
    title: 'Lancer les dés',
    summary: 'Boutons rapides ou formule, résultats partagés.',
    audience: 'tous',
    keywords: ['dés', 'd20', 'formule', 'critique', 'lancer'],
    body: `La barre de dés, en bas de l'écran :

- Cliquez sur un dé (d4, d6, d8, d10, d12, d20, d100) pour l'ajouter à la formule, puis « Lancer ». Un double-clic sur un dé le lance tout de suite.
- Ou tapez une formule : **NdM+K**, par exemple « 1d20 », « 2d6+3 », « 1d100-5 » (jusqu'à 100 dés).

Le résultat s'affiche pour tout le monde et rejoint le fil du chat, avec le détail des dés. Sur un d20 seul, un 20 naturel (réussite critique) et un 1 naturel (échec critique) sont mis en couleur.

> MJ : cochez « Caché » avant de lancer pour un jet que vous seul voyez (perception, discrétion…).`,
    related: ['chat'],
  },
  {
    id: 'chat',
    chapter: 'table',
    title: 'Discuter dans le chat',
    summary: 'Messages et lancers dans un même fil.',
    audience: 'tous',
    keywords: ['chat', 'messages', 'non lus'],
    body: `L'onglet « Chat » du panneau réunit messages et lancers de dés, dans l'ordre. Tapez votre message en bas puis Entrée.

Votre nom de personnage (ou votre nom d'affichage) apparaît à côté de chaque message, à votre couleur. Quand le panneau est sur un autre onglet, un compteur indique les nouveaux messages.`,
  },
  {
    id: 'musique',
    chapter: 'table',
    title: 'La musique d’ambiance',
    summary: 'Tout le monde entend la même musique, au même moment.',
    audience: 'tous',
    keywords: ['musique', 'son', 'volume'],
    body: `Le MJ choisit et lance la musique ; elle est synchronisée chez tous. Le lecteur, en bas à gauche, indique la piste en cours.

Chacun règle son propre volume (« Mon volume » dans l'onglet Musique) sans changer celui des autres.

> Si vous n'entendez rien, cliquez une fois n'importe où dans la page : les navigateurs bloquent le son tant qu'on n'a pas interagi avec la page.`,
    related: ['musique-mj'],
  },
  {
    id: 'docs-joueur',
    chapter: 'table',
    title: 'Les documents partagés',
    summary: 'Lettres, plans, tableaux : tout ce que le MJ vous a montré.',
    audience: 'tous',
    keywords: [
      'documents',
      'docs',
      'images',
      'tableau',
      'pdf',
      'word',
      'excel',
    ],
    body: `Quand le MJ montre un document, il s'ouvre en grand chez vous. Fermez-le quand vous voulez : vous le retrouvez dans l'onglet « Docs » du panneau.

Selon ce que le MJ a partagé :

- **Texte ou image** : une lettre, un plan, le portrait d'un PNJ.
- **Document** (Word, LibreOffice, texte) : affiché avec ses titres, listes et tableaux.
- **Tableau** (Excel, LibreOffice, CSV) : une feuille par onglet ; cherchez dans le tableau et cliquez sur un en-tête pour trier.
- **PDF** : affiché directement.

Le bouton « Télécharger » récupère le fichier d'origine.`,
    related: ['documents-mj'],
  },
  {
    id: 'mobile',
    chapter: 'table',
    title: 'Jouer sur téléphone ou tablette',
    summary: 'Tout se fait au doigt.',
    audience: 'tous',
    keywords: ['mobile', 'téléphone', 'tablette', 'tactile'],
    body: `- Glissez un doigt pour déplacer la carte ou votre personnage ; pincez à deux doigts pour zoomer.
- Le bouton « Panneau » ouvre chat, fiche et documents en bas de l'écran.
- La barre de dés défile horizontalement si elle est trop large.

Sur tablette en mode paysage, la mise en page est celle d'un ordinateur.`,
  },
  {
    id: 'connexion',
    chapter: 'table',
    title: 'Connexion perdue',
    summary: 'Ce qui se passe quand le réseau coupe.',
    audience: 'tous',
    keywords: ['connexion', 'reconnexion', 'réseau', 'bug'],
    body: `L'indicateur en haut à droite passe à « Reconnexion… » si le réseau coupe. La table se reconnecte seule et récupère l'état complet de la partie : rien n'est perdu.

S'il reste bloqué, cliquez sur « Réessayer ». En revenant sur un onglet resté longtemps en arrière-plan, la table se remet aussi à jour toute seule.`,
  },

  // --- Mon personnage -----------------------------------------------------------
  {
    id: 'mon-personnage',
    chapter: 'personnage',
    title: 'Mon personnage sur la carte',
    summary: 'Le déplacer, l’orienter, voir ses PV.',
    audience: 'joueur',
    keywords: ['jeton', 'déplacer', 'orienter', 'flèches', 'personnage'],
    body: `Votre personnage est un petit personnage vu du dessus, à votre couleur. Il arrive au centre de chaque carte que le MJ affiche, avec ceux des autres joueurs.

- **Déplacer** : glissez-le. Si le MJ a bloqué les déplacements, il reste en place.
- **Orienter** : cliquez dessus puis utilisez les flèches du clavier. Tout le monde voit dans quelle direction il regarde, même quand les déplacements sont bloqués.
- **Voir ses PV** : un clic ouvre sa fiche rapide.

Un clic sur le personnage d'un autre joueur affiche aussi ses PV et son mana (ou aether).`,
    related: ['pv', 'fiche'],
  },
  {
    id: 'pv',
    chapter: 'personnage',
    title: 'Modifier ses PV et son mana',
    summary: 'Saisie rapide depuis la fiche du jeton.',
    audience: 'tous',
    keywords: ['PV', 'mana', 'aether', 'dégâts', 'soin'],
    body: `Cliquez sur votre personnage : sa fiche rapide montre une jauge de PV et une de mana (« Aether » en GEMMA). Sous chaque jauge, un champ accepte :

- **12** : fixe la valeur à 12 ;
- **-5** : retire 5 (dégâts) ;
- **+3** : ajoute 3 (soin).

Validez avec Entrée. Les boutons − et + retirent ou ajoutent le montant saisi (1 par défaut).

Les valeurs suivent votre personnage d'une carte à l'autre. En GEMMA, elles se synchronisent avec [[fiche|votre fiche]].`,
  },
  {
    id: 'fiche',
    chapter: 'personnage',
    title: 'Ma fiche de personnage',
    summary: 'L’onglet « Ma fiche » du panneau.',
    audience: 'joueur',
    keywords: ['fiche', 'personnage', 'pdf', 'nom'],
    body: `## Partie classique
Donnez un nom à votre personnage (il remplace votre nom dans le chat et les lancers) et envoyez votre fiche au format PDF ou Word (10 Mo maximum). Le MJ peut la consulter.

## Partie GEMMA
La fiche se remplit directement dans l'application ; voir [[fiche-gemma|Fiche GEMMA]].`,
  },

  // --- Préparer (MJ) ---------------------------------------------------------------
  {
    id: 'preparer',
    chapter: 'mj-preparer',
    title: 'La page Ressources',
    summary: 'Tout ce que vous préparez : cartes, monstres, décors, musiques.',
    audience: 'mj',
    keywords: ['ressources', 'préparer', 'formats'],
    body: `Depuis la table, le bouton « Ressources » (en haut à droite) ouvre la préparation de la partie. Elle comporte plusieurs onglets : les cartes, l'éditeur de carte, les monstres et décors, les musiques.

Formats acceptés :

- **Cartes, monstres, décors** : PNG, JPG, GIF.
- **Musiques** : MP3, OGG, WAV, M4A.

La même page existe hors partie : [[bibliotheque|Ma bibliothèque]].`,
    related: ['cartes', 'monstres', 'musique-mj'],
  },
  {
    id: 'partie-test',
    chapter: 'mj-preparer',
    title: 'Partie test : essayer sans joueurs',
    summary: 'Incarner des joueurs fictifs pour tester les mécaniques.',
    audience: 'mj',
    keywords: [
      'test',
      'essai',
      'joueur fictif',
      'incarner',
      'simuler',
      'réinitialiser',
      'exemple',
    ],
    body: `Une partie test sert à essayer la table, les règles ou l'arpenteur sans réunir vos joueurs. Elle porte le badge **TEST** et personne ne peut la rejoindre : il n'y a pas de code d'invitation.

## Créer une partie test

1. Sur « Mes parties », cochez « Partie test » dans le cadre « Créer une partie ».
2. Laissez « Remplir avec des données d'exemple » coché pour partir avec trois joueurs fictifs, une carte avec leurs jetons, deux monstres, un document et, en mode Arpenteur, un navire avec son équipage.
3. Cliquez sur « Créer ».

## Le bouton « Test »

À la table, le bouton jaune « Test » en haut à droite ouvre les outils :

- **Joueurs fictifs** : ajoutez-en (huit au plus), changez leur nom ou leur personnage, supprimez-les.
- **Incarner** : la page se recharge et vous jouez à la place de ce joueur, avec exactement ses droits : brouillard, jetons visibles, fiche, dés, poste sur l'arpenteur. Un bandeau jaune le rappelle ; « Revenir au MJ » reprend la main.
- **Nouvel onglet** (icône à côté d'« Incarner ») : ouvre un onglet au nom de ce joueur. Gardez le MJ dans un onglet et chaque joueur dans le sien pour voir les actions passer en direct.
- **Ajouter des données d'exemple** : remet trois joueurs, une carte et des monstres.
- **Réinitialiser la partie** (deux clics) : efface cartes, jetons, monstres, messages, dés, documents et navire. Les joueurs fictifs restent, et les onglets ouverts se rechargent.

> L'incarnation ne vaut que dans l'onglet où vous l'avez lancée ; revenir à « Mes parties » vous rend votre compte. Supprimer une partie test ne range rien dans votre bibliothèque.`,
    related: ['creer-partie', 'vue-joueur', 'arpenteur-mj'],
  },
  {
    id: 'bibliotheque',
    chapter: 'mj-preparer',
    title: 'Ma bibliothèque',
    summary: 'Préparer sans être en partie, réutiliser partout.',
    audience: 'mj',
    keywords: ['bibliothèque', 'préparer', 'réutiliser'],
    body: `Le bouton « Ma bibliothèque », sur la page Mes parties, ouvre vos ressources personnelles : cartes, monstres, décors et musiques.

Tout ce qui est dans la bibliothèque est proposé dans les Ressources de toutes vos parties. Les cartes y portent un badge « Bibliothèque » et s'affichent sur la table comme les autres.

> Quand une partie est supprimée, ses cartes, monstres, décors et musiques rejoignent votre bibliothèque.`,
  },
  {
    id: 'cartes',
    chapter: 'mj-preparer',
    title: 'Ajouter et afficher une carte',
    summary: 'Envoyer une image puis la montrer à la table.',
    audience: 'mj',
    keywords: ['carte', 'plan', 'afficher', 'image'],
    body: `1. Dans Ressources, onglet des cartes, déposez une image (glisser-déposer ou bouton d'envoi), donnez-lui un nom.
2. Cliquez sur « Afficher sur la table » : tous les joueurs la voient aussitôt. Vous pouvez aussi la choisir dans le menu déroulant, en haut à gauche de la table.

À chaque affichage d'une carte, les personnages des joueurs arrivent groupés au centre. Les monstres et décors restent où vous les avez posés. Chaque carte garde son propre [[brouillard|brouillard]] et ses [[notes|notes]].`,
    related: ['editeur', 'carte-vue'],
  },
  {
    id: 'editeur',
    chapter: 'mj-preparer',
    title: 'L’éditeur de carte',
    summary: 'Poser monstres et décors avant la partie.',
    audience: 'mj',
    keywords: ['éditeur', 'décor', 'placer', 'préparer'],
    body: `L'onglet « Modifier les cartes » de Ressources affiche une carte et votre bibliothèque de monstres et décors.

- Choisissez un élément puis cliquez sur la carte pour le poser.
- Glissez pour déplacer, tirez le coin pour redimensionner, supprimez avec la croix.

Ce que vous posez ici apparaît au même endroit et à la même taille sur la table. Les décors font partie de la carte ; les monstres deviennent des jetons.`,
  },
  {
    id: 'monstres',
    chapter: 'mj-preparer',
    title: 'Monstres et décors',
    summary: 'Images, fiches de monstre et ce que les joueurs en verront.',
    audience: 'mj',
    keywords: ['monstre', 'ennemi', 'décor', 'fiche', 'butin', 'loot'],
    body: `Dans Ressources, envoyez une image et choisissez sa catégorie : **Monstre** ou **Décor**.

Pour un monstre, l'éditeur de fiche s'ouvre : description, caractéristique unique, butin, PV et mana max par défaut, cadrage de l'image.

## Ce que voient les joueurs
Un joueur ne peut ouvrir la fiche d'un monstre qu'une fois celui-ci [[jetons|vaincu]], et seulement les rubriques cochées dans « Visible par les joueurs une fois vaincu » : par défaut le nom, l'image et la description. Vous pouvez y ajouter le butin, la caractéristique unique ou les statistiques, monstre par monstre, depuis l'éditeur ou depuis la fiche en partie.

Les PV et le mana des ennemis ne sont jamais envoyés aux joueurs.`,
  },
  {
    id: 'musique-mj',
    chapter: 'mj-preparer',
    title: 'Préparer et lancer la musique',
    summary: 'Pistes d’ambiance synchronisées.',
    audience: 'mj',
    keywords: ['musique', 'ambiance', 'piste'],
    body: `Ajoutez vos pistes dans Ressources (MP3, OGG, WAV, M4A). À la table, l'onglet « Musique » permet de choisir une piste, lecture/pause, avancer ou reculer, et régler le volume général.

Tous les joueurs entendent la même chose au même moment, même s'ils arrivent en cours de morceau.`,
  },

  // --- Mener la partie (MJ) ---------------------------------------------------------
  {
    id: 'outils-mj',
    chapter: 'mj-mener',
    title: 'La barre d’outils du MJ',
    summary: 'Les boutons à gauche de la carte.',
    audience: 'mj',
    keywords: ['outils', 'barre', 'boutons'],
    body: `De haut en bas :

- **Flèche** : sélectionner et déplacer les jetons.
- **Plus** : [[jetons|ajouter un ennemi]].
- **Lune** : [[obscurite|zone d'obscurité]].
- **Nuage** : [[brouillard|brouillard de guerre]].
- **Cadenas** : bloquer les déplacements des joueurs (ils peuvent encore orienter leur personnage).
- **Drapeau** : [[tour|tour de jeu]].
- **Cible** : recentrer la carte pour tout le monde.
- **Œil** : [[vue-joueur|voir comme un joueur]].`,
  },
  {
    id: 'jetons',
    chapter: 'mj-mener',
    title: 'Gérer les jetons',
    summary: 'Placer, cacher, redimensionner, vaincre.',
    audience: 'mj',
    keywords: ['jeton', 'ennemi', 'PV', 'taille', 'cacher', 'vaincu', 'statut'],
    body: `## Placer un ennemi
1. Bouton « + » de la barre d'outils (ou onglet « Jetons » du panneau).
2. Choisissez un monstre de vos ressources, ajustez nom et PV.
3. Cliquez sur la carte pour le poser.

## La fiche rapide
Un clic sur un jeton ouvre sa fiche rapide :

- PV et mana, avec [[pv|la saisie rapide]] (12, -5, +3) ;
- curseur « Taille » ;
- œil : le cacher aux joueurs ou le montrer ;
- « Fiche » : la fiche complète du monstre, avec ses effets de statut (poison, brûlure…) et leurs tours restants ;
- corbeille : le supprimer.

## Vaincre un ennemi
À 0 PV, l'ennemi passe « vaincu » (💀). Les joueurs peuvent alors ouvrir sa fiche, réduite à ce que vous avez choisi de montrer (voir [[monstres|Monstres et décors]]).`,
  },
  {
    id: 'tour',
    chapter: 'mj-mener',
    title: 'Tour de jeu et déplacements',
    summary: 'Indiquer qui joue, figer les positions.',
    audience: 'mj',
    keywords: ['tour', 'combat', 'bloquer', 'initiative'],
    body: `Le **drapeau** de la barre d'outils ouvre « À qui le tour ? » : choisissez un joueur. Son personnage s'illumine et un bandeau « C'est votre tour » s'affiche chez lui. « Terminer le tour » retire l'indication.

Le **cadenas** bloque les déplacements des joueurs, par exemple pendant une description ou en combat. Ils peuvent toujours orienter leur personnage. Recliquez pour débloquer.`,
  },
  {
    id: 'brouillard',
    chapter: 'mj-mener',
    title: 'Le brouillard de guerre',
    summary: 'Révéler la carte au fil de l’exploration.',
    audience: 'mj',
    keywords: ['brouillard', 'révéler', 'cacher', 'exploration', 'fog'],
    body: `1. Cliquez sur le nuage, puis cochez « Actif sur cette carte » : toute la carte est cachée aux joueurs.
2. Choisissez « Révéler » (ou « Cacher ») et la forme, rectangle ou ellipse.
3. Glissez sur la carte pour dessiner la zone ; elle apparaît aussitôt chez les joueurs.

Les zones s'empilent dans l'ordre : une zone « Cacher » dessinée par-dessus une zone révélée la recouvre. « Annuler la dernière zone », « Tout révéler » et « Tout cacher » permettent de corriger.

Vous voyez le brouillard en transparence. Les ennemis sous le brouillard ne sont pas du tout envoyés aux joueurs : ils apparaissent quand leur zone est révélée. Les personnages restent toujours visibles. Chaque carte garde son brouillard.`,
    related: ['obscurite', 'vue-joueur'],
  },
  {
    id: 'obscurite',
    chapter: 'mj-mener',
    title: 'La zone d’obscurité',
    summary: 'Les joueurs ne voient qu’autour de leurs personnages.',
    audience: 'mj',
    keywords: ['obscurité', 'nuit', 'vision', 'rayon'],
    body: `La lune de la barre d'outils limite la vision des joueurs à un cercle autour de chaque personnage (nuit, grotte). Cochez « Activée » et réglez le rayon.

Les ennemis hors de ce cercle sont cachés aux joueurs ; ils apparaissent quand un personnage s'approche. Avec le [[brouillard|brouillard de guerre]], la vision perce le brouillard autour des personnages.`,
  },
  {
    id: 'vue-joueur',
    chapter: 'mj-mener',
    title: 'Voir comme un joueur',
    summary: 'Vérifier ce que voient vos joueurs.',
    audience: 'mj',
    keywords: ['vue joueur', 'aperçu', 'vérifier'],
    body: `L'œil, en bas de la barre d'outils, affiche la table telle que la voient vos joueurs : jetons cachés absents, brouillard opaque, PV des ennemis masqués, fiches des monstres vaincus réduites à ce qui est visible.

Rien ne peut être modifié dans ce mode, et vos joueurs ne voient pas la différence. « Revenir en MJ » ou Échap pour reprendre la main.

> Pour agir vraiment comme un joueur (lancer ses dés, déplacer son jeton, modifier sa fiche), utilisez une [[partie-test|partie test]].`,
  },
  {
    id: 'documents-mj',
    chapter: 'mj-mener',
    title: 'Partager des documents et des fichiers',
    summary: 'Texte, image, Word, Excel, PDF : importez ce que vous avez déjà.',
    audience: 'mj',
    keywords: [
      'documents',
      'importer',
      'word',
      'excel',
      'pdf',
      'tableau',
      'docx',
      'xlsx',
      'google',
    ],
    body: `L'onglet « Docs » du panneau sert à donner des documents aux joueurs : une lettre, un plan, le portrait d'un PNJ, mais aussi des fichiers préparés ailleurs.

## Ajouter
Écrivez un titre et un texte, ou choisissez un fichier :

- **Images** : PNG, JPG, GIF, WebP ;
- **Documents** : Word (.docx), LibreOffice (.odt), texte (.txt), Markdown (.md) ;
- **Tableaux** : Excel (.xlsx), LibreOffice (.ods), CSV ;
- **PDF**.

Les documents et tableaux sont convertis pour se lire directement dans la partie (titres, listes, tableaux ; feuilles, recherche et tri pour les tableurs). Le fichier d'origine reste téléchargeable.

> Google Docs ou Sheets : Fichier > Télécharger > .docx ou .xlsx, puis importez le fichier. Les anciens formats .doc et .xls sont à réenregistrer en .docx ou .xlsx.

## Partager
Un document ajouté reste caché.

- **Partager** : il apparaît dans l'onglet Docs des joueurs, sans s'ouvrir chez eux.
- **Montrer** (ou « Remontrer ») : il s'ouvre en grand chez tous les joueurs.
- **Œil barré** : le cacher à nouveau. **Corbeille** : le supprimer.`,
    related: ['docs-joueur'],
  },
  {
    id: 'notes',
    chapter: 'mj-mener',
    title: 'Mes notes de MJ',
    summary: 'Des notes privées, par partie et par carte.',
    audience: 'mj',
    keywords: ['notes', 'privé', 'préparation'],
    body: `L'onglet « Notes » n'est visible que par vous et n'est jamais envoyé aux joueurs. Il contient deux zones :

- **Notes de la partie** : intrigues, PNJ, rappels ;
- **Notes de la carte affichée** : pièges, trésors ; elles changent avec la carte.

Tout est enregistré automatiquement (« Enregistré » s'affiche).`,
  },
  {
    id: 'fiches-joueurs',
    chapter: 'mj-mener',
    title: 'Consulter les fiches des joueurs',
    summary: 'L’onglet « Fiches » du panneau.',
    audience: 'mj',
    keywords: ['fiches', 'personnages', 'joueurs'],
    body: `L'onglet « Fiches » permet de choisir un joueur et d'ouvrir sa fiche : le fichier envoyé en partie classique, ou la fiche complète en GEMMA.`,
  },

  // --- GEMMA --------------------------------------------------------------------------
  {
    id: 'gemma',
    chapter: 'gemma',
    title: 'Ce qui change en GEMMA',
    summary: 'Les ajouts d’une partie dans l’univers GEMMA.',
    audience: 'tous',
    keywords: ['GEMMA', 'univers', 'aether'],
    body: `Une partie créée avec « Univers GEMMA » apporte :

- une [[fiche-gemma|fiche de personnage]] à remplir dans l'application, synchronisée avec le personnage sur la carte ;
- la jauge **Aether** à la place du mana ;
- la [[portee|portée d'attaque]] affichée autour des personnages ;
- l'affichage des lancers au centre de la carte ;
- en option, le [[arpenteur|mode Arpenteur]] : le vaisseau des sables du groupe.

Tout le reste (brouillard, documents, règle…) est disponible dans toutes les parties.`,
  },
  {
    id: 'fiche-gemma',
    chapter: 'gemma',
    title: 'La fiche GEMMA',
    summary: 'Identité, combat, armes, inventaire.',
    audience: 'joueur',
    keywords: ['fiche', 'GEMMA', 'armes', 'aether'],
    body: `Dans l'onglet « Ma fiche », remplissez :

- **Identité** : nom, race, classe, image du personnage (cadrage et zoom), portée d'attaque ;
- **Combat** : PV, PV max, Aether, Aether max ;
- **Armes** : nom, type, portée, effet ;
- caractéristiques, pouvoirs, équipement, inventaire.

Enregistrez : le nom, les PV, l'Aether et la portée passent sur votre personnage.

> Attendez la fin du chargement de la fiche avant de la modifier, pour ne rien perdre.`,
  },
  {
    id: 'portee',
    chapter: 'gemma',
    title: 'La portée d’attaque',
    summary: 'Un cercle autour du personnage.',
    audience: 'tous',
    keywords: ['portée', 'attaque', 'cercle', 'GEMMA'],
    body: `Renseignez la portée dans la fiche GEMMA (Identité), ou sur une arme : la première arme avec une portée est utilisée si aucune n'est saisie.

Cliquez sur un personnage qui a une portée : un cercle jaune montre sa zone d'attaque, en cases. Pour une distance précise, utilisez [[regle|la règle]].`,
  },
  {
    id: 'arpenteur',
    chapter: 'gemma',
    title: 'Le mode Arpenteur',
    summary: 'Le vaisseau des sables du groupe, sur sa propre page.',
    audience: 'tous',
    keywords: [
      'arpenteur',
      'vaisseau',
      'navire',
      'désert',
      'GEMMA',
      'Keld',
      '3D',
    ],
    body: `Une partie **GEMMA Arpenteur** ajoute un vaisseau des sables commun à tout le groupe. Le bouton « Arpenteur » en haut de la table ouvre sa page ; « Table » revient à la carte. Le chat, les dés et la musique restent disponibles.

En haut de la page, l'arpenteur apparaît en 3D, vu de trois-quarts, survolant les dunes du désert où il se trouve. Son allure, ses matériaux, ses mâts, sa proue, ses éclairages et ses couleurs suivent ses améliorations, et ses canons sortent des sabords. Les réacteurs soulèvent le sable et les cheminées fument. L'équipage s'active sur le pont (barre, cabestan, drisses, vigie). Quand la coque est abîmée, des brèches, des feux et de la fumée apparaissent ; pendant un chantier, le navire est entouré d'échafaudages. La scène passe de nuit entre 20 h et 7 h. Le bouton « Coupe » montre le plan de l'intérieur : cliquez sur une salle pour la gérer.

Glissez sur la scène pour tourner autour du navire, utilisez la molette (ou pincez sur mobile) pour zoomer ; les boutons +, − et ⟲ sont à droite, ⟲ remet le point de vue par défaut. Le MJ dispose en plus d'un bouton ☀ / ☾ qui fait tomber la nuit ou lever le jour pour tout le groupe, avec une transition de quelques secondes ; sans choix du MJ, la scène suit l'heure réelle (nuit de 20 h à 7 h). Pendant un voyage, la caméra passe derrière le navire : il accélère, arches, épaves, ruines et rochers défilent, puis une tempête de sable l'enveloppe au passage dans la nouvelle zone ; quand elle se dissipe, on découvre le désert d'arrivée et le navire ralentit. Vers une ville, on la voit grandir à l'horizon avant que le navire ne s'amarre au quai ; en partant, il largue les amarres et la ville s'éloigne. Chaque sous-région a son paysage (dunes, salines, cheminées de fée, canyons, ossements géants, cristaux, engrenages ensablés, oasis, ruines) et chaque ville son plan, ses bâtiments et son monument : ville en terrasses sur une colline (Zenit), cité creusée dans des blocs de sel (Fremis), kasbah fortifiée (Darrakis), capitale de maisons-tours derrière ses remparts (Rakdos), village sur pilotis avec moulins (Fardel), enclos de huttes rondes (Kartoum), anneaux de tours de cristal (Delrosis), halles et tuyauteries (Garkal), maisons à patio et canaux (Cité du sud) — avec leurs monuments (coupoles bleues de Zenit, flèches de sel de Fremis, ziggourat de Rakdos, phare de Fardel, colosse de Kartoum, cristaux de Delrosis, forge de Garkal, temple de la Cité du sud…). Les villes ont plusieurs quais : d'autres navires y sont amarrés, arrivent ou repartent, et les habitants circulent sur les quais, le boulevard et la place du marché.

> Sur un appareil trop ancien pour la 3D, une version dessinée s'affiche à la place.

Les onglets :

- **Navire** : expédition, coupons, évolution du navire et journal de bord ;
- **Équipage** : fiches, postes, soins, équipage de sortie ([[arpenteur-postes|qui modifie quoi]]) ;
- **Combat** : coque, canons, munitions, poudre, déroulé de la mise à feu et schéma des portées ([[arpenteur-combat|en détail]]) ;
- **Cale & cave** : les inventaires, avec poids, valeur et coupons ;
- **Carte** : les déserts de Keld, le cap et les déplacements ([[arpenteur-carte|en détail]]) ;
- **Atelier** : les améliorations ([[arpenteur-atelier|en détail]]).`,
    related: [
      'arpenteur-postes',
      'arpenteur-combat',
      'arpenteur-carte',
      'arpenteur-atelier',
      'arpenteur-mj',
    ],
  },
  {
    id: 'arpenteur-postes',
    chapter: 'gemma',
    title: 'Arpenteur : qui modifie quoi',
    summary: 'Chaque poste gère sa partie du navire.',
    audience: 'tous',
    keywords: [
      'poste',
      'capitaine',
      'contremaître',
      'canonnier',
      'chirurgien',
      'guetteur',
      'droits',
    ],
    body: `Le MJ peut tout modifier. Un joueur reçoit les droits du poste occupé par son personnage, quand le MJ a relié le personnage à lui (fiche de l'équipage, « Incarné par »).

Par défaut :

- **Capitaine** : expédition et coupons, équipage, cale, cave, carte, ordres de tir ;
- **Contremaître** : équipage, cale, ordres de tir ;
- **Maître canonnier** : canons, munitions et poudre. Si aucun joueur n'est maître canonnier, le Capitaine ou le Contremaître prennent la relève ;
- **Chirurgien** : vie et fatigue de l'équipage ;
- **Guetteur** : carte, ordres de tir ;
- **Mousse** : cale.

Le MJ change cette répartition dans l'onglet Réglages. Sans les droits, une partie reste consultable : la page indique qui peut la modifier.`,
  },
  {
    id: 'arpenteur-combat',
    chapter: 'gemma',
    title: 'Arpenteur : le combat',
    summary: 'Préparer les canons, tirer, suivre munitions et poudre.',
    audience: 'tous',
    keywords: [
      'canon',
      'tir',
      'poudre',
      'munitions',
      'portée',
      'salve',
      'baril',
    ],
    body: `## Le déroulé de la mise à feu
« Commencer » lance les sept étapes de la feuille de combat : le guetteur donne la position, le capitaine choisit la zone et la munition, le contremaître repositionne, le canonnier prépare, puis l'ordre de tir. L'étape en cours est visible de tous.

## Préparer et tirer
« Préparer les canons » charge chaque canon installé avec la munition choisie et l'amorce avec la poudre des barils montés sur le pont (5 utilisations par baril). « Feu ! » tire les canons prêts : la salve s'anime sur le navire chez tout le monde, les dégâts (2D6 par boulet) sont lancés dans le chat, et la feuille se décompte toute seule.

## Les portées
Cliquez sur le schéma pour placer la cible : la distance, le côté du navire (A avant, B arrière, C bâbord, D tribord) et le couloir de tir s'affichent.

> Les compteurs restent modifiables à la main, comme sur la feuille.`,
  },
  {
    id: 'arpenteur-carte',
    chapter: 'gemma',
    title: 'Arpenteur : la carte des déserts',
    summary: 'Suivre l’arpenteur entre Mahibori, Palubori et Forabori.',
    audience: 'tous',
    keywords: [
      'carte',
      'désert',
      'secteur',
      'cap',
      'Mahibori',
      'Palubori',
      'Forabori',
      'ville',
    ],
    body: `Le « Réseau des déserts » montre les sous-régions (M1 à F4), les traversées possibles et les trajets entre les villes et les déserts. Cliquez sur une sous-région ou une ville : ses accès s'affichent.

Depuis la position actuelle, les destinations directes sont entourées. « Mettre le cap » trace la route ; « Partir » lance le voyage : pendant environ 25 secondes, le petit navire glisse le long du trajet avec le temps restant, et tout le groupe voit le même voyage. On ne peut pas repartir avant l'arrivée. Le MJ peut placer le navire n'importe où, instantanément.

Vous pouvez nommer une sous-région (« Le Désert du phare vert ») et y poser des repères : mission, danger, trésor… Le MJ peut en cacher aux joueurs.

La « Carte illustrée » accueille l'image de votre choix (le MJ l'ajoute) : on y fait glisser l'arpenteur et on y pose des repères.`,
  },
  {
    id: 'arpenteur-atelier',
    chapter: 'gemma',
    title: 'Arpenteur : l’atelier',
    summary: 'Améliorer le navire et voir son évolution.',
    audience: 'tous',
    keywords: [
      'amélioration',
      'atelier',
      'allure',
      'coque',
      'quille',
      'mâts',
      'proue',
      'travaux',
    ],
    body: `L'atelier suit l'arbre des choix : allure, quille, coque, mâts, ponts, poupe et proue chez le constructeur ; voiles, drapeau, bandes de couleur et dorures chez le décorateur ; la tenue de l'équipage chez le tailleur ; et les pièces à ajouter (salle de jeux, fumoir, sauna…).

L'aperçu change à chaque choix. Ensuite :

- **Appliquer maintenant** : le navire change aussitôt ;
- **Lancer les travaux** : avec une durée, le navire est en chantier (échafaudages) jusqu'à « Terminer les travaux ».

Un coût en coupons peut être déduit de l'expédition. Chaque amélioration s'ajoute à l'**évolution** (onglet Navire) : cliquez une étape pour revoir le navire tel qu'il était.`,
  },
  {
    id: 'arpenteur-mj',
    chapter: 'gemma',
    title: 'Arpenteur : mise en place (MJ)',
    summary: 'Activer le mode, importer le classeur, relier les joueurs.',
    audience: 'mj',
    keywords: ['arpenteur', 'import', 'excel', 'classeur', 'activer'],
    body: `1. Créez une partie « GEMMA Arpenteur », ou activez le mode sur une partie GEMMA existante avec le bouton en forme de navire sur sa carte (« Mes parties »).
2. Dans l'onglet Réglages de l'arpenteur, importez votre classeur (Excel, LibreOffice ou CSV) : équipage, combat, cale, cave et expédition sont repris.
3. Dans l'onglet Équipage, reliez chaque personnage joueur à son joueur (« Incarné par ») : ses droits suivent son poste.

> Retirer le mode Arpenteur ne supprime pas le navire : il revient tel quel si vous le réactivez.

> Pour essayer les postes avant la séance, créez une [[partie-test|partie test]] en mode Arpenteur : ses joueurs fictifs sont déjà placés dans l'équipage.`,
  },

  // --- Compte ----------------------------------------------------------------------------
  {
    id: 'profil',
    chapter: 'compte',
    title: 'Mon profil',
    summary: 'Nom, e-mail, mot de passe.',
    audience: 'tous',
    keywords: ['profil', 'nom', 'email', 'mot de passe'],
    body: `Sur Mes parties, cliquez sur votre nom en haut à droite, puis « Profil ». Vous pouvez changer votre nom d'affichage, votre adresse e-mail et votre mot de passe. Pour changer l'e-mail ou le mot de passe, votre mot de passe actuel vous est demandé.

> Après plusieurs mots de passe erronés, la connexion est bloquée quelques minutes pour protéger votre compte. Changer de mot de passe déconnecte vos autres appareils.`,
  },
  {
    id: 'couleurs',
    chapter: 'compte',
    title: 'Changer les couleurs',
    summary: 'Trois palettes au choix.',
    audience: 'tous',
    keywords: ['palette', 'couleurs', 'thème', 'apparence'],
    body: `Dans votre profil, la section « Palette de couleurs » propose trois ambiances. Le choix s'applique tout de suite et est mémorisé sur cet appareil ; il ne change rien pour les autres.`,
  },
  {
    id: 'donnees',
    chapter: 'compte',
    title: 'Mes données',
    summary: 'Libérer de l’espace, supprimer son compte.',
    audience: 'tous',
    keywords: ['purger', 'supprimer', 'compte', 'données'],
    body: `Dans le profil, « Options avancées » :

- **Purger les assets** : supprime les fichiers que plus aucune de vos parties n'utilise.
- **Supprimer mon compte** : supprime définitivement votre compte et vos données, après confirmation de votre mot de passe. C'est irréversible.`,
  },
];

const byId = new Map(GUIDE_ARTICLES.map((a) => [a.id, a]));

export function getArticle(id: string | null | undefined) {
  return id ? byId.get(id) : undefined;
}

/** Parcours conseillé pour débuter, selon le rôle. */
export const QUICK_START: Record<'joueur' | 'mj', string[]> = {
  joueur: ['rejoindre-partie', 'decouvrir-table', 'mon-personnage', 'des'],
  mj: ['creer-partie', 'cartes', 'jetons', 'brouillard', 'documents-mj'],
};

function normalize(s: string) {
  return s.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Texte brut d'un article (sans la mise en forme), pour la recherche. */
export function plainText(body: string) {
  return body
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[*#>]/g, '');
}

/**
 * Recherche : chaque mot doit apparaître dans le titre, le résumé, les mots-clés
 * ou le texte (sans accents ni majuscules). Le titre compte plus que le texte.
 */
export function searchGuide(
  query: string,
  audience: Audience | 'toutes' = 'toutes'
): GuideArticle[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const pool = GUIDE_ARTICLES.filter(
    (a) =>
      audience === 'toutes' || a.audience === 'tous' || a.audience === audience
  );
  if (words.length === 0) return pool;
  const scored = pool
    .map((a) => {
      const title = normalize(a.title);
      const meta = normalize(`${a.summary} ${a.keywords.join(' ')}`);
      const text = normalize(plainText(a.body));
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 5;
        else if (meta.includes(w)) score += 3;
        else if (text.includes(w)) score += 1;
        else return null;
      }
      return { a, score };
    })
    .filter((x): x is { a: GuideArticle; score: number } => x != null);
  scored.sort((x, y) => y.score - x.score);
  return scored.map((x) => x.a);
}

/** Articles voisins dans l'ordre du guide (précédent / suivant). */
export function neighbours(id: string) {
  const i = GUIDE_ARTICLES.findIndex((a) => a.id === id);
  return {
    prev: i > 0 ? GUIDE_ARTICLES[i - 1] : undefined,
    next:
      i >= 0 && i < GUIDE_ARTICLES.length - 1
        ? GUIDE_ARTICLES[i + 1]
        : undefined,
  };
}
