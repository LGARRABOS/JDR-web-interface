export interface WikiArticle {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
}

export const WIKI_CATEGORIES = [
  'Démarrage',
  'Maître du Jeu',
  'Joueur',
  'Cartes et jetons',
  'Dés et chat',
  'Mode GEMMA',
  'Ressources',
] as const;

export const WIKI_ARTICLES: WikiArticle[] = [
  {
    id: 'creer-partie',
    title: 'Créer une partie',
    category: 'Démarrage',
    tags: ['démarrage', 'MJ', 'astuces'],
    content: `Pour créer une nouvelle partie, rendez-vous sur la page "Mes parties" et remplissez le formulaire "Créer une partie".

Saisissez un nom pour votre partie (optionnel), puis cliquez sur "Créer". Vous serez automatiquement désigné comme Maître du Jeu (MJ).

Un code d'invitation sera généré. Partagez ce code avec vos joueurs pour qu'ils puissent rejoindre la partie.

Si vous jouez dans l'univers GEMMA, cochez la case "Partie dans l'univers GEMMA" avant de créer. Cela activera des fonctionnalités supplémentaires (dés cachés, verrouillage des jetons, surbrillance de tour).`,
  },
  {
    id: 'rejoindre-partie',
    title: 'Rejoindre une partie',
    category: 'Démarrage',
    tags: ['démarrage', 'joueur'],
    content: `Pour rejoindre une partie existante, vous devez disposer du code d'invitation fourni par le Maître du Jeu.

Dans la section "Rejoindre une partie", saisissez le code (6 caractères, lettres et chiffres) puis cliquez sur "Rejoindre".

Si le code est valide, la partie apparaîtra dans "Mes parties" et vous pourrez y accéder en cliquant sur "Ouvrir".

Vous rejoindrez en tant que joueur. Le MJ pourra vous assigner un jeton de personnage et consulter votre fiche.`,
  },
  {
    id: 'premiers-pas',
    title: 'Premiers pas',
    category: 'Démarrage',
    tags: ['démarrage', 'astuces'],
    content: `Une fois dans une partie, vous verrez la table de jeu avec une zone centrale (la carte) et une colonne de droite avec plusieurs panneaux.

En tant que MJ : vous gérez les cartes, les jetons, la musique et le déroulement de la partie. Commencez par ajouter une carte depuis la page Ressources, puis placez des jetons dessus.

En tant que joueur : vous pouvez déplacer votre jeton (si le MJ vous en a créé un), consulter votre fiche de personnage, lancer des dés et participer au chat.

Utilisez le sélecteur de carte en haut pour changer de carte (MJ uniquement). Le bouton "Ressources" mène à la gestion des cartes, éléments et musiques.`,
  },
  {
    id: 'role-mj',
    title: 'Rôle du Maître du Jeu',
    category: 'Maître du Jeu',
    tags: ['MJ', 'astuces'],
    content: `En tant que MJ, vous avez le contrôle complet de la partie.

Vous pouvez :
- Créer et gérer les cartes (page Ressources)
- Placer des jetons (ennemis, PNJ, objets) sur la carte
- Déplacer tous les jetons, y compris ceux des joueurs
- Modifier les PV et Mana des jetons
- Contrôler la musique d'ambiance
- Déplacer et zoomer la vue de la carte (les joueurs voient la même vue)
- Consulter les fiches de personnage de tous les joueurs

La barre d'astuces en haut de l'écran vous rappelle les actions essentielles. Cliquez sur la flèche pour changer d'astuce.`,
  },
  {
    id: 'gerer-cartes',
    title: 'Gérer les cartes',
    category: 'Maître du Jeu',
    tags: ['MJ', 'cartes', 'ressources'],
    content: `Les cartes sont gérées depuis la page Ressources (bouton en haut à droite de la table).

Pour ajouter une carte : cliquez sur "+ Carte" et uploadez une image (PNG, JPG, GIF). Vous pouvez définir un nom et des tags. Les dimensions sont détectées automatiquement.

Une fois créée, la carte apparaît dans le sélecteur déroulant en haut de la table. Sélectionnez-la pour l'afficher à tous les joueurs.

Les cartes servent de support pour placer les jetons. Chaque carte peut avoir ses propres jetons et éléments de décor. L'éditeur de carte permet d'ajouter des éléments fixes (murs, obstacles) directement sur l'image.`,
  },
  {
    id: 'ajouter-jetons',
    title: 'Ajouter des jetons',
    category: 'Maître du Jeu',
    tags: ['MJ', 'jetons', 'astuces'],
    content: `Pour ajouter un jeton (ennemi, PNJ, objet) :

1. Dans le panneau "Jetons" à droite, cliquez sur "Ajouter un ennemi"
2. Recherchez un élément dans vos ressources (images PNG/JPG/GIF uploadées en page Ressources, onglet Éléments)
3. Définissez les PV, Mana, nom et dimensions
4. Cliquez pour activer le mode placement
5. Cliquez sur la carte à l'endroit où placer le jeton

Le jeton apparaît immédiatement. Vous pouvez le déplacer par glisser-déposer, modifier ses PV en cliquant dessus, ou le supprimer avec le bouton ✕.`,
  },
  {
    id: 'musique-ambiance',
    title: "Musique d'ambiance",
    category: 'Maître du Jeu',
    tags: ['MJ', 'musique', 'ressources'],
    content: `La musique est partagée en temps réel avec tous les joueurs.

Pour ajouter une piste : page Ressources, onglet Musique, uploadez un fichier audio (MP3, OGG, WAV ou M4A).

Sur la table, le panneau "Musique d'ambiance" (colonne de droite) permet de lire, mettre en pause et déplacer la position. Les joueurs entendent la même musique synchronisée.

Seul le MJ peut contrôler la lecture.`,
  },
  {
    id: 'role-joueur',
    title: 'Rôle du joueur',
    category: 'Joueur',
    tags: ['joueur', 'astuces'],
    content: `En tant que joueur, vous participez à la partie avec des capacités limitées par rapport au MJ.

Vous pouvez :
- Déplacer votre jeton de personnage (si le MJ ne bloque pas le mouvement)
- Consulter et modifier votre fiche de personnage
- Lancer des dés (visibles par tous)
- Envoyer des messages dans le chat
- Voir la carte et les jetons visibles
- Écouter la musique d'ambiance

Vous ne pouvez pas placer de jetons, changer de carte ou modifier les PV des ennemis (sauf les vôtres).`,
  },
  {
    id: 'fiche-personnage',
    title: 'Ma fiche de personnage',
    category: 'Joueur',
    tags: ['joueur', 'fiches'],
    content: `Chaque joueur peut avoir une fiche de personnage.

Pour l'ajouter : dans le panneau "Fiche de personnage", uploadez un fichier. Formats acceptés : PDF, .doc, .docx (max 10 Mo). Le MJ pourra la consulter.

Vous pouvez aussi définir votre "Nom de personnage" dans le champ prévu à cet effet. Ce nom s'affichera à la place de votre nom d'utilisateur dans le chat et les lancers de dés.

Le MJ peut consulter les fiches de tous les joueurs via le sélecteur "Consulter la fiche de".`,
  },
  {
    id: 'deplacer-jeton',
    title: 'Déplacer mon jeton',
    category: 'Joueur',
    tags: ['joueur', 'jetons'],
    content: `Votre jeton de personnage (PJ) peut être déplacé par glisser-déposer sur la carte.

Cliquez sur le jeton et maintenez le bouton enfoncé, puis déplacez la souris. Relâchez pour valider la position.

Attention : le MJ peut activer le "Bloquer mouvement des jetons" (mode GEMMA). Dans ce cas, vous ne pourrez plus déplacer votre jeton jusqu'à ce qu'il le désactive.

Seul le MJ peut déplacer les jetons des ennemis et PNJ.`,
  },
  {
    id: 'placer-jeton',
    title: 'Placer un jeton',
    category: 'Cartes et jetons',
    tags: ['MJ', 'jetons', 'cartes'],
    content: `Le placement de jetons est réservé au MJ.

Après avoir configuré un jeton (nom, PV, mana, image) dans le panneau "Ajouter un ennemi", le mode placement s'active. Le curseur change et un clic sur la carte crée le jeton à cet endroit.

Les coordonnées sont calculées automatiquement. Vous pouvez ensuite déplacer le jeton comme n'importe quel autre.

Si aucune carte n'est affichée, ajoutez-en une depuis la page Ressources. Un lien "Ajouter une carte" apparaît dans la zone vide.`,
  },
  {
    id: 'pv-mana',
    title: 'PV et Mana',
    category: 'Cartes et jetons',
    tags: ['jetons', 'MJ', 'joueur'],
    content: `Les PV (points de vie) et Mana des jetons s'affichent au-dessus de chaque jeton sur la carte.

Pour les joueurs : vos PV/Mana apparaissent toujours au-dessus de votre jeton, même s'ils ne sont pas encore définis (affichés comme "—").

Pour modifier les PV ou Mana : cliquez sur le jeton pour le sélectionner. Le panneau de droite affiche les champs éditables. Le MJ peut modifier tous les jetons ; un joueur peut modifier uniquement son propre jeton.`,
  },
  {
    id: 'jetons-hors-ligne',
    title: 'Jetons hors ligne',
    category: 'Cartes et jetons',
    tags: ['jetons', 'joueur'],
    content: `Lorsqu'un joueur se déconnecte, son jeton de personnage reste sur la carte à sa place.

Le texte "hors ligne" apparaît sous le jeton pour indiquer que le joueur n'est plus connecté. Cela permet au MJ et aux autres joueurs de savoir qui est absent sans perdre la position des personnages.

Quand le joueur se reconnecte, l'indication "hors ligne" disparaît automatiquement.`,
  },
  {
    id: 'lancer-des',
    title: 'Lancer des dés',
    category: 'Dés et chat',
    tags: ['dés', 'MJ', 'joueur'],
    content: `Le panneau "Lancer de dés" permet de lancer des dés partagés en temps réel avec tous les participants.

Format d'expression : NdM+K (ex. 1d20, 2d6+3, 1d100)
- N = nombre de dés
- M = type de dé (6, 10, 20, 100)
- K = modificateur (optionnel)

En mode GEMMA : des boutons rapides (d20, d10, d6, d100) et un modificateur sont disponibles. Un mode avancé permet les expressions manuelles.

Le dernier lancer s'affiche pour tous. En GEMMA, un overlay central montre le résultat avec un feedback visuel (couleur pour d20).`,
  },
  {
    id: 'chat-temps-reel',
    title: 'Chat en temps réel',
    category: 'Dés et chat',
    tags: ['chat', 'MJ', 'joueur'],
    content: `Le chat permet d'échanger des messages avec tous les participants de la partie.

Saisissez votre message et cliquez sur "Envoyer". Les messages s'affichent immédiatement pour tous les joueurs connectés.

Votre nom de personnage (si défini) ou votre nom d'utilisateur s'affiche à côté de chaque message.`,
  },
  {
    id: 'activer-gemma',
    title: 'Activer GEMMA',
    category: 'Mode GEMMA',
    tags: ['GEMMA', 'démarrage'],
    content: `Le mode GEMMA est un ensemble de fonctionnalités supplémentaires pour les parties dans l'univers GEMMA.

Pour l'activer : cochez "Partie dans l'univers GEMMA" lors de la création de la partie. Cette option ne peut pas être modifiée après création.

Les fonctionnalités GEMMA incluent : choix rapide du type de dés, dés MJ cachés, verrouillage du mouvement des jetons, surbrillance des jetons pour indiquer le début du tour, et affichage central des lancers.`,
  },
  {
    id: 'des-mj-caches',
    title: 'Dés MJ cachés',
    category: 'Mode GEMMA',
    tags: ['GEMMA', 'dés', 'MJ'],
    content: `En mode GEMMA, le MJ dispose d'un onglet "Dés MJ (cachés)" dans le panneau des dés.

Les lancers effectués depuis cet onglet ne sont pas visibles par les joueurs. Seul le MJ voit le résultat. Idéal pour les jets de perception, de discrétion ou autres jets secrets.

Les dés normaux (onglet "Dés") restent visibles par tous comme d'habitude.`,
  },
  {
    id: 'verrouiller-jetons',
    title: 'Verrouiller les jetons',
    category: 'Mode GEMMA',
    tags: ['GEMMA', 'jetons', 'MJ'],
    content: `En mode GEMMA, une barre de contrôles apparaît sous les astuces MJ.

La case "Bloquer mouvement des jetons" empêche les joueurs de déplacer leurs jetons. Seul le MJ peut encore les déplacer.

Utile pendant les descriptions de scène, les combats au tour par tour, ou quand le MJ veut garder le contrôle des positions. Décochez pour réautoriser le mouvement.`,
  },
  {
    id: 'surbrillance-tour',
    title: 'Surbrillance de tour',
    category: 'Mode GEMMA',
    tags: ['GEMMA', 'jetons', 'MJ'],
    content: `La surbrillance de tour permet d'indiquer visuellement à qui c'est le tour.

Dans la barre GEMMA : sélectionnez un joueur dans le menu "Tour de :", puis cliquez sur "Début du tour". Les jetons de ce joueur seront entourés d'un halo jaune/or.

Cliquez sur "Fin de surbrillance" pour retirer l'effet. Tous les participants voient la surbrillance en temps réel.`,
  },
  {
    id: 'page-ressources',
    title: 'Page Ressources',
    category: 'Ressources',
    tags: ['ressources', 'MJ'],
    content: `La page Ressources est accessible via le bouton "Ressources" en haut de la table (MJ uniquement).

Elle comporte plusieurs onglets :
- Ressources : gestion des cartes et de la musique
- Éléments : monstres et décor (images pour les jetons)
- Éditeur : outil pour éditer les cartes et placer des éléments de décor directement sur la carte

Les cartes et éléments sont propres à chaque partie. La musique peut être partagée.

Récapitulatif des formats autorisés :
• Cartes : PNG, JPG, GIF
• Éléments (jetons) : PNG, JPG, GIF
• Musique : MP3, OGG, WAV, M4A
• Fiche de personnage : PDF, .doc, .docx (max 10 Mo)`,
  },
  {
    id: 'ressources-cartes',
    title: 'Cartes',
    category: 'Ressources',
    tags: ['ressources', 'cartes', 'MJ'],
    content: `Les cartes sont des images de fond pour la table (plans de donjon, cartes de région, etc.).

Pour ajouter une carte : uploadez une image, donnez un nom et des tags. Les dimensions sont détectées automatiquement.

Formats de fichiers autorisés :
- PNG
- JPG / JPEG
- GIF

Les cartes apparaissent dans le sélecteur de la table. Une seule carte est affichée à la fois. Les jetons sont associés à la carte sur laquelle ils ont été placés.`,
  },
  {
    id: 'ressources-elements',
    title: 'Éléments (ennemis, décor)',
    category: 'Ressources',
    tags: ['ressources', 'jetons', 'MJ'],
    content: `Les éléments sont des images utilisées pour les jetons : monstres, PNJ, objets de décor.

Catégories : "Monstre" (ennemis, créatures) et "Décor" (objets, éléments de décor).

Formats de fichiers autorisés :
- PNG
- JPG / JPEG
- GIF

Pour ajouter un élément : uploadez une image, donnez un nom, choisissez la catégorie. Vous pouvez ajouter des tags pour faciliter la recherche lors de la création des jetons.

Lors de la création d'un jeton, vous recherchez parmi vos éléments pour en sélectionner un comme apparence du jeton.`,
  },
  {
    id: 'ressources-musique',
    title: 'Musique',
    category: 'Ressources',
    tags: ['ressources', 'musique', 'MJ'],
    content: `La musique d'ambiance est gérée depuis l'onglet Ressources.

Formats de fichiers autorisés :
- MP3
- OGG
- WAV
- M4A

Uploadez des fichiers audio pour créer une bibliothèque de pistes. Chaque piste peut être lue sur la table via le panneau "Musique d'ambiance".

La lecture est synchronisée pour tous les joueurs. Le MJ contrôle le play/pause et la position.`,
  },
  {
    id: 'ressources-fiche-personnage',
    title: 'Fiche de personnage (upload)',
    category: 'Ressources',
    tags: ['ressources', 'fiches', 'joueur'],
    content: `Chaque joueur peut uploader une fiche de personnage pour la partager avec le MJ (et éventuellement les autres joueurs).

Formats de fichiers autorisés :
- PDF
- DOC (Word)
- DOCX (Word)

Taille maximale : 10 Mo

La fiche est accessible depuis le panneau "Fiche de personnage" sur la table. Le MJ peut consulter les fiches de tous les joueurs via le sélecteur dédié.`,
  },
  {
    id: 'ressources-editeur',
    title: 'Éditeur de carte',
    category: 'Ressources',
    tags: ['ressources', 'cartes', 'MJ'],
    content: `L'onglet Éditeur permet de modifier une carte existante : placer des éléments de décor (murs, obstacles, objets) directement sur l'image de la carte.

Sélectionnez une carte dans la liste, puis utilisez les outils pour :
- Placer des éléments (images depuis vos ressources)
- Redimensionner et déplacer les éléments
- Supprimer des éléments

Les éléments placés dans l'éditeur font partie de la carte et sont visibles par tous les joueurs. Ils ne sont pas des jetons mobiles.`,
  },
];

export function getAllTags(): string[] {
  const set = new Set<string>();
  WIKI_ARTICLES.forEach((a) => a.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

export function getArticlesByCategory(category: string): WikiArticle[] {
  return WIKI_ARTICLES.filter((a) => a.category === category);
}

export function searchArticles(
  query: string,
  tagFilter?: string
): WikiArticle[] {
  const q = query.trim().toLowerCase();
  const tag = tagFilter?.toLowerCase();
  return WIKI_ARTICLES.filter((a) => {
    const matchTag = !tag || a.tags.some((t) => t.toLowerCase() === tag);
    const matchQuery =
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q));
    return matchTag && matchQuery;
  });
}
