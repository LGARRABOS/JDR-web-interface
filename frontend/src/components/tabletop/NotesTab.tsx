import { useEffect, useRef, useState } from 'react';
import { NotesAPI } from '../../api/client';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Une zone de notes enregistrée automatiquement. */
function NoteField({
  gameId,
  mapId,
  label,
  placeholder,
}: {
  gameId: number;
  mapId?: number;
  label: string;
  placeholder: string;
}) {
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    if (text == null) return;
    pending.current = null;
    setSave('saving');
    NotesAPI.put(gameId, text, mapId)
      .then(() => setSave('saved'))
      .catch(() => setSave('error'));
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setBody('');
    setSave('idle');
    NotesAPI.get(gameId, mapId)
      .then(({ data }) => {
        if (!cancelled) setBody((data as { body?: string }).body ?? '');
      })
      .catch(() => {
        if (!cancelled) setSave('error');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      flush(); // ne rien perdre en changeant de carte
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, mapId]);

  const status = {
    idle: '',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    error: 'Non enregistré — réessayez',
  }[save];

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-sm text-fantasy-text-soft">
        <span className="font-semibold truncate">{label}</span>
        <span
          className={`text-xs ${save === 'error' ? 'text-fantasy-error' : 'text-fantasy-muted-soft'}`}
          aria-live="polite"
        >
          {status}
        </span>
      </span>
      <textarea
        value={body}
        disabled={!loaded}
        onChange={(e) => {
          setBody(e.target.value);
          pending.current = e.target.value;
          setSave('idle');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={flush}
        placeholder={placeholder}
        rows={8}
        className="w-full rounded-lg bg-fantasy-bg border border-fantasy-border-soft px-3 py-2 text-[15px] leading-relaxed text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent resize-y disabled:opacity-60"
      />
    </label>
  );
}

/** Onglet Notes du MJ : privé, jamais montré aux joueurs. */
export function NotesTab({
  gameId,
  mapId,
  mapName,
}: {
  gameId: number;
  mapId?: number;
  mapName?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fantasy-muted">
        Visible par vous seul. Enregistré automatiquement.
      </p>
      <NoteField
        gameId={gameId}
        label="Notes de la partie"
        placeholder="Intrigues, PNJ, rappels…"
      />
      {mapId != null && (
        <NoteField
          key={mapId}
          gameId={gameId}
          mapId={mapId}
          label={`Carte : ${mapName ?? ''}`}
          placeholder="Pièges, trésors, ce qui attend les joueurs ici…"
        />
      )}
    </div>
  );
}
