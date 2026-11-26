/**
 * Coordonnées des cartes, partagées par la table et l'éditeur.
 *
 * Une carte est un conteneur de taille logique mapW × mapH (largeur et hauteur
 * enregistrées) dans lequel l'image est affichée sans déformation (« contain »).
 * Les positions des jetons et décors sont exprimées en unités de la carte,
 * rapportées à la zone réellement occupée par l'image.
 */

export function getImageContentRect(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number
) {
  if (imgW <= 0 || imgH <= 0) {
    return { left: 0, top: 0, width: containerW, height: containerH };
  }
  const containerAspect = containerW / containerH;
  const imageAspect = imgW / imgH;
  if (imageAspect > containerAspect) {
    const displayH = containerW / imageAspect;
    return {
      left: 0,
      top: (containerH - displayH) / 2,
      width: containerW,
      height: displayH,
    };
  }
  const displayW = containerH * imageAspect;
  return {
    left: (containerW - displayW) / 2,
    top: 0,
    width: displayW,
    height: containerH,
  };
}

export function clientToMapCoords(
  clientX: number,
  clientY: number,
  containerRect: { left: number; top: number; width: number; height: number },
  mapW: number,
  mapH: number,
  imgW: number,
  imgH: number
) {
  const relX = clientX - containerRect.left;
  const relY = clientY - containerRect.top;
  const logicalX = (relX / containerRect.width) * mapW;
  const logicalY = (relY / containerRect.height) * mapH;
  const content = getImageContentRect(mapW, mapH, imgW, imgH);
  const x = ((logicalX - content.left) / content.width) * mapW;
  const y = ((logicalY - content.top) / content.height) * mapH;
  return { x, y };
}

export function mapCoordsToContainer(
  x: number,
  y: number,
  mapW: number,
  mapH: number,
  imgW: number,
  imgH: number
) {
  const content = getImageContentRect(mapW, mapH, imgW, imgH);
  return {
    left: content.left + (x / mapW) * content.width,
    top: content.top + (y / mapH) * content.height,
  };
}
