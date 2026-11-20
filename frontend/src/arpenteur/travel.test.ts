import { describe, expect, it } from 'vitest';
import { TRAVEL_SECONDS, travelEase, travelNow } from './travel';

describe('voyages', () => {
  const t = {
    from: 'M1',
    to: 'M2',
    startedAt: '2026-11-20T20:00:00.000Z',
    duration: TRAVEL_SECONDS,
  };
  const start = Date.parse(t.startedAt);

  it('suit la progression du voyage', () => {
    const mid = travelNow(t, start + (TRAVEL_SECONDS * 1000) / 2);
    expect(mid?.p).toBeCloseTo(0.5);
    expect(mid?.remaining).toBe(Math.ceil(TRAVEL_SECONDS / 2));
    expect(mid?.from).toBe('M1');
  });

  it('se termine à l’arrivée', () => {
    expect(travelNow(t, start + TRAVEL_SECONDS * 1000)).toBeNull();
  });

  it('tolère une horloge en avance sur le serveur', () => {
    expect(travelNow(t, start - 2000)?.p).toBe(0);
  });

  it('ignore un voyage invalide', () => {
    expect(travelNow(null)).toBeNull();
    expect(travelNow({ ...t, to: 'M1' })).toBeNull();
    expect(travelNow({ ...t, startedAt: 'demain' })).toBeNull();
  });

  it('démarre et arrive en douceur', () => {
    expect(travelEase(0)).toBe(0);
    expect(travelEase(1)).toBe(1);
    expect(travelEase(0.1)).toBeLessThan(0.1);
  });
});
