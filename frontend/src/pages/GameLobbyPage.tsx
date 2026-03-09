import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { GamesAPI } from '../api/client';

interface Game {
  id: number;
  name: string;
  inviteCode: string;
  ownerId: number;
  role: string;
  isGemma?: boolean;
}

export function GameLobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState('');
  const [isGemma, setIsGemma] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');

  const loadGames = async () => {
    try {
      const { data } = await GamesAPI.list();
      setGames(data.games ?? []);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const { data } = await GamesAPI.create({
        name: createName || undefined,
        isGemma,
      });
      setCreateName('');
      loadGames();
      if (data.game?.id) navigate(`/table/${data.game.id}`);
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur'
      );
    }
  };

  const handleDelete = async (gameId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer cette partie ? Cette action est irréversible.'))
      return;
    try {
      await GamesAPI.delete(gameId);
      loadGames();
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur'
      );
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!joinCode.trim()) return;
    try {
      const { data } = await GamesAPI.join({ inviteCode: joinCode.trim() });
      setJoinCode('');
      loadGames();
      if (data.gameId) navigate(`/table/${data.gameId}`);
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Code invalide'
      );
    }
  };

  return (
    <div className="min-h-screen p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Table JDR</h1>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">{user?.displayName}</span>
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto space-y-8">
        <section className="rounded-lg bg-slate-800/80 p-6">
          <h2 className="text-lg font-semibold mb-2">Créer une partie</h2>
          <p className="text-sm text-slate-400 mb-4">
            Vous serez automatiquement le Maître du Jeu (MJ) de la partie.
          </p>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nom de la partie"
                className="flex-1 rounded bg-slate-700 px-4 py-2 text-white border border-slate-600"
              />
              <button
                type="submit"
                className="px-6 py-2 rounded bg-amber-600 hover:bg-amber-500"
              >
                Créer
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isGemma}
                onChange={(e) => setIsGemma(e.target.checked)}
                className="rounded"
              />
              Partie dans l&apos;univers GEMMA
            </label>
          </form>
        </section>

        <section className="rounded-lg bg-slate-800/80 p-6">
          <h2 className="text-lg font-semibold mb-4">Rejoindre une partie</h2>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code d'invitation"
              className="flex-1 rounded bg-slate-700 px-4 py-2 text-white border border-slate-600 uppercase"
            />
            <button
              type="submit"
              className="px-6 py-2 rounded bg-amber-600 hover:bg-amber-500"
            >
              Rejoindre
            </button>
          </form>
          {err && <p className="mt-2 text-red-400 text-sm">{err}</p>}
        </section>

        <section className="rounded-lg bg-slate-800/80 p-6">
          <h2 className="text-lg font-semibold mb-4">Mes parties</h2>
          {loading ? (
            <p className="text-slate-400">Chargement...</p>
          ) : games.length === 0 ? (
            <p className="text-slate-400">
              Aucune partie. Créez-en une ou rejoignez avec un code.
            </p>
          ) : (
            <ul className="space-y-2">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="flex justify-between items-center p-3 rounded bg-slate-700/50 hover:bg-slate-700"
                >
                  <div>
                    <span className="font-medium">{g.name}</span>
                    {g.role === 'MJ' ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-600/80 text-amber-100">
                        MJ
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-slate-500">
                        Joueur
                      </span>
                    )}
                    <span className="ml-2 text-xs text-slate-500">
                      Code: {g.inviteCode}
                    </span>
                    {g.isGemma && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-purple-600/80 text-purple-100">
                        GEMMA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/table/${g.id}`)}
                      className="px-4 py-1 rounded bg-amber-600/80 hover:bg-amber-500 text-sm"
                    >
                      Ouvrir
                    </button>
                    {g.role === 'MJ' && (
                      <button
                        onClick={(e) => handleDelete(g.id, e)}
                        className="px-4 py-1 rounded bg-red-600/80 hover:bg-red-500 text-sm text-white"
                        title="Supprimer la partie"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
