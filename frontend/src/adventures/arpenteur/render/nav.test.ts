import { describe, expect, it } from 'vitest';
import { along, route, toShip, wrapC } from './nav';

describe('navigation vers les lieux-dits', () => {
  it('ramène dans la période', () => {
    expect(wrapC(1300, 2400)).toBe(-1100);
    expect(wrapC(-1300, 2400)).toBe(1100);
    expect(wrapC(10, 2400)).toBe(10);
  });

  it('suit une route courbe qui arrive cap vers +x', () => {
    const r = route({ x: 0, z: 0, h: 0 }, { x: 800, z: -400 });
    const end = along(r, r.length);
    expect(end.x).toBeCloseTo(800);
    expect(end.z).toBeCloseTo(-400);
    expect(Math.abs(end.h)).toBeLessThan(0.02);
    // Au milieu, le navire a viré (cap non nul) : ce n'est pas une ligne droite.
    expect(Math.abs(along(r, r.length / 2).h)).toBeGreaterThan(0.2);
    expect(r.length).toBeGreaterThan(Math.hypot(800, 400));
  });

  it('fait demi-tour quand le lieu est derrière', () => {
    const r = route({ x: 0, z: 0, h: 0 }, { x: -500, z: -300 });
    const end = along(r, r.length);
    expect(end.x).toBeCloseTo(-500);
    expect(Math.abs(end.h % (Math.PI * 2))).toBeLessThan(0.05);
  });

  it('place les repères dans le repère du navire', () => {
    const [x, z] = toShip({ x: 0, z: 0, h: Math.PI / 2 }, 0, 100);
    expect(x).toBeCloseTo(100);
    expect(z).toBeCloseTo(0);
  });
});
