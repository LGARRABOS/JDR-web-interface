import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { GamesAPI } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';
import { ModalConfirm } from '../components/Modal';
import { ProfileModal } from '../components/ProfileModal';
import {
  Check,
  ChevronDown,
  Copy,
  Library,
  LogOut,
  Trash,
} from '../components/tabletop/icons';
import { initials } from '../components/tabletop/presence';
import { D20Logo } from './AuthPage';

interface Game {
  id: number;
  name: string;
  inviteCode: string;
  ownerId: number;
  role: string;
  isGemma?: boolean;
  characterName?: string;
  currentMapName?: string;
  currentMapImageUrl?: string;
  playerCount?: number;
}

function gameSubtitle(g: Game) {
  const parts: string[] = [];
  if (g.role === 'MJ') {
    parts.push(
      g.playerCount
        ? `${g.playerCount} joueur${g.playerCount > 1 ? 's' : ''}`
        : 'Aucun joueur'
    );
  } else if (g.characterName) {
    parts.push(`Personnage : ${g.characterName}`);
  }
  if (g.currentMapName) parts.push(g.currentMapName);
  return parts.join(' · ') || 'Pas encore de carte';
}

/** Menu du compte (profil, guide, déconnexion) en haut à droite. */
function AccountMenu({
  name,
  onProfile,
  onLogout,
}: {
  name: string;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'w-full h-10 px-3 rounded-lg text-left text-[15px] hover:bg-fantasy-surface-hover';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 h-11 pl-1.5 pr-3.5 rounded-xl bg-fantasy-surface border border-fantasy-border text-[15px] hover:bg-fantasy-surface-hover"
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold bg-fantasy-accent text-fantasy-bg">
          {initials(name)}
        </span>
        <span className="max-w-[10rem] truncate">{name}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-30 w-56 p-1.5 rounded-xl bg-fantasy-surface border border-fantasy-border shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            Profil et apparence
          </button>
          <Link
            role="menuitem"
            to="/games/wiki"
            className={`${item} flex items-center`}
          >
            Guide du jeu
          </Link>
          <div className="h-px my-1 bg-fantasy-border-soft" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-fantasy-error`}
            onClick={onLogout}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function GameLobbyPage() {
  const { user, logout, refresh } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState('');
  const [isGemma, setIsGemma] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');
  const [deleteGameId, setDeleteGameId] = useState<number | null>(null);
  const [leaveGameId, setLeaveGameId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const loadGames = async () => {
    try {
      const { data } = await GamesAPI.list();
      setGames(data.games ?? []);
    } catch (e) {
      setErr(getErrorMessage(e, 'Impossible de charger vos parties'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 6000);
    return () => clearTimeout(t);
  }, [err]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy('create');
    try {
      const { data } = await GamesAPI.create({
        name: createName.trim() || undefined,
        isGemma,
      });
      setCreateName('');
      if (data.game?.id) navigate(`/table/${data.game.id}`);
      else loadGames();
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Création impossible'));
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!joinCode.trim()) return;
    setBusy('join');
    try {
      const { data } = await GamesAPI.join({ inviteCode: joinCode.trim() });
      setJoinCode('');
      if (data.gameId) navigate(`/table/${data.gameId}`);
      else loadGames();
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Code invalide'));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteGameId) return;
    try {
      await GamesAPI.delete(deleteGameId);
      setGames((prev) => prev.filter((g) => g.id !== deleteGameId));
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Suppression impossible'));
    } finally {
      setDeleteGameId(null);
    }
  };

  const handleLeaveConfirm = async () => {
    if (!leaveGameId) return;
    try {
      await GamesAPI.leave(leaveGameId);
      setGames((prev) => prev.filter((g) => g.id !== leaveGameId));
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Impossible de quitter la partie'));
    } finally {
      setLeaveGameId(null);
    }
  };

  const copyCode = async (g: Game) => {
    try {
      await navigator.clipboard.writeText(g.inviteCode);
      setCopiedId(g.id);
      setTimeout(() => setCopiedId((id) => (id === g.id ? null : id)), 1500);
    } catch {
      // presse-papiers indisponible : le code reste affiché
    }
  };

  const inputClass =
    'h-12 px-3.5 rounded-lg bg-fantasy-bg border border-fantasy-border text-base text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent';
  const card = 'rounded-2xl bg-fantasy-surface border border-fantasy-border';

  return (
    <div className="min-h-screen bg-fantasy-bg text-fantasy-text">
      <ModalConfirm
        open={deleteGameId !== null}
        onClose={() => setDeleteGameId(null)}
        onConfirm={handleDeleteConfirm}
        title="Quitter et supprimer la partie"
        message="Vous êtes le MJ : quitter la partie la supprime pour tous les joueurs (fiches, messages et lancers compris), et c'est irréversible. Vos cartes, monstres, décors et musiques sont rangés dans votre bibliothèque."
        confirmLabel="Supprimer la partie"
        danger
      />
      <ModalConfirm
        open={leaveGameId !== null}
        onClose={() => setLeaveGameId(null)}
        onConfirm={handleLeaveConfirm}
        title="Quitter la partie"
        message="Votre personnage sera retiré de la table. Vous pourrez revenir avec le code d'invitation du MJ et retrouver votre fiche."
        confirmLabel="Quitter"
        danger
      />
      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        onSuccess={refresh}
        onAccountDeleted={() => logout().then(() => navigate('/login'))}
      />

      <header className="border-b border-fantasy-surface">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/games" className="flex items-center gap-2.5">
            <D20Logo size={28} />
            <span className="font-heading font-bold text-lg tracking-wide">
              Table JDR
            </span>
          </Link>
          <AccountMenu
            name={user?.displayName ?? 'Mon compte'}
            onProfile={() => setProfileModalOpen(true)}
            onLogout={() => logout().then(() => navigate('/login'))}
          />
        </div>
      </header>

      {err && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2.5 text-sm bg-fantasy-surface border border-fantasy-danger/50 text-fantasy-error shadow-xl"
        >
          {err}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 pt-8 pb-14 flex flex-col gap-8">
        <div className="flex flex-wrap gap-4">
          <form
            onSubmit={handleCreate}
            className={`${card} flex-[1_1_420px] p-5 flex flex-col gap-3.5`}
          >
            <div>
              <h2 className="font-heading font-semibold text-lg">
                Créer une partie
              </h2>
              <p className="text-sm text-fantasy-muted">
                Vous en serez le Maître du Jeu.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <label htmlFor="create-name" className="sr-only">
                Nom de la partie
              </label>
              <input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nom de la partie"
                className={`${inputClass} flex-[1_1_220px]`}
              />
              <button
                type="submit"
                disabled={busy !== null}
                className="h-12 px-5 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold hover:bg-fantasy-accent-hover disabled:opacity-60"
              >
                Créer
              </button>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-fantasy-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isGemma}
                onChange={(e) => setIsGemma(e.target.checked)}
                className="w-[18px] h-[18px] accent-fantasy-accent"
              />
              Univers GEMMA (règles et fiches dédiées, non modifiable ensuite)
            </label>
          </form>

          <form
            onSubmit={handleJoin}
            className={`${card} flex-[1_1_320px] p-5 flex flex-col gap-3.5`}
          >
            <div>
              <h2 className="font-heading font-semibold text-lg">
                Rejoindre une partie
              </h2>
              <p className="text-sm text-fantasy-muted">
                Avec le code donné par votre MJ.
              </p>
            </div>
            <div className="flex gap-2.5">
              <label htmlFor="join-code" className="sr-only">
                Code d&apos;invitation
              </label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Code"
                autoComplete="off"
                className={`${inputClass} flex-1 min-w-0 tracking-[0.12em] uppercase`}
              />
              <button
                type="submit"
                disabled={busy !== null || !joinCode.trim()}
                className="h-12 px-5 rounded-lg border border-fantasy-accent text-fantasy-accent font-bold hover:bg-fantasy-accent/10 disabled:opacity-50"
              >
                Rejoindre
              </button>
            </div>
          </form>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading font-bold text-2xl">Mes parties</h1>
            <button
              type="button"
              onClick={() => navigate('/library')}
              className="h-10 px-3.5 rounded-lg border border-fantasy-border text-sm text-fantasy-text hover:bg-fantasy-surface flex items-center gap-2"
            >
              <Library size={16} />
              Ma bibliothèque
            </button>
          </div>
          {loading ? (
            <p className="text-fantasy-muted">Chargement…</p>
          ) : games.length === 0 ? (
            <div className={`${card} p-8 text-center text-fantasy-muted`}>
              Vous n&apos;avez pas encore de partie. Créez-en une, ou rejoignez
              celle de votre MJ avec son code.
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {games.map((g) => {
                const isGM = g.role === 'MJ';
                return (
                  <li
                    key={g.id}
                    className={`${card} overflow-hidden flex flex-col`}
                  >
                    <div
                      className="relative aspect-video flex items-center justify-center bg-fantasy-surface-hover"
                      style={
                        g.currentMapImageUrl
                          ? undefined
                          : {
                              background:
                                'linear-gradient(135deg, rgb(var(--c-input-hover)), rgb(var(--c-bg)))',
                            }
                      }
                    >
                      {g.currentMapImageUrl ? (
                        <img
                          src={g.currentMapImageUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <span className="opacity-40">
                          <D20Logo size={44} />
                        </span>
                      )}
                      <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isGM
                              ? 'bg-fantasy-accent text-fantasy-bg'
                              : 'bg-fantasy-bg/80 text-fantasy-secondary'
                          }`}
                        >
                          {isGM ? 'MJ' : 'Joueur'}
                        </span>
                        {g.isGemma && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs bg-black/60 text-white">
                            GEMMA
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-3">
                      <div className="min-w-0">
                        <h3
                          className="font-heading font-semibold text-[17px] truncate"
                          title={g.name}
                        >
                          {g.name}
                        </h3>
                        <p className="text-sm text-fantasy-muted truncate">
                          {gameSubtitle(g)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/table/${g.id}`)}
                          className="flex-1 h-11 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold hover:bg-fantasy-accent-hover"
                        >
                          Entrer
                        </button>
                        {isGM && (
                          <>
                            <button
                              type="button"
                              onClick={() => copyCode(g)}
                              title="Copier le code d'invitation"
                              aria-label={`Copier le code d'invitation ${g.inviteCode}`}
                              className="h-11 px-3 rounded-lg border border-fantasy-border text-sm tracking-wider text-fantasy-muted hover:text-fantasy-text flex items-center gap-1.5"
                            >
                              {copiedId === g.id ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                              {copiedId === g.id ? 'Copié' : g.inviteCode}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteGameId(g.id)}
                              title="Quitter et supprimer la partie"
                              aria-label={`Supprimer la partie ${g.name}`}
                              className="w-11 h-11 rounded-lg border border-fantasy-border text-fantasy-muted hover:text-fantasy-error hover:border-fantasy-danger/60 flex items-center justify-center"
                            >
                              <Trash size={16} />
                            </button>
                          </>
                        )}
                        {!isGM && (
                          <button
                            type="button"
                            onClick={() => setLeaveGameId(g.id)}
                            title="Quitter la partie"
                            aria-label={`Quitter la partie ${g.name}`}
                            className="w-11 h-11 rounded-lg border border-fantasy-border text-fantasy-muted hover:text-fantasy-error hover:border-fantasy-danger/60 flex items-center justify-center"
                          >
                            <LogOut size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
