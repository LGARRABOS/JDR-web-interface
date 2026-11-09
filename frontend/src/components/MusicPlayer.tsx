import { useEffect, useState } from 'react';
import { MusicAPI } from '../api/client';
import { formatTime, useSyncedAudio } from '../hooks/useSyncedAudio';
import type { MusicState } from '../realtime/protocol';

export interface Track {
  id: number;
  gameId?: number;
  filename: string;
  url: string;
}

/** Liste des morceaux disponibles pour une partie. */
export function useTracks(gameId: number) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    MusicAPI.list(gameId)
      .then(({ data }) => !cancelled && setTracks(data.tracks ?? []))
      .catch(() => !cancelled && setTracks([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [gameId]);
  return { tracks, loading };
}

export function trackSrc(
  gameId: number,
  tracks: Track[],
  trackId: number | null
) {
  if (trackId == null) return '';
  return (
    tracks.find((t) => t.id === trackId)?.url ??
    `/api/games/${gameId}/music/${trackId}/file`
  );
}

export function AudioUnlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full px-3 py-1.5 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
    >
      🔊 Activer le son
    </button>
  );
}

interface MusicPlayerProps {
  gameId: number;
  music: MusicState;
  serverOffsetMs: number;
}

/** Lecteur côté joueur : suit la musique choisie par le MJ, avec un volume local. */
export function MusicPlayer({
  gameId,
  music,
  serverOffsetMs,
}: MusicPlayerProps) {
  const { tracks } = useTracks(gameId);
  const [localVolume, setLocalVolume] = useState(1);
  const track = tracks.find((t) => t.id === music.trackId);
  const { audioRef, blocked, unlock, position, duration } = useSyncedAudio({
    music,
    serverOffsetMs,
    src: trackSrc(gameId, tracks, music.trackId),
    localVolume,
  });

  return (
    <>
      <audio ref={audioRef} className="hidden" preload="auto" />
      {music.trackId != null && (
        <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
          <h3 className="text-sm font-semibold font-heading mb-2 text-fantasy-text-soft">
            Musique
          </h3>
          <p
            className={`text-sm truncate ${music.playing ? 'text-fantasy-text-soft' : 'text-fantasy-muted-soft'}`}
          >
            {music.playing ? '▶' : '⏸'}{' '}
            {track?.filename ?? (music.playing ? 'En cours' : 'En pause')}
          </p>
          {blocked && music.playing && <AudioUnlockButton onClick={unlock} />}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-fantasy-muted-soft w-12 shrink-0">
              Volume
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={localVolume}
              onChange={(e) => setLocalVolume(parseFloat(e.target.value))}
              className="flex-1 h-2 rounded bg-fantasy-input-soft accent-fantasy-accent"
              title="Régler le volume"
            />
          </div>
          {duration > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                {formatTime(position)}
              </span>
              <div className="flex-1 h-2 rounded bg-fantasy-input-soft overflow-hidden">
                <div
                  className="h-full bg-fantasy-accent/50"
                  style={{
                    width: `${Math.min(100, (position / duration) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
