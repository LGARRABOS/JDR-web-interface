import { useEffect, useState } from 'react';
import { travelNow, type TravelNow } from '../model/travel';
import type { Travel } from '../model/types';

/** Voyage en cours, rafraîchi plusieurs fois par seconde jusqu'à l'arrivée. */
export function useTravel(t: Travel | null | undefined): TravelNow | null {
  const [now, setNow] = useState(() => Date.now());
  const key = t ? `${t.from}|${t.to}|${t.startedAt}|${t.duration}` : '';
  const active = travelNow(t, now) !== null;
  useEffect(() => {
    if (!key) return;
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [key, active]);
  return travelNow(t, now);
}
