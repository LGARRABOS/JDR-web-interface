import { useRef, useState } from 'react';
import { formatTime } from '../../hooks/useSyncedAudio';
import { trackTitle, type AmbientMusic } from '../../hooks/useAmbientMusic';
import {
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume,
} from './icons';

/** Bouton affiché quand le navigateur bloque la lecture automatique. */
function UnlockButton({ m }: { m: AmbientMusic }) {
  if (!m.blocked || !m.music.playing) return null;
  return (
    <button
      type="button"
      onClick={m.unlock}
      className="w-full h-9 rounded-lg bg-fantasy-accent text-fantasy-bg text-sm font-bold hover:bg-fantasy-accent-hover"
    >
      Activer le son
    </button>
  );
}

/** Petit lecteur flottant en bas à gauche de la table. */
export function MiniPlayer({ m }: { m: AmbientMusic }) {
  if (m.music.trackId == null && !m.isGM) return null;
  if (m.music.trackId == null && m.tracks.length === 0) return null;
  const progress =
    m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0;

  return (
    <div className="glass rounded-2xl p-2 w-64 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {m.isGM ? (
          <button
            type="button"
            onClick={m.togglePlay}
            aria-label={m.music.playing ? 'Pause' : 'Lecture'}
            className="w-9 h-9 shrink-0 rounded-full bg-fantasy-accent text-fantasy-bg flex items-center justify-center hover:bg-fantasy-accent-hover"
          >
            {m.music.playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        ) : (
          <span className="w-9 h-9 shrink-0 rounded-full bg-fantasy-input-soft text-fantasy-accent flex items-center justify-center">
            <Music size={16} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {m.title ||
              (m.music.trackId == null ? 'Aucune musique' : 'Musique')}
          </div>
          {m.isGM ? (
            <div className="mt-1.5 h-1 rounded bg-fantasy-input-soft overflow-hidden">
              <div
                className="h-full bg-fantasy-accent"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : (
            <label className="mt-0.5 flex items-center gap-1.5 text-xs text-fantasy-muted-soft">
              <Volume size={12} />
              <span className="sr-only">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={m.localVolume}
                onChange={(e) => m.setLocalVolume(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-fantasy-accent"
              />
            </label>
          )}
        </div>
        {m.duration > 0 && (
          <span className="text-xs text-fantasy-muted-soft tabular-nums">
            {formatTime(m.position)}
          </span>
        )}
      </div>
      <UnlockButton m={m} />
    </div>
  );
}

/** Onglet « Musique » du panneau latéral. */
export function MusicTab({
  m,
  onOpenResources,
}: {
  m: AmbientMusic;
  onOpenResources?: () => void;
}) {
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const lastSent = useRef(0);

  if (!m.isGM) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-fantasy-muted-soft mb-1">
            En cours
          </p>
          <p className="text-lg font-heading">
            {m.music.trackId == null ? 'Aucune musique' : m.title || 'Musique'}
          </p>
          {m.music.trackId != null && !m.music.playing && (
            <p className="text-sm text-fantasy-muted-soft">En pause</p>
          )}
        </div>
        <UnlockButton m={m} />
        <label className="flex flex-col gap-2 text-sm text-fantasy-text-soft">
          Mon volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={m.localVolume}
            onChange={(e) => m.setLocalVolume(parseFloat(e.target.value))}
            className="accent-fantasy-accent"
          />
        </label>
        <p className="text-sm text-fantasy-muted-soft">
          La musique est choisie par le MJ.
        </p>
      </div>
    );
  }

  const shownVolume = dragVolume ?? m.music.volume;
  const shownPosition = dragPosition ?? m.position;
  const commitVolume = () => {
    if (dragVolume != null) m.setVolume(dragVolume);
    setDragVolume(null);
  };
  const commitSeek = () => {
    if (dragPosition != null) m.seek(dragPosition);
    setDragPosition(null);
  };

  if (m.loading)
    return <p className="text-sm text-fantasy-muted-soft">Chargement…</p>;
  if (m.tracks.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm text-fantasy-muted-soft">
        <p>Aucune musique pour l&apos;instant.</p>
        {onOpenResources && (
          <button
            type="button"
            onClick={onOpenResources}
            className="self-start h-9 px-3 rounded-lg bg-fantasy-input-soft text-fantasy-text-soft hover:bg-fantasy-input-hover-soft"
          >
            Ajouter des musiques
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-fantasy-surface border border-fantasy-border-soft p-3 flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-fantasy-muted-soft">
            En cours
          </p>
          <p className="font-heading truncate">{m.title || 'Aucune musique'}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={m.prev}
            className="icon-btn"
            aria-label="Précédent"
          >
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            onClick={m.togglePlay}
            aria-label={m.music.playing ? 'Pause' : 'Lecture'}
            className="w-12 h-12 rounded-full bg-fantasy-accent text-fantasy-bg flex items-center justify-center hover:bg-fantasy-accent-hover"
          >
            {m.music.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            type="button"
            onClick={m.next}
            className="icon-btn"
            aria-label="Suivant"
          >
            <SkipForward size={18} />
          </button>
          {m.music.trackId != null && (
            <button
              type="button"
              onClick={m.stop}
              className="icon-btn"
              aria-label="Arrêter"
            >
              <Square size={16} />
            </button>
          )}
        </div>
        {m.music.trackId != null && m.duration > 0 && (
          <div className="flex items-center gap-2 text-xs text-fantasy-muted-soft tabular-nums">
            <span className="w-9">{formatTime(shownPosition)}</span>
            <input
              type="range"
              aria-label="Position dans le morceau"
              min={0}
              max={m.duration}
              step={0.5}
              value={Math.min(shownPosition, m.duration)}
              onChange={(e) => setDragPosition(parseFloat(e.target.value))}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
              className="flex-1 accent-fantasy-accent"
            />
            <span className="w-9 text-right">{formatTime(m.duration)}</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-fantasy-muted-soft">
          <Volume size={14} />
          <span className="sr-only">Volume pour tous</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={shownVolume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setDragVolume(v);
              if (Date.now() - lastSent.current > 150) {
                lastSent.current = Date.now();
                m.setVolume(v);
              }
            }}
            onPointerUp={commitVolume}
            onKeyUp={commitVolume}
            className="flex-1 accent-fantasy-accent"
          />
        </label>
        <UnlockButton m={m} />
      </div>

      <ul className="flex flex-col gap-1">
        {m.tracks.map((t) => {
          const active = m.music.trackId === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => m.play(t.id)}
                className={`w-full flex items-center gap-3 h-11 px-3 rounded-lg text-left text-sm ${
                  active
                    ? 'bg-fantasy-input-soft text-fantasy-text'
                    : 'text-fantasy-text-soft hover:bg-fantasy-input-soft/60'
                }`}
              >
                <span
                  className={
                    active ? 'text-fantasy-accent' : 'text-fantasy-muted-soft'
                  }
                >
                  {active && m.music.playing ? (
                    <Pause size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                </span>
                <span className="flex-1 truncate">{trackTitle(t)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
