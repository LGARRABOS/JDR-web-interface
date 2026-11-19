import { useCallback, useEffect, useState } from 'react';
import { TestAPI, type TestPlayer } from '../../api/client';
import { ACT_AS_PARAM, activeActAs, switchActAs } from '../../auth/actAs';
import { getErrorMessage } from '../../utils/errorMessage';
import { Close, Copy, Trash, Undo, Users } from './icons';

// Panneau des parties test : joueurs fictifs à incarner, données d'exemple,
// remise à zéro. Réservé au MJ (il reste accessible quand il incarne un joueur).

interface TestPanelProps {
  gameId: number;
  onClose: () => void;
}

export function TestPanel({ gameId, onClose }: TestPanelProps) {
  const [players, setPlayers] = useState<TestPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCharacter, setNewCharacter] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const acting = activeActAs();

  const load = useCallback(async () => {
    try {
      const { data } = await TestAPI.state(gameId);
      setPlayers(data.players ?? []);
    } catch (e) {
      setErr(getErrorMessage(e, 'Outils de test indisponibles'));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      // Les onglets se rechargent sur l'événement « game.reload » ; on
      // rafraîchit quand même la liste au cas où.
      await load();
    } catch (e) {
      setErr(getErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const label = (p: TestPlayer) => p.characterName || p.displayName;

  const play = (p: TestPlayer) =>
    switchActAs({ gameId, userId: p.userId, name: label(p) });

  const openTab = (p: TestPlayer | null) => {
    const v = p ? `${p.userId}:${label(p)}` : 'mj';
    window.open(
      `/table/${gameId}?${ACT_AS_PARAM}=${encodeURIComponent(v)}`,
      '_blank',
      'noopener'
    );
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await TestAPI.addPlayer(gameId, {
        displayName: newName.trim() || undefined,
        characterName: newCharacter.trim() || undefined,
      });
      setNewName('');
      setNewCharacter('');
    }, 'Ajout impossible');
  };

  const rename = (
    p: TestPlayer,
    field: 'displayName' | 'characterName',
    value: string
  ) => {
    if (value.trim() === p[field]) return;
    run(
      () => TestAPI.updatePlayer(gameId, p.userId, { [field]: value }),
      'Modification impossible'
    );
  };

  const input =
    'h-9 px-2.5 rounded-lg bg-fantasy-input border border-fantasy-border-soft text-sm focus:outline-none focus:border-fantasy-accent min-w-0';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-3"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-panel-title"
        className="glass rounded-2xl w-[min(600px,96vw)] max-h-[88vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-400 text-black mt-1">
            TEST
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="test-panel-title"
              className="font-heading text-lg font-semibold"
            >
              Partie test
            </h2>
            <p className="text-sm text-fantasy-muted">
              {acting ? (
                <>
                  Vous jouez en tant que{' '}
                  <strong className="text-fantasy-text">{acting.name}</strong> :
                  vous voyez et agissez comme ce joueur.
                </>
              ) : (
                'Vous êtes le MJ. Incarnez un joueur fictif pour voir la partie avec ses droits.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            aria-label="Fermer"
          >
            <Close />
          </button>
        </div>

        {acting && (
          <button
            type="button"
            onClick={() => switchActAs(null)}
            className="h-10 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold flex items-center justify-center gap-2"
          >
            <Undo size={16} /> Revenir au MJ
          </button>
        )}

        {err && (
          <p role="alert" className="text-sm text-red-300">
            {err}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-fantasy-muted">
            <Users size={16} /> Joueurs fictifs
          </h3>
          {loading ? (
            <p className="text-sm text-fantasy-muted">Chargement…</p>
          ) : players.length === 0 ? (
            <p className="text-sm text-fantasy-muted">
              Aucun joueur fictif pour l&apos;instant.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {players.map((p) => {
                const isMe = acting?.userId === p.userId;
                return (
                  <li
                    key={p.userId}
                    className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-2 ${
                      isMe
                        ? 'border-fantasy-accent bg-fantasy-accent/10'
                        : 'border-fantasy-border-soft'
                    }`}
                  >
                    <input
                      defaultValue={p.displayName}
                      aria-label="Nom du joueur fictif"
                      onBlur={(e) => rename(p, 'displayName', e.target.value)}
                      className={`${input} flex-[1_1_120px]`}
                    />
                    <input
                      defaultValue={p.characterName}
                      placeholder="Personnage"
                      aria-label="Personnage"
                      onBlur={(e) => rename(p, 'characterName', e.target.value)}
                      className={`${input} flex-[1_1_140px]`}
                    />
                    <div className="flex gap-1.5 ml-auto">
                      <button
                        type="button"
                        disabled={isMe || busy}
                        onClick={() => play(p)}
                        className="h-9 px-3 rounded-lg bg-fantasy-accent text-fantasy-bg text-sm font-bold disabled:opacity-50"
                      >
                        {isMe ? 'Incarné' : 'Incarner'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openTab(p)}
                        className="icon-btn !w-9 !h-9"
                        title="Ouvrir un onglet en tant que ce joueur"
                        aria-label={`Ouvrir un onglet en tant que ${label(p)}`}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => TestAPI.removePlayer(gameId, p.userId),
                            'Suppression impossible'
                          )
                        }
                        className="icon-btn !w-9 !h-9 hover:!text-red-300"
                        title="Supprimer ce joueur fictif"
                        aria-label={`Supprimer ${label(p)}`}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom (facultatif)"
              aria-label="Nom du nouveau joueur fictif"
              className={`${input} flex-[1_1_140px]`}
            />
            <input
              value={newCharacter}
              onChange={(e) => setNewCharacter(e.target.value)}
              placeholder="Personnage (facultatif)"
              aria-label="Personnage du nouveau joueur fictif"
              className={`${input} flex-[1_1_160px]`}
            />
            <button
              type="submit"
              disabled={busy || players.length >= 8}
              className="h-9 px-3 rounded-lg border border-fantasy-border text-sm hover:bg-fantasy-input-soft disabled:opacity-50"
            >
              Ajouter
            </button>
          </form>
          <button
            type="button"
            onClick={() => openTab(null)}
            className="self-start text-sm text-fantasy-accent hover:underline"
          >
            Ouvrir un onglet en tant que MJ
          </button>
        </section>

        <section className="flex flex-col gap-2 border-t border-fantasy-border-soft pt-4">
          <h3 className="text-sm uppercase tracking-[0.14em] text-fantasy-muted">
            Contenu
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () => TestAPI.sample(gameId),
                  'Données d’exemple impossibles'
                )
              }
              className="h-10 px-4 rounded-lg border border-fantasy-border text-sm hover:bg-fantasy-input-soft disabled:opacity-50"
            >
              Ajouter des données d&apos;exemple
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirmReset
                  ? run(() => TestAPI.reset(gameId), 'Remise à zéro impossible')
                  : setConfirmReset(true)
              }
              onBlur={() => setConfirmReset(false)}
              className={`h-10 px-4 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                confirmReset
                  ? 'bg-red-600 text-white'
                  : 'border border-red-400/60 text-red-300 hover:bg-red-500/10'
              }`}
            >
              {confirmReset
                ? 'Confirmer la remise à zéro'
                : 'Réinitialiser la partie'}
            </button>
          </div>
          <p className="text-xs text-fantasy-muted">
            La remise à zéro efface cartes, jetons, monstres, messages, dés,
            documents et navire ; les joueurs fictifs restent. Les onglets
            ouverts se rechargent tout seuls.
          </p>
        </section>
      </div>
    </div>
  );
}
