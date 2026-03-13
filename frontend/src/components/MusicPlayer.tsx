import { useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../api/client';

interface Track {
  id: number;
  gameId?: number;
  filename: string;
  url: string;
}

interface MusicPlayerProps {
  gameId: number;
  musicState: {
    trackId: number | null;
    position: number;
    playing: boolean;
    volume?: number;
  } | null;
}

export function MusicPlayer({ gameId, musicState }: MusicPlayerProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [localVolume, setLocalVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    MusicAPI.list(gameId)
      .then(({ data }) => setTracks(data.tracks ?? []))
      .catch(() => setTracks([]));
  }, [gameId]);

  const track = musicState?.trackId
    ? tracks.find((t) => t.id === musicState.trackId)
    : null;
  const trackUrl =
    track?.url ??
    (musicState?.trackId
      ? `/api/games/${gameId}/music/${musicState.trackId}/file`
      : '');

  useEffect(() => {
    if (!musicState || !musicState.trackId) return;
    const audio = audioRef.current;
    if (!audio) return;

    const baseVolume = musicState.volume ?? 1;
    audio.volume = Math.min(1, baseVolume * localVolume);

    if (musicState.playing) {
      if (
        !audio.src ||
        !audio.src.endsWith(`/music/${musicState.trackId}/file`)
      ) {
        audio.src = trackUrl;
        audio.currentTime = musicState.position;
      } else if (Math.abs(audio.currentTime - musicState.position) > 1) {
        audio.currentTime = musicState.position;
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
      if (Math.abs(audio.currentTime - musicState.position) > 0.5) {
        audio.currentTime = musicState.position;
      }
    }
  }, [musicState, trackUrl, localVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentPosition(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, [musicState?.trackId]);

  if (!musicState) return null;

  const pos = musicState.playing ? currentPosition : musicState.position;

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-2 text-fantasy-text-soft">
        Musique
      </h3>
      {musicState.playing ? (
        <p className="text-sm text-fantasy-text-soft truncate">
          ▶ {track?.filename ?? 'En cours'}
        </p>
      ) : (
        <p className="text-sm text-fantasy-muted-soft truncate">
          ⏸ {track?.filename ?? 'En pause'}
        </p>
      )}
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
      {track && duration > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
            {Math.floor(pos / 60)}:
            {(Math.floor(pos % 60) + '').padStart(2, '0')}
          </span>
          <div className="flex-1 h-2 rounded bg-fantasy-input-soft overflow-hidden">
            <div
              className="h-full bg-fantasy-accent/50"
              style={{ width: `${(pos / duration) * 100}%` }}
            />
          </div>
          <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
            {Math.floor(duration / 60)}:
            {(Math.floor(duration % 60) + '').padStart(2, '0')}
          </span>
        </div>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
