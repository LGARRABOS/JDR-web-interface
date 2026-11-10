import { describe, expect, it } from 'vitest';
import {
  clientToMapCoords,
  getImageContentRect,
  mapCoordsToContainer,
} from './mapCoords';

describe('coordonnées de carte', () => {
  it('image aux mêmes proportions : elle remplit la carte', () => {
    expect(getImageContentRect(1000, 500, 2000, 1000)).toEqual({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    });
  });

  it('image plus haute : bandes à gauche et à droite', () => {
    const c = getImageContentRect(1000, 500, 500, 500);
    expect(c).toEqual({ left: 250, top: 0, width: 500, height: 500 });
  });

  it('aller-retour écran -> carte -> conteneur, quelle que soit l’échelle', () => {
    // Conteneur de 1000×500 affiché à moitié de sa taille, décalé de (100, 40).
    const rect = { left: 100, top: 40, width: 500, height: 250 };
    for (const [imgW, imgH] of [
      [1000, 500],
      [500, 500],
      [1000, 1000],
    ]) {
      const p = clientToMapCoords(300, 140, rect, 1000, 500, imgW, imgH);
      const back = mapCoordsToContainer(p.x, p.y, 1000, 500, imgW, imgH);
      // (300-100)/0,5 = 400 ; (140-40)/0,5 = 200 en unités du conteneur.
      expect(back.left).toBeCloseTo(400);
      expect(back.top).toBeCloseTo(200);
    }
  });

  it('le centre de la carte tombe au centre de l’image', () => {
    const pos = mapCoordsToContainer(500, 250, 1000, 500, 500, 500);
    expect(pos).toEqual({ left: 500, top: 250 });
  });
});
