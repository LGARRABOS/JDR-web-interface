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
    <div className="rounded-lg bg-slate-800/80 p-4">
      <h3 className="text-sm font-semibold mb-3">Musique d&apos;ambiance</h3>
      <div className="space-y-2">
        {showUpload && (
          <input
            type="file"
            accept=".mp3,.ogg,.wav,.m4a"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-slate-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-600 file:text-slate-200"
          />
        )}
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : (
          <ul className="space-y-1">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{t.filename}</span>
                {playingTrackId === t.id ? (
                  <button
                    onClick={handlePause}
                    className="px-2 py-0.5 rounded bg-amber-600/80 hover:bg-amber-500 text-xs"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlay(t.id)}
                    className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-xs"
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
