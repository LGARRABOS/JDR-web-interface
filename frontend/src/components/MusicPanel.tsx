import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../api/client';

interface Track {
  id: number;
  filename: string;
  url: string;
}

interface MusicPanelProps {
  gameId: number;
  send: (action: string, payload?: Record<string, unknown>) => void;
  showUpload?: boolean;
}

export function MusicPanel({
  gameId,
  send,
  showUpload = true,
}: MusicPanelProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await MusicAPI.list(gameId);
      setTracks(data.tracks ?? []);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) {
        return;
      }
      setUploading(true);
      try {
        await MusicAPI.upload(gameId, file);
        loadTracks();
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [gameId, loadTracks]
  );

  const handlePlay = useCallback(
    (trackId: number) => {
      const audio = audioRef.current;
      const track = tracks.find((t) => t.id === trackId);
      if (track && audio) {
        audio.src = track.url;
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      setPlayingTrackId(trackId);
      send('music.play', { trackId, position: 0 });
    },
    [send, tracks]
  );

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    const pos = audio ? audio.currentTime : 0;
    const tid = playingTrackId;
    setPlayingTrackId(null);
    send('music.pause', { trackId: tid ?? 0, position: pos });
    if (audio) {
      audio.pause();
    }
  }, [send, playingTrackId]);

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-3 text-fantasy-text-soft">Musique d&apos;ambiance</h3>
      <div className="space-y-2">
        {showUpload && (
          <input
            type="file"
            accept=".mp3,.ogg,.wav,.m4a"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-fantasy-muted-soft file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-fantasy-input-soft file:text-fantasy-text-soft"
          />
        )}
        {loading ? (
          <p className="text-sm text-fantasy-muted-soft">Chargement...</p>
        ) : (
          <ul className="space-y-1">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-fantasy-text-soft">{t.filename}</span>
                {playingTrackId === t.id ? (
                  <button
                    onClick={handlePause}
                    className="px-2 py-0.5 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover text-fantasy-bg text-xs"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlay(t.id)}
                    className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs text-fantasy-text-soft"
                  >
                    Play
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
