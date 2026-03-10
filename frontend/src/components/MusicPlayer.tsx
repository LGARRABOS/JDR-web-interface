import { useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../api/client';

interface Track {
  id: number;
  filename: string;
  url: string;
}

interface MusicPlayerProps {
  gameId: number;
  musicState: {
    trackId: number | null;
    position: number;
    playing: boolean;
  } | null;
}

export function MusicPlayer({ gameId, musicState }: MusicPlayerProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    MusicAPI.list(gameId)
      .then(({ data }) => setTracks(data.tracks ?? []))
      .catch(() => setTracks([]));
  }, [gameId]);

  const trackUrl = musicState?.trackId
    ? `/api/games/${gameId}/music/${musicState.trackId}/file`
    : '';

  useEffect(() => {
    if (!musicState || !musicState.trackId) return;
    const audio = audioRef.current;
    if (!audio) return;

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
  }, [musicState, trackUrl]);

  if (!musicState || tracks.length === 0) return null;

  const track = musicState.trackId
    ? tracks.find((t) => t.id === musicState.trackId)
    : null;

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-2 text-fantasy-text-soft">Musique</h3>
      {track && musicState.playing ? (
        <p className="text-sm text-fantasy-text-soft truncate">▶ {track.filename}</p>
      ) : (
        <p className="text-sm text-fantasy-muted-soft">En pause</p>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
