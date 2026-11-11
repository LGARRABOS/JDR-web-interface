import { useEffect, useRef, useState } from 'react';
import type { Member } from '../../realtime/protocol';
import { colorForUser, displayNameOf, initials } from './presence';
import { Users } from './icons';

interface PresenceMenuProps {
  /** Tous les membres de la partie. */
  players: Member[];
  /** Membres connectés en ce moment. */
  presence: Member[];
  youId?: number;
}

export interface PresenceChange {
  id: number;
  text: string;
  joined: boolean;
}

/** Arrivées et départs entre deux listes de connectés (soi-même exclu). */
export function presenceChanges(
  before: Set<number>,
  after: Member[],
  players: Member[],
  youId?: number
): { joined: Member[]; left: Member[] } {
  const now = new Set(after.map((m) => m.userId));
  const find = (id: number) =>
    after.find((m) => m.userId === id) ?? players.find((m) => m.userId === id);
  const joined = [...now]
    .filter((id) => !before.has(id) && id !== youId)
    .map(find)
    .filter((m): m is Member => !!m);
  const left = [...before]
    .filter((id) => !now.has(id) && id !== youId)
    .map(find)
    .filter((m): m is Member => !!m);
  return { joined, left };
}

function Avatar({
  m,
  online,
  players,
  size = 32,
}: {
  m: Member;
  online: boolean;
  players: Member[];
  size?: number;
}) {
  const isMJ = m.role === 'MJ';
  const bg = isMJ ? 'rgb(var(--c-accent))' : colorForUser(m.userId, players).bg;
  return (
    <span
      className="relative inline-flex shrink-0 rounded-full items-center justify-center font-bold border-2 border-fantasy-bg"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: online ? bg : 'rgb(var(--c-input))',
        color: online
          ? isMJ
            ? 'rgb(var(--c-bg))'
            : 'white'
          : 'rgb(var(--c-muted))',
        filter: online ? undefined : 'grayscale(1)',
      }}
      aria-hidden
    >
      {isMJ ? 'MJ' : initials(displayNameOf(m))}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-fantasy-bg ${
          online ? 'bg-emerald-400' : 'bg-zinc-500'
        }`}
      />
    </span>
  );
}

/**
 * Qui est à la table : avatars des connectés et compteur ; un clic ouvre la
 * liste complète (rôle, personnage, en ligne ou absent).
 */
export function PresenceMenu({ players, presence, youId }: PresenceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onlineIds = new Set(presence.map((p) => p.userId));
  // Le MJ d'abord, puis les connectés, puis les absents.
  const people = [...players].sort(
    (a, b) =>
      Number(b.role === 'MJ') - Number(a.role === 'MJ') ||
      Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId)) ||
      displayNameOf(a).localeCompare(displayNameOf(b), 'fr')
  );
  const online = people.filter((p) => onlineIds.has(p.userId));
  const shown = online.slice(0, 4);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Participants : ${online.length} connecté${online.length > 1 ? 's' : ''} sur ${people.length}`}
        title="Qui est à la table ?"
        className="flex items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-xl hover:bg-fantasy-input-soft"
      >
        <span className="hidden sm:flex items-center">
          {shown.map((m, i) => (
            <span key={m.userId} className={i > 0 ? '-ml-2' : ''}>
              <Avatar m={m} online players={players} size={30} />
            </span>
          ))}
        </span>
        <span className="sm:hidden text-fantasy-muted">
          <Users size={18} />
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {online.length}
          <span className="text-fantasy-muted font-normal">
            /{people.length}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Participants"
          className="glass absolute right-0 top-12 w-72 max-w-[calc(100vw-1rem)] rounded-2xl p-2 flex flex-col gap-0.5 animate-[fadeIn_120ms_ease-out]"
        >
          <p className="px-2 pt-1 pb-2 text-sm text-fantasy-muted">
            <strong className="text-fantasy-text">{online.length}</strong>{' '}
            connecté{online.length > 1 ? 's' : ''} sur {people.length}
          </p>
          <ul className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
            {people.map((m) => {
              const isOnline = onlineIds.has(m.userId);
              const name = displayNameOf(m);
              const showAccount =
                m.characterName?.trim() && m.displayName !== name;
              return (
                <li
                  key={m.userId}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl ${
                    isOnline ? '' : 'opacity-60'
                  }`}
                >
                  <Avatar m={m} online={isOnline} players={players} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{name}</span>
                      {m.userId === youId && (
                        <span className="text-xs text-fantasy-muted">
                          (vous)
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-fantasy-muted truncate">
                      {m.role === 'MJ' ? 'Maître du jeu' : 'Joueur'}
                      {showAccount ? ` · ${m.displayName}` : ''}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      isOnline ? 'text-emerald-400' : 'text-fantasy-muted'
                    }`}
                  >
                    {isOnline ? 'En ligne' : 'Absent'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Notifications d'arrivée et de départ, sous la barre du haut. */
export function PresenceToasts({
  players,
  presence,
  youId,
  ready,
}: PresenceMenuProps & { ready: boolean }) {
  const [toasts, setToasts] = useState<PresenceChange[]>([]);
  const prev = useRef<Set<number> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!ready) return;
    const ids = new Set(presence.map((m) => m.userId));
    // Première liste reçue : pas de notification pour ceux déjà là.
    if (prev.current == null) {
      prev.current = ids;
      return;
    }
    const { joined, left } = presenceChanges(
      prev.current,
      presence,
      players,
      youId
    );
    prev.current = ids;
    const fresh: PresenceChange[] = [
      ...joined.map((m) => ({
        id: ++seq.current,
        joined: true,
        text: `${displayNameOf(m)} a rejoint la table`,
      })),
      ...left.map((m) => ({
        id: ++seq.current,
        joined: false,
        text: `${displayNameOf(m)} a quitté la table`,
      })),
    ];
    if (fresh.length === 0) return;
    setToasts((t) => [...t, ...fresh].slice(-4));
    const ids2 = fresh.map((f) => f.id);
    const timer = setTimeout(
      () => setToasts((t) => t.filter((x) => !ids2.includes(x.id))),
      4000
    );
    return () => clearTimeout(timer);
  }, [presence, players, youId, ready]);

  if (toasts.length === 0) return null;
  return (
    <div
      className="absolute top-[72px] sm:top-[84px] left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass rounded-xl px-3.5 py-2 text-sm flex items-center gap-2 animate-[fadeIn_150ms_ease-out]"
        >
          <span
            className={`w-2 h-2 rounded-full ${t.joined ? 'bg-emerald-400' : 'bg-zinc-500'}`}
          />
          {t.text}
        </div>
      ))}
    </div>
  );
}
