// Appliquer le thème choisi avant l'affichage, pour éviter un flash de couleurs.
// (Fichier séparé : la politique de sécurité interdit les scripts en ligne.)
try {
  var t = localStorage.getItem('jdr-theme');
  if (t === 'braise' || t === 'arcane' || t === 'foret')
    document.documentElement.dataset.theme = t;
} catch (e) {
  // Stockage indisponible : thème par défaut.
}
