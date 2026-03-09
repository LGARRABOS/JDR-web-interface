import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GamesAPI, MapsAPI, MusicAPI } from '../api/client';
import type { MapData } from '../components/MapCanvas';

interface MusicTrack {
  id: number;
  filename: string;
  url: string;
}

export function ResourcesPage() {
  const { gameId: gameIdParam } = useParams();
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 0;
  const navigate = useNavigate();

  const [game, setGame] = useState<{
    id: number;
    name: string;
    role: string;
  } | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [mapUploading, setMapUploading] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const mapFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);

  const isGM = game?.role === 'MJ';

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await GamesAPI.get(gameId);
      setGame(data.game);
    } catch {
      navigate('/games');
    }
  }, [gameId, navigate]);

  const loadMaps = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await MapsAPI.list(gameId);
      setMaps(data.maps ?? []);
    } catch {
      setMaps([]);
    }
  }, [gameId]);

  const loadTracks = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await MusicAPI.list(gameId);
      setTracks(data.tracks ?? []);
    } catch {
      setTracks([]);
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const handleMapUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) return;
      setMapUploading(true);
      try {
        const name =
          prompt('Nom de la carte ?', file.name.replace(/\.[^.]+$/, '')) ??
          file.name;
        const { data } = await MapsAPI.upload(gameId, file, name);
        setMaps((prev) => [...prev, data.map]);
      } catch {
        loadMaps();
      } finally {
        setMapUploading(false);
        e.target.value = '';
      }
    },
    [gameId, loadMaps]
  );

  const handleMusicUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) return;
      setMusicUploading(true);
      try {
        await MusicAPI.upload(gameId, file);
        loadTracks();
      } catch {
        loadTracks();
      } finally {
        setMusicUploading(false);
        e.target.value = '';
      }
    },
    [gameId, loadTracks]
  );

  const handleDeleteMap = useCallback(
    async (mapId: number) => {
      if (!confirm('Supprimer cette carte ?')) return;
      try {
        await MapsAPI.delete(mapId);
        setMaps((prev) => prev.filter((m) => m.id !== mapId));
      } catch {
        loadMaps();
      }
    },
    [loadMaps]
  );

  const handleDeleteTrack = useCallback(
    async (trackId: number) => {
      if (!confirm('Supprimer cette piste ?')) return;
      try {
        await MusicAPI.delete(gameId, trackId);
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
      } catch {
        loadTracks();
      }
    },
    [gameId, loadTracks]
  );

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Chargement...</p>
      </div>
    );
  }

  if (!isGM) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Accès réservé au MJ</p>
        <button
          onClick={() => navigate(`/table/${gameId}`)}
          className="px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-amber-400"
        >
          Retour à la table
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="flex justify-between items-center px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/table/${gameId}`)}
            className="text-slate-400 hover:text-white"
          >
            ← Table de jeu
          </button>
          <h1 className="font-bold text-lg">Ressources — {game.name}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-10">
        {/* Cartes */}
        <section className="rounded-lg bg-slate-800/80 p-6">
          <h2 className="text-xl font-semibold mb-4">Cartes</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <input
              ref={mapFileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif"
              className="hidden"
              onChange={handleMapUpload}
            />
            <button
              onClick={() => mapFileRef.current?.click()}
              disabled={mapUploading}
              className="px-4 py-2 rounded bg-amber-600/80 hover:bg-amber-500 font-medium disabled:opacity-50"
            >
              {mapUploading ? 'Upload...' : '+ Ajouter une carte'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {maps.map((m) => (
              <div
                key={m.id}
                className="rounded-lg bg-slate-700/50 overflow-hidden border border-slate-600"
              >
                <div className="aspect-video bg-slate-800 relative">
                  <img
                    src={m.imageUrl}
                    alt={m.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2 flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{m.name}</span>
                  <button
                    onClick={() => handleDeleteMap(m.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          {maps.length === 0 && (
            <p className="text-slate-500 text-sm">
              Aucune carte. Uploadez une image (png, jpg, gif).
            </p>
          )}
        </section>

        {/* Musique */}
        <section className="rounded-lg bg-slate-800/80 p-6">
          <h2 className="text-xl font-semibold mb-4">
            Musique d&apos;ambiance
          </h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <input
              ref={musicFileRef}
              type="file"
              accept=".mp3,.ogg,.wav,.m4a"
              className="hidden"
              onChange={handleMusicUpload}
            />
            <button
              onClick={() => musicFileRef.current?.click()}
              disabled={musicUploading}
              className="px-4 py-2 rounded bg-amber-600/80 hover:bg-amber-500 font-medium disabled:opacity-50"
            >
              {musicUploading ? 'Upload...' : '+ Ajouter une piste'}
            </button>
          </div>
          <ul className="space-y-2">
            {tracks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-2 px-3 rounded bg-slate-700/50"
              >
                <span className="text-sm truncate">{t.filename}</span>
                <button
                  onClick={() => handleDeleteTrack(t.id)}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded shrink-0"
                  title="Supprimer"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
          {tracks.length === 0 && (
            <p className="text-slate-500 text-sm">
              Aucune piste. Uploadez un fichier audio (mp3, ogg, wav, m4a).
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
