import { useEffect, useRef, useState } from 'react';
import type { Member } from '../../realtime/protocol';
import { displayNameOf } from './presence';
import { Cursor, Flag, Focus, Lock, Moon, PlusCircle } from './icons';

type PopoverId = 'fog' | 'turn' | null;

interface GmToolbarProps {
  placementActive: boolean;
  enemyPanelOpen: boolean;
  onSelectTool: () => void;
  onAddEnemy: () => void;
  fogVisionRadius: number;
  onChangeFog: (radius: number) => void;
  tokensLocked: boolean;
  onToggleLock: () => void;
  players: Member[];
  turnPlayerId: number | null;
  onTurn: (playerId: number | null) => void;
  onRecenter: () => void;
}

/** Barre d'outils verticale du MJ, à gauche de la carte. */
export function GmToolbar({
  placementActive,
  enemyPanelOpen,
  onSelectTool,
  onAddEnemy,
  fogVisionRadius,
  onChangeFog,
  tokensLocked,
  onToggleLock,
  players,
  turnPlayerId,
  onTurn,
  onRecenter,
}: GmToolbarProps) {
  const [open, setOpen] = useState<PopoverId>(null);
  const [radius, setRadius] = useState(String(fogVisionRadius || 120));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fogVisionRadius > 0) setRadius(String(fogVisionRadius));
  }, [fogVisionRadius]);

  // Fermer le menu ouvert au clic ailleurs ou avec Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: PopoverId) => setOpen((cur) => (cur === id ? null : id));
  const fogOn = fogVisionRadius > 0;
  const commitRadius = () => {
    const v = parseInt(radius, 10);
    if (!Number.isNaN(v) && v > 0 && v !== fogVisionRadius)
      onChangeFog(Math.min(1000, v));
  };
  const turnPlayers = players.filter((p) => p.role !== 'MJ');

  return (
    <div
      ref={rootRef}
      className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-start gap-2"
    >
      <nav
        aria-label="Outils du MJ"
        className="glass rounded-2xl p-1.5 flex flex-col gap-1"
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Sélectionner et déplacer"
          title="Sélectionner et déplacer"
          aria-pressed={!placementActive && !enemyPanelOpen}
          onClick={onSelectTool}
        >
          <Cursor />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Ajouter un ennemi"
          title="Ajouter un ennemi"
          aria-pressed={placementActive || enemyPanelOpen}
          onClick={onAddEnemy}
        >
          <PlusCircle />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Zone d'obscurité"
          title="Zone d'obscurité"
          aria-pressed={fogOn}
          aria-expanded={open === 'fog'}
          onClick={() => toggle('fog')}
        >
          <Moon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={
            tokensLocked
              ? 'Débloquer les déplacements'
              : 'Bloquer les déplacements des joueurs'
          }
          title={
            tokensLocked
              ? 'Déplacements bloqués'
              : 'Bloquer les déplacements des joueurs'
          }
          aria-pressed={tokensLocked}
          onClick={onToggleLock}
        >
          <Lock />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Tour de jeu"
          title="Tour de jeu"
          aria-pressed={turnPlayerId != null}
          aria-expanded={open === 'turn'}
          onClick={() => toggle('turn')}
        >
          <Flag />
        </button>
        <div className="h-px mx-1.5 my-1 bg-fantasy-border-soft" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Recentrer la carte pour tout le monde"
          title="Recentrer la carte pour tout le monde"
          onClick={onRecenter}
        >
          <Focus />
        </button>
      </nav>

      {open === 'fog' && (
        <div
          className="glass rounded-2xl p-4 w-64 flex flex-col gap-3"
          role="dialog"
          aria-label="Zone d'obscurité"
        >
          <p className="font-heading font-semibold">Zone d&apos;obscurité</p>
          <p className="text-sm text-fantasy-muted leading-snug">
            Les joueurs ne voient la carte qu&apos;autour de leurs personnages
            (nuit, grotte…).
          </p>
          <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
            Activée
            <input
              type="checkbox"
              checked={fogOn}
              onChange={() =>
                onChangeFog(fogOn ? 0 : parseInt(radius, 10) || 120)
              }
              className="w-5 h-5 accent-fantasy-accent"
            />
          </label>
          {fogOn && (
            <label className="flex items-center justify-between gap-3 text-sm">
              Rayon de vision
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={40}
                  max={1000}
                  step={20}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  onBlur={commitRadius}
                  onKeyDown={(e) => e.key === 'Enter' && commitRadius()}
                  className="w-20 h-9 px-2 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-fantasy-text"
                />
                <span className="text-fantasy-muted">px</span>
              </span>
            </label>
          )}
        </div>
      )}

      {open === 'turn' && (
        <div
          className="glass rounded-2xl p-3 w-64 flex flex-col gap-1"
          role="dialog"
          aria-label="Tour de jeu"
        >
          <p className="font-heading font-semibold px-1 pb-1">
            À qui le tour ?
          </p>
          {turnPlayers.length === 0 && (
            <p className="text-sm text-fantasy-muted px-1">
              Aucun joueur dans la partie.
            </p>
          )}
          {turnPlayers.map((p) => (
            <button
              key={p.userId}
              type="button"
              onClick={() => onTurn(p.userId)}
              className={`h-10 px-3 rounded-lg text-left text-[15px] ${
                turnPlayerId === p.userId
                  ? 'bg-fantasy-accent text-fantasy-bg font-bold'
                  : 'hover:bg-fantasy-input-soft'
              }`}
            >
              {displayNameOf(p)}
            </button>
          ))}
          {turnPlayerId != null && (
            <button
              type="button"
              onClick={() => onTurn(null)}
              className="mt-1 h-10 px-3 rounded-lg text-left text-sm text-fantasy-muted hover:bg-fantasy-input-soft"
            >
              Terminer le tour
            </button>
          )}
        </div>
      )}
    </div>
  );
}
