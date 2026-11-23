import { HOP_SECONDS, OPEN, spotById, spotsOf } from '../../arpenteur/spots';
import type { MapState } from '../../arpenteur/types';
import { Btn, Card } from './ui';
import { useTravel } from './useTravel';

// Lieux-dits de la zone où se trouve l'arpenteur : on s'y rend sans changer
// de zone (trajet animé chez tous les joueurs).

export function SpotsCard({
  map,
  can,
  save,
}: {
  map: MapState;
  can: boolean;
  save: (next: MapState, log?: string) => void;
}) {
  const travel = useTravel(map.travel);
  const hop = useTravel(map.hop);
  const spots = spotsOf(map.sector);
  if (!spots.length || travel) return null;
  const here = map.spot ?? '';
  const busy = !!hop;

  const go = (to: string) => {
    const s = spotById(to);
    save(
      {
        ...map,
        spot: s ? s.id : '',
        hop: {
          from: here || OPEN,
          to: s ? s.id : OPEN,
          startedAt: new Date().toISOString(),
          duration: HOP_SECONDS,
        },
      },
      s
        ? `L'arpenteur fait route vers ${s.name}`
        : "L'arpenteur reprend le large"
    );
  };

  return (
    <Card
      title="Lieux-dits de la zone"
      subtitle={
        hop
          ? `En route vers ${spotById(hop.to)?.name ?? 'le large'} · arrivée dans ${hop.remaining} s`
          : here
            ? `Arrêté devant ${spotById(here)?.name ?? here}`
            : 'Au large'
      }
      actions={
        can && here && !busy ? (
          <Btn className="!h-8 !px-3 text-sm" onClick={() => go(OPEN)}>
            ⛵ Reprendre le large
          </Btn>
        ) : undefined
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {spots.map((s) => {
          const at = s.id === here;
          return (
            <li
              key={s.id}
              className={`rounded-lg border px-3 py-2 flex flex-col gap-1 ${
                at
                  ? 'border-fantasy-accent bg-fantasy-accent/10'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <strong className="font-heading">{s.name}</strong>
                {at && (
                  <span className="ml-auto text-xs text-fantasy-accent">
                    {busy ? 'en approche' : 'vous êtes ici'}
                  </span>
                )}
              </div>
              <p className="text-xs text-fantasy-text-soft">{s.blurb}</p>
              {can && !at && (
                <Btn
                  className="!h-7 !px-2 text-xs self-start"
                  disabled={busy}
                  title={busy ? 'Attendez la fin du trajet' : undefined}
                  onClick={() => go(s.id)}
                >
                  Se rendre ici
                </Btn>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
