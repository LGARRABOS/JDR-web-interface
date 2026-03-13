import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../api/client';

interface Track {
  id: number;
  filename: string;
  url: string;
}

export interface MusicPanelState {
  trackId: number | null;
  position: number;
  playing: boolean;
  volume: number;
}

interface MusicPanelProps {
  gameId: number;
  send: (action: string, payload?: Record<string, unknown>) => void;
  showUpload?: boolean;
  /** Ref mis à jour avec l'état actuel pour que le MJ puisse répondre à music.state.request */
  stateRef?: React.MutableRefObject<MusicPanelState | null>;
}

export function MusicPanel({
  gameId,
  send,
  showUpload = true,
  stateRef,
}: MusicPanelProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const sendMusic = useCallback(
    (action: string, trackId: number, pos: number, vol: number) => {
      send(action, {
        trackId,
        position: pos,
        volume: vol,
      });
    },
    [send]
  );

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
    (trackId: number, fromPosition = 0) => {
      const audio = audioRef.current;
      const track = tracks.find((t) => t.id === trackId);
      if (track && audio) {
        audio.src = track.url;
        audio.currentTime = fromPosition;
        audio.volume = volume;
        audio.play().catch(() => {});
      }
      setPlayingTrackId(trackId);
      setPosition(fromPosition);
      sendMusic('music.play', trackId, fromPosition, volume);
    },
    [sendMusic, tracks, volume]
  );

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    const pos = audio ? audio.currentTime : position;
    const tid = playingTrackId;
    setPlayingTrackId(null);
    if (tid != null) {
      sendMusic('music.pause', tid, pos, volume);
    }
    if (audio) {
      audio.pause();
    }
    if (seekUpdateRef.current) {
      clearInterval(seekUpdateRef.current);
      seekUpdateRef.current = null;
    }
  }, [sendMusic, playingTrackId, position, volume]);

  const handleSeek = useCallback(
    (newPos: number) => {
      const audio = audioRef.current;
      const tid = playingTrackId;
      if (audio && tid != null) {
        audio.currentTime = newPos;
        setPosition(newPos);
        sendMusic('music.seek', tid, newPos, volume);
      }
    },
    [sendMusic, playingTrackId, volume]
  );

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = v;
    }
  }, []);

  const currentIndex = tracks.findIndex((t) => t.id === playingTrackId);
  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;
    const idx = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    handlePlay(tracks[idx].id, 0);
  }, [tracks, currentIndex, handlePlay]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;
    const idx =
      currentIndex < 0 || currentIndex >= tracks.length - 1
        ? 0
        : currentIndex + 1;
    handlePlay(tracks[idx].id, 0);
  }, [tracks, currentIndex, handlePlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setPosition(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => {
      handleNext();
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
    };
  }, [handleNext]);

  const isPlaying = playingTrackId != null;

  useEffect(() => {
    if (stateRef) {
      stateRef.current = {
        trackId: playingTrackId,
        position,
        playing: isPlaying,
        volume,
      };
    }
  }, [stateRef, playingTrackId, position, isPlaying, volume]);

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-3 text-fantasy-text-soft">
        Musique d&apos;ambiance
      </h3>
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
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={tracks.length === 0}
                className="p-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft disabled:opacity-50"
                title="Précédent"
              >
                ⏮
              </button>
              {isPlaying ? (
                <button
                  onClick={handlePause}
                  className="px-3 py-1 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover text-fantasy-bg text-sm"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={() => tracks[0] && handlePlay(tracks[0].id)}
                  disabled={tracks.length === 0}
                  className="px-3 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft text-sm disabled:opacity-50"
                >
                  Play
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={tracks.length === 0}
                className="p-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft disabled:opacity-50"
                title="Suivant"
              >
                ⏭
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                Vol
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="flex-1 h-2 rounded bg-fantasy-input-soft accent-fantasy-accent"
              />
            </div>
            {isPlaying && duration > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                  {Math.floor(position / 60)}:
                  {(Math.floor(position % 60) + '').padStart(2, '0')}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.5}
                  value={position}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="flex-1 h-2 rounded bg-fantasy-input-soft accent-fantasy-accent"
                />
                <span className="text-xs text-fantasy-muted-soft w-8 shrink-0">
                  {Math.floor(duration / 60)}:
                  {(Math.floor(duration % 60) + '').padStart(2, '0')}
                </span>
              </div>
            )}
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {tracks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-fantasy-text-soft">
                    {t.filename}
                  </span>
                  {playingTrackId === t.id ? (
                    <span className="text-fantasy-accent text-xs">▶</span>
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
          </>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
