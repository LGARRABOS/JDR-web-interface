import { useEffect, useRef, useState } from 'react';
import type { Member } from '../../realtime/protocol';
import { displayNameOf } from './presence';
import type { FogShape } from '../../fog/fog';
import {
  Cloud,
  Cursor,
  Eye,
  Flag,
  Focus,
  Lock,
  Moon,
  PlusCircle,
  Undo,
} from './icons';

export type FogTool = { shape: FogShape; reveal: boolean } | null;

type PopoverId = 'fog' | 'warfog' | 'turn' | null;

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
  /** Brouillard de guerre de la carte affichée. */
  hasMap: boolean;
  warFogEnabled: boolean;
  onToggleWarFog: () => void;
  fogTool: FogTool;
  onFogTool: (tool: FogTool) => void;
  onFogUndo: () => void;
  onFogReset: (revealAll: boolean) => void;
  canUndoFog: boolean;
  /** Voir la table comme un joueur. */
  onPreviewAsPlayer: () => void;
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
  hasMap,
  warFogEnabled,
  onToggleWarFog,
  fogTool,
  onFogTool,
  onFogUndo,
  onFogReset,
  canUndoFog,
  onPreviewAsPlayer,
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
      // Pendant le dessin du brouillard, le menu reste ouvert.
      if (open === 'warfog' && fogTool) return;
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
  }, [open, fogTool]);

  // Fermer le menu du brouillard range l'outil de dessin.
  useEffect(() => {
    if (open !== 'warfog' && fogTool) onFogTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          aria-label="Brouillard de guerre"
          title={hasMap ? 'Brouillard de guerre' : 'Affichez une carte'}
          disabled={!hasMap}
          aria-pressed={warFogEnabled}
          aria-expanded={open === 'warfog'}
          onClick={() => toggle('warfog')}
        >
          <Cloud />
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
        <button
          type="button"
          className="icon-btn"
          aria-label="Voir comme un joueur"
          title="Voir comme un joueur"
          onClick={() => {
            setOpen(null);
            onPreviewAsPlayer();
          }}
        >
          <Eye />
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

      {open === 'warfog' && (
        <div
          className="glass rounded-2xl p-4 w-72 flex flex-col gap-3"
          role="dialog"
          aria-label="Brouillard de guerre"
        >
          <p className="font-heading font-semibold">Brouillard de guerre</p>
          <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
            Actif sur cette carte
            <input
              type="checkbox"
              checked={warFogEnabled}
              onChange={onToggleWarFog}
              className="w-5 h-5 accent-fantasy-accent"
            />
          </label>
          {!warFogEnabled ? (
            <p className="text-sm text-fantasy-muted leading-snug">
              La carte est cachée aux joueurs ; vous révélez les zones au fur et
              à mesure de l&apos;exploration.
            </p>
          ) : (
            <>
              <div
                className="grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Outil"
              >
                {[
                  { reveal: true, label: 'Révéler' },
                  { reveal: false, label: 'Cacher' },
                ].map((o) => {
                  const active = fogTool?.reveal === o.reveal;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onFogTool(
                          active
                            ? null
                            : {
                                reveal: o.reveal,
                                shape: fogTool?.shape ?? 'rect',
                              }
                        )
                      }
                      className={`h-9 rounded-lg text-sm ${
                        active
                          ? 'bg-fantasy-accent text-fantasy-bg font-bold'
                          : 'bg-fantasy-input-soft hover:bg-fantasy-input-hover'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <div
                className="grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Forme"
              >
                {(
                  [
                    { shape: 'rect', label: 'Rectangle' },
                    { shape: 'ellipse', label: 'Ellipse' },
                  ] as const
                ).map((o) => {
                  const active = (fogTool?.shape ?? 'rect') === o.shape;
                  return (
                    <button
                      key={o.shape}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onFogTool({
                          reveal: fogTool?.reveal ?? true,
                          shape: o.shape,
                        })
                      }
                      className={`h-8 rounded-lg text-[13px] border ${
                        active
                          ? 'border-fantasy-accent text-fantasy-accent'
                          : 'border-fantasy-border-soft text-fantasy-muted hover:text-fantasy-text'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] text-fantasy-muted leading-snug">
                {fogTool
                  ? 'Glissez sur la carte pour dessiner la zone.'
                  : 'Choisissez « Révéler » ou « Cacher », puis glissez sur la carte.'}{' '}
                Vous voyez le brouillard en transparence.
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={onFogUndo}
                  disabled={!canUndoFog}
                  className="h-9 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Undo size={15} /> Annuler la dernière zone
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFogReset(true)}
                    className="h-9 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-sm"
                  >
                    Tout révéler
                  </button>
                  <button
                    type="button"
                    onClick={() => onFogReset(false)}
                    className="h-9 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-sm"
                  >
                    Tout cacher
                  </button>
                </div>
              </div>
            </>
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
