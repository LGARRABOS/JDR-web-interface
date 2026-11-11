import { useState } from 'react';
import type { MapData } from '../../types/game';
import type { ConnectionStatus } from '../../realtime/connection';
import type { GameInfo, Member } from '../../realtime/protocol';
import { displayNameOf } from './presence';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Flag,
  MapIcon,
  Ruler,
  HelpCircle,
} from './icons';
import { PresenceMenu } from './PresenceMenu';

interface TopBarProps {
  game: GameInfo;
  isGM: boolean;
  you: Member | null;
  maps: MapData[];
  currentMap: MapData | null;
  players: Member[];
  presence: Member[];
  connection: ConnectionStatus;
  failedAttempts: number;
  turnPlayerId: number | null;
  onBack: () => void;
  onSelectMap: (mapId: number) => void;
  onOpenResources: () => void;
  onRetry: () => void;
  /** Règle de mesure (absente sans carte). */
  rulerActive?: boolean;
  onToggleRuler?: () => void;
  /** Ouvre le guide du jeu. */
  onOpenGuide?: () => void;
}

export function TopBar({
  game,
  isGM,
  you,
  maps,
  currentMap,
  players,
  presence,
  connection,
  failedAttempts,
  turnPlayerId,
  onBack,
  onSelectMap,
  onOpenResources,
  onRetry,
  rulerActive = false,
  onToggleRuler,
  onOpenGuide,
}: TopBarProps) {
  const [copied, setCopied] = useState(false);
  const turnPlayer = players.find((p) => p.userId === turnPlayerId);
  const myTurn = turnPlayerId != null && turnPlayerId === you?.userId;

  const copyInvite = async () => {
    if (!game.inviteCode) return;
    try {
      await navigator.clipboard.writeText(game.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // presse-papiers indisponible (HTTP) : le code reste lisible
    }
  };

  // Le MJ apparaît en premier, puis les joueurs.

  return (
    <header className="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-30 flex flex-wrap items-center justify-between gap-2 sm:gap-3 pointer-events-none">
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-2xl p-1 pr-2 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="icon-btn"
          aria-label="Retour aux parties"
        >
          <ChevronLeft />
        </button>
        <div className="flex flex-col leading-tight pr-3 mr-1 border-r border-fantasy-border-soft min-w-0">
          <span className="font-heading font-semibold text-base tracking-wide truncate max-w-[7rem] sm:max-w-[16rem]">
            {game.name}
          </span>
          <span className="text-xs text-fantasy-muted">
            {isGM
              ? 'Maître du Jeu'
              : (currentMap?.name ?? 'En attente d’une carte')}
          </span>
        </div>
        {isGM && (
          <label className="relative flex items-center gap-2 h-10 pl-3 pr-8 rounded-lg bg-fantasy-surface text-[15px] cursor-pointer hover:bg-fantasy-surface-hover">
            <span className="text-fantasy-accent">
              <MapIcon size={18} />
            </span>
            <span className="sr-only">Carte affichée</span>
            <select
              value={currentMap?.id ?? ''}
              onChange={(e) => onSelectMap(parseInt(e.target.value, 10))}
              className="appearance-none bg-transparent text-fantasy-text pr-1 focus:outline-none cursor-pointer max-w-[6rem] sm:max-w-[14rem]"
            >
              {!currentMap && (
                <option value="">
                  {maps.length ? 'Choisir une carte' : 'Aucune carte'}
                </option>
              )}
              {currentMap && !maps.some((m) => m.id === currentMap.id) && (
                <option value={currentMap.id}>{currentMap.name}</option>
              )}
              {maps.map((m) => (
                <option key={m.id} value={m.id} className="bg-fantasy-surface">
                  {m.name}
                </option>
              ))}
            </select>
            <span className="absolute right-2 pointer-events-none text-fantasy-muted">
              <ChevronDown size={16} />
            </span>
          </label>
        )}
        {onToggleRuler && (
          <button
            type="button"
            onClick={onToggleRuler}
            aria-pressed={rulerActive}
            aria-label="Règle de mesure"
            title={
              rulerActive
                ? 'Règle active : glissez sur la carte (cliquez pour arrêter)'
                : 'Règle de mesure'
            }
            className={`icon-btn ml-1 ${
              rulerActive ? '!bg-fantasy-accent !text-fantasy-bg' : ''
            }`}
          >
            <Ruler />
          </button>
        )}
      </div>

      {turnPlayer &&
        (myTurn ? (
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 h-12 px-5 rounded-2xl bg-fantasy-accent text-fantasy-bg shadow-lg"
          >
            <Flag size={18} />
            <span className="font-heading font-bold">
              C&apos;est ton tour, {displayNameOf(turnPlayer)} !
            </span>
          </div>
        ) : (
          <div
            role="status"
            className="glass pointer-events-auto flex items-center gap-2 h-10 px-4 rounded-xl text-sm"
          >
            <span className="text-fantasy-accent">
              <Flag size={16} />
            </span>
            Tour de <strong>{displayNameOf(turnPlayer)}</strong>
          </div>
        ))}

      <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl py-1.5 pl-3.5 pr-1.5">
        <PresenceMenu
          players={players}
          presence={presence}
          youId={you?.userId}
        />

        {connection === 'open' ? (
          <span className="flex items-center gap-1.5 text-[13px] text-fantasy-muted">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="hidden sm:inline">Connecté</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 text-[13px] text-amber-300 hover:text-amber-200"
            title="Réessayer maintenant"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {failedAttempts < 3 ? 'Connexion…' : 'Hors ligne'}
          </button>
        )}

        {isGM && game.inviteCode && (
          <button
            type="button"
            onClick={copyInvite}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-fantasy-border-soft text-sm text-fantasy-text-soft hover:bg-fantasy-input-soft"
            title="Copier le code d'invitation"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span className="hidden sm:inline">
              {copied ? 'Copié !' : `Inviter · ${game.inviteCode}`}
            </span>
          </button>
        )}
        {onOpenGuide && (
          <button
            type="button"
            onClick={onOpenGuide}
            className="icon-btn !w-9 !h-9"
            aria-label="Guide du jeu"
            title="Guide du jeu"
          >
            <HelpCircle size={18} />
          </button>
        )}
        {isGM && (
          <button
            type="button"
            onClick={onOpenResources}
            className="h-9 px-3.5 rounded-lg bg-fantasy-accent text-fantasy-bg text-sm font-bold hover:bg-fantasy-accent-hover"
          >
            Ressources
          </button>
        )}
      </div>
    </header>
  );
}
