import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { GamesAPI } from '../api/client';
import { ModalConfirm } from '../components/Modal';

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
  const [deleteGameId, setDeleteGameId] = useState<number | null>(null);

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

  const handleDeleteClick = (gameId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteGameId(gameId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteGameId) return;
    try {
      await GamesAPI.delete(deleteGameId);
      loadGames();
    } catch (e: unknown) {
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur'
      );
    } finally {
      setDeleteGameId(null);
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
      <ModalConfirm
        open={deleteGameId !== null}
        onClose={() => setDeleteGameId(null)}
        onConfirm={handleDeleteConfirm}
        title="Supprimer la partie"
        message="Supprimer cette partie ? Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
      />
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold font-heading text-fantasy-text-soft">
          Table JDR
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-fantasy-muted-soft">{user?.displayName}</span>
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto space-y-8">
        <section className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-6">
          <h2 className="text-lg font-semibold font-heading mb-2 text-fantasy-text-soft">
            Créer une partie
          </h2>
          <p className="text-sm text-fantasy-muted-soft mb-4">
            Vous serez automatiquement le Maître du Jeu (MJ) de la partie.
          </p>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nom de la partie"
                className="flex-1 rounded bg-fantasy-input-soft px-4 py-2 text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
              />
              <button
                type="submit"
                className="px-6 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg"
              >
                Créer
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-fantasy-muted cursor-pointer">
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

        <section className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-6">
          <h2 className="text-lg font-semibold font-heading mb-4 text-fantasy-text-soft">
            Rejoindre une partie
          </h2>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code d'invitation"
              className="flex-1 rounded bg-fantasy-input-soft px-4 py-2 text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft uppercase"
            />
            <button
              type="submit"
              className="px-6 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg"
            >
              Rejoindre
            </button>
          </form>
          {err && <p className="mt-2 text-fantasy-error text-sm">{err}</p>}
        </section>

        <section className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-6">
          <h2 className="text-lg font-semibold font-heading mb-4 text-fantasy-text-soft">
            Mes parties
          </h2>
          {loading ? (
            <p className="text-fantasy-muted-soft">Chargement...</p>
          ) : games.length === 0 ? (
            <p className="text-fantasy-muted-soft">
              Aucune partie. Créez-en une ou rejoignez avec un code.
            </p>
          ) : (
            <ul className="space-y-2">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="flex justify-between items-center p-3 rounded bg-fantasy-input-soft/50 hover:bg-fantasy-input-hover-soft border border-fantasy-border-soft"
                >
                  <div>
                    <span className="font-medium text-fantasy-text-soft">
                      {g.name}
                    </span>
                    {g.role === 'MJ' ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-fantasy-accent/80 text-fantasy-bg">
                        MJ
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-fantasy-muted-soft">
                        Joueur
                      </span>
                    )}
                    <span className="ml-2 text-xs text-fantasy-muted-soft">
                      Code: {g.inviteCode}
                    </span>
                    {g.isGemma && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-fantasy-accent/50 text-fantasy-bg">
                        GEMMA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/table/${g.id}`)}
                      className="px-4 py-1 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover text-fantasy-bg text-sm"
                    >
                      Ouvrir
                    </button>
                    {g.role === 'MJ' && (
                      <button
                        onClick={(e) => handleDeleteClick(g.id, e)}
                        className="px-4 py-1 rounded bg-fantasy-danger hover:bg-fantasy-error text-sm text-white"
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
