import { useCallback, useRef, useState } from 'react';
import { formatTime, useSyncedAudio } from '../hooks/useSyncedAudio';
import {
  musicPositionAt,
  type ClientAction,
  type MusicState,
} from '../realtime/protocol';
import { AudioUnlockButton, trackSrc, useTracks } from './MusicPlayer';

interface MusicPanelProps {
  gameId: number;
  music: MusicState;
  serverOffsetMs: number;
  send: (action: ClientAction) => boolean;
}

/**
 * Commandes musicales du MJ. Le panneau n'a pas d'état propre : il envoie des
 * commandes au serveur et affiche l'état diffusé, comme les joueurs. Recharger
 * la page ne coupe donc plus la musique.
 */
export function MusicPanel({
  gameId,
  music,
  serverOffsetMs,
  send,
}: MusicPanelProps) {
  const { tracks, loading } = useTracks(gameId);
  const currentIndex = tracks.findIndex((t) => t.id === music.trackId);

  const play = useCallback(
    (trackId: number, position = 0) =>
      send({ action: 'music.play', trackId, position }),
    [send]
  );
  const next = useCallback(() => {
    if (tracks.length === 0) return;
    const idx =
      currentIndex < 0 || currentIndex >= tracks.length - 1
        ? 0
        : currentIndex + 1;
    play(tracks[idx].id);
  }, [tracks, currentIndex, play]);
  const prev = useCallback(() => {
    if (tracks.length === 0) return;
    const idx = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    play(tracks[idx].id);
  }, [tracks, currentIndex, play]);

  const { audioRef, blocked, unlock, position, duration } = useSyncedAudio({
    music,
    serverOffsetMs,
    src: trackSrc(gameId, tracks, music.trackId),
    onEnded: next,
  });

  // Volume et position : affichage immédiat, envoi limité pendant le glissement.
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const lastSent = useRef(0);
  const throttled = (fn: () => void) => {
    const now = Date.now();
    if (now - lastSent.current > 150) {
      lastSent.current = now;
      fn();
    }
  };

  const togglePlay = () => {
    if (music.playing) {
      send({ action: 'music.pause' });
    } else if (music.trackId != null) {
      play(music.trackId, musicPositionAt(music, Date.now() + serverOffsetMs));
    } else if (tracks[0]) {
      play(tracks[0].id);
    }
  };

  const shownVolume = dragVolume ?? music.volume;
  const shownPosition = dragPosition ?? position;

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-3 text-fantasy-text-soft">
        Musique d&apos;ambiance
      </h3>
      <audio ref={audioRef} className="hidden" preload="auto" />
      {loading ? (
        <p className="text-sm text-fantasy-muted-soft">Chargement...</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-fantasy-muted-soft">
          Aucune musique. Ajoutez-en depuis la page Ressources.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              className="p-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft"
              title="Précédent"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className={
                music.playing
                  ? 'px-3 py-1 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover text-fantasy-bg text-sm'
                  : 'px-3 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft text-sm'
              }
            >
              {music.playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={next}
              className="p-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft"
              title="Suivant"
            >
              ⏭
            </button>
            {music.trackId != null && (
              <button
                type="button"
                onClick={() => send({ action: 'music.stop' })}
                className="p-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft"
                title="Arrêter"
              >
                ⏹
              </button>
            )}
          </div>
          {blocked && music.playing && <AudioUnlockButton onClick={unlock} />}
          <div className="flex items-center gap-2">
            <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
              Vol
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={shownVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setDragVolume(v);
                throttled(() => send({ action: 'music.volume', volume: v }));
              }}
              onPointerUp={() => {
                if (dragVolume != null)
                  send({ action: 'music.volume', volume: dragVolume });
                setDragVolume(null);
              }}
              onKeyUp={() => {
                if (dragVolume != null)
                  send({ action: 'music.volume', volume: dragVolume });
                setDragVolume(null);
              }}
              className="flex-1 h-2 rounded bg-fantasy-input-soft accent-fantasy-accent"
            />
          </div>
          {music.trackId != null && duration > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                {formatTime(shownPosition)}
              </span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.5}
                value={Math.min(shownPosition, duration)}
                onChange={(e) => setDragPosition(parseFloat(e.target.value))}
                onPointerUp={() => {
                  if (dragPosition != null)
                    send({ action: 'music.seek', position: dragPosition });
                  setDragPosition(null);
                }}
                onKeyUp={() => {
                  if (dragPosition != null)
                    send({ action: 'music.seek', position: dragPosition });
                  setDragPosition(null);
                }}
                className="flex-1 h-2 rounded bg-fantasy-input-soft accent-fantasy-accent"
              />
              <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          )}
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-fantasy-text-soft">
                  {t.filename}
                </span>
                {music.trackId === t.id && music.playing ? (
                  <span className="text-fantasy-accent text-xs">▶</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => play(t.id)}
                    className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs text-fantasy-text-soft"
                  >
                    Play
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
