import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  ElementsAPI,
  GamesAPI,
  MessagesAPI,
  RollsAPI,
  TokensAPI,
  type TokenUpdate,
} from '../api/client';
import { MapCanvas, type MapView, type Token } from '../components/MapCanvas';
import { TokenPanel, type TokenFormData } from '../components/TokenPanel';
import {
  MonsterEditorModal,
  type GameElementFull,
} from '../components/MonsterEditorModal';
import { DicePanel } from '../components/DicePanel';
import { ChatPanel } from '../components/ChatPanel';
import { PresenceBar } from '../components/PresenceBar';
import { CharacterSheetPanel } from '../components/CharacterSheetPanel';
import { MusicPanel } from '../components/MusicPanel';
import { MusicPlayer } from '../components/MusicPlayer';
import { DiceRollOverlay } from '../components/DiceRollOverlay';
import { Checkbox } from '../components/Checkbox';
import { CopyableCode } from '../components/CopyableCode';
import { ConnectionBanner } from '../components/tabletop/ConnectionBanner';
import { MapSettingsPanel } from '../components/tabletop/MapSettingsPanel';
import { useGameSession } from '../realtime/useGameSession';
import { getErrorMessage } from '../utils/errorMessage';

const GM_TIPS = [
  'Utilisez le panneau "Ajouter un ennemi" : recherchez un ennemi dans vos ressources, définissez ses PV/mana, puis placez-le sur la carte.',
  'Cliquez sur un jeton sur la carte ou dans la liste pour le sélectionner et modifier ses PV.',
  'Utilisez la molette ou les boutons +/− pour zoomer sur la carte. Glissez pour la déplacer.',
  'Gérez les cartes et la musique depuis la page Ressources.',
  'Les jetons peuvent être déplacés par glisser-déposer. Cliquez sur ✕ pour en supprimer.',
  "Le code d'invitation permet aux joueurs de rejoindre la partie.",
  'Les joueurs connectés apparaissent dans la barre en haut de la colonne de droite.',
  'Les dés et le chat sont partagés en temps réel avec tous les participants.',
];

function pickRandomTip(exclude?: string) {
  const available = exclude ? GM_TIPS.filter((t) => t !== exclude) : GM_TIPS;
  return available[Math.floor(Math.random() * available.length)] ?? GM_TIPS[0];
}

const DEFAULT_VIEW: MapView = { scale: 1, offset: { x: 0, y: 0 } };
const VIEW_SEND_INTERVAL_MS = 50;

interface LibraryElement {
  id: number;
  name: string;
  imageUrl: string;
  category: string;
  maxHp?: number;
  maxMana?: number;
}

/**
 * Table de jeu. Tout l'état partagé (carte, jetons, chat, musique, présence…)
 * vient du serveur via useGameSession. La page n'envoie que des commandes
 * (requêtes HTTP ou actions WebSocket) et n'applique jamais elle-même le
 * résultat : c'est l'événement diffusé par le serveur qui met l'écran à jour,
 * de la même façon pour tous les participants.
 */
export function TabletopPage() {
  const { gameId: gameIdParam } = useParams();
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 0;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { store, state, send, resync } = useGameSession(gameId);
  const { game, you, scene, live } = state;

  const isGM = you?.role === 'MJ';
  const currentMap = scene?.map ?? null;
  const tokens = useMemo(() => scene?.tokens ?? [], [scene]);
  const mapElements = useMemo(() => scene?.mapElements ?? [], [scene]);
  const gamePlayers = useMemo(
    () => state.players.filter((p) => p.role !== 'MJ'),
    [state.players]
  );
  const mapView: MapView = live.view
    ? {
        scale: live.view.scale,
        offset: { x: live.view.offsetX, y: live.view.offsetY },
      }
    : DEFAULT_VIEW;

  const [elements, setElements] = useState<LibraryElement[]>([]);
  const [placementData, setPlacementData] = useState<TokenFormData | null>(
    null
  );
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const [selectedPlayerForTurn, setSelectedPlayerForTurn] = useState<
    number | null
  >(null);
  const [characterNameInput, setCharacterNameInput] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [gmTip, setGmTip] = useState(pickRandomTip);
  const [monsterView, setMonsterView] = useState<{
    element: GameElementFull;
    tokenData: { hp: number; maxHp: number; mana: number; maxMana: number };
    tokenKind: string;
    tokenId: number;
  } | null>(null);

  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? null;

  // --- Chargements annexes ------------------------------------------------

  // Si la connexion échoue plusieurs fois avant le premier instantané, on vérifie
  // que l'utilisateur a toujours accès à la partie (retirée, supprimée…).
  useEffect(() => {
    if (state.ready || state.failedAttempts < 3) return;
    let cancelled = false;
    GamesAPI.get(gameId).catch((e: { response?: { status?: number } }) => {
      const status = e?.response?.status;
      if (!cancelled && (status === 403 || status === 404)) navigate('/games');
    });
    return () => {
      cancelled = true;
    };
  }, [state.ready, state.failedAttempts, gameId, navigate]);

  // Bibliothèque d'éléments (monstres, décors) : réservée au MJ.
  useEffect(() => {
    if (!isGM || !gameId) return;
    ElementsAPI.list(gameId)
      .then(({ data }) => setElements(data.elements ?? []))
      .catch(() => setElements([]));
  }, [gameId, isGM]);

  useEffect(() => {
    setCharacterNameInput(you?.characterName ?? '');
  }, [you?.characterName]);

  useEffect(() => {
    if (!isGM) return;
    const interval = setInterval(
      () => setGmTip((prev) => pickRandomTip(prev)),
      15000
    );
    return () => clearInterval(interval);
  }, [isGM]);

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  /** Une commande a échoué : on affiche l'erreur et on recharge l'état réel. */
  const fail = useCallback(
    (e: unknown, fallback: string) => {
      setActionError(getErrorMessage(e, fallback));
      resync();
    },
    [resync]
  );

  // --- Vue de la carte ----------------------------------------------------

  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewLastSent = useRef(0);
  const viewPending = useRef<MapView | null>(null);

  const sendView = useCallback(() => {
    const v = viewPending.current;
    viewPending.current = null;
    viewTimer.current = null;
    if (!v) return;
    viewLastSent.current = Date.now();
    send({
      action: 'map.view',
      scale: v.scale,
      offsetX: v.offset.x,
      offsetY: v.offset.y,
    });
  }, [send]);

  const handleMapViewChange = useCallback(
    (view: MapView) => {
      store.setLocalView({
        scale: view.scale,
        offsetX: view.offset.x,
        offsetY: view.offset.y,
      });
      if (!isGM) return;
      viewPending.current = view;
      const elapsed = Date.now() - viewLastSent.current;
      if (elapsed >= VIEW_SEND_INTERVAL_MS) sendView();
      else if (!viewTimer.current)
        viewTimer.current = setTimeout(
          sendView,
          VIEW_SEND_INTERVAL_MS - elapsed
        );
    },
    [isGM, sendView, store]
  );

  const flushMapView = useCallback(() => {
    if (viewTimer.current) clearTimeout(viewTimer.current);
    if (!viewPending.current) {
      const v = store.getState().live.view;
      if (v)
        viewPending.current = {
          scale: v.scale,
          offset: { x: v.offsetX, y: v.offsetY },
        };
    }
    sendView();
  }, [sendView, store]);

  useEffect(
    () => () => {
      if (viewTimer.current) clearTimeout(viewTimer.current);
    },
    []
  );

  // --- Jetons -------------------------------------------------------------

  const handleTokenMove = useCallback(
    (id: number, x: number, y: number) => store.moveTokenLocally(id, x, y),
    [store]
  );
  const handleTokenDragStart = useCallback(
    (id: number) => store.setDragging(id),
    [store]
  );
  const handleTokenDragEnd = useCallback(
    async (id: number, x: number, y: number) => {
      store.moveTokenLocally(id, x, y);
      try {
        await TokensAPI.update(id, { x, y });
      } catch (e) {
        fail(e, 'Déplacement refusé');
      } finally {
        store.setDragging(null);
      }
    },
    [store, fail]
  );

  const handleTokenUpdate = useCallback(
    async (id: number, data: TokenUpdate) => {
      store.patchTokenLocally(id, data);
      try {
        await TokensAPI.update(id, data);
      } catch (e) {
        fail(e, 'Modification du jeton impossible');
      }
    },
    [store, fail]
  );

  const handleTokenDelete = useCallback(
    async (id: number) => {
      try {
        await TokensAPI.delete(id);
        setSelectedTokenId((prev) => (prev === id ? null : prev));
      } catch (e) {
        fail(e, 'Suppression impossible');
      }
    },
    [fail]
  );

  const handleTokenCreate = useCallback(
    async (x: number, y: number) => {
      if (!currentMap || !placementData) return;
      const data = placementData;
      setPlacementData(null);
      try {
        await TokensAPI.create(currentMap.id, {
          x,
          y,
          kind: 'PNJ',
          name: data.name,
          hp: data.hp,
          maxHp: data.maxHp,
          mana: data.mana,
          maxMana: data.maxMana,
          iconUrl: data.iconUrl,
          width: data.width,
          height: data.height,
          visibleToPlayers: true,
          elementId: data.elementId,
        });
      } catch (e) {
        setPlacementData(data);
        fail(e, 'Création du jeton impossible');
      }
    },
    [currentMap, placementData, fail]
  );

  const handleTokenDoubleClick = useCallback(
    (t: Token) => {
      if ((t.kind !== 'PNJ' && t.kind !== 'MORT') || t.elementId == null)
        return;
      ElementsAPI.get(gameId, t.elementId)
        .then(({ data }) => {
          const el = (data as { element?: GameElementFull }).element;
          if (!el) return;
          setMonsterView({
            element: el,
            tokenData: {
              hp: t.hp ?? el.maxHp ?? 10,
              maxHp: t.maxHp ?? el.maxHp ?? 10,
              mana: t.mana ?? el.maxMana ?? 0,
              maxMana: t.maxMana ?? el.maxMana ?? 0,
            },
            tokenKind: t.kind,
            tokenId: t.id,
          });
        })
        .catch(() => setMonsterView(null));
    },
    [gameId]
  );

  // --- Chat, dés, réglages -----------------------------------------------

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        await MessagesAPI.create(gameId, { content });
      } catch (e) {
        fail(e, 'Message non envoyé');
      }
    },
    [gameId, fail]
  );

  const handleRoll = useCallback(
    async (expression: string, hidden?: boolean) => {
      setRollError(null);
      try {
        const { data } = await RollsAPI.roll(gameId, { expression, hidden });
        const roll = (
          data as {
            roll?: {
              id: number;
              expression: string;
              result: number;
              details?: string;
            };
          }
        )?.roll;
        if (roll) {
          store.showOwnRoll(
            {
              id: roll.id,
              userId: user?.id ?? 0,
              expression: roll.expression,
              result: roll.result,
              details: roll.details,
              displayName: you?.characterName || user?.displayName || 'Vous',
            },
            !!hidden
          );
        }
      } catch (e) {
        setRollError(getErrorMessage(e, 'Erreur lors du lancer'));
      }
    },
    [gameId, store, user, you?.characterName]
  );

  const updateSettings = useCallback(
    async (patch: {
      tokenMovementLocked?: boolean;
      fogVisionRadius?: number;
    }) => {
      store.patchGameLocally(patch);
      try {
        await GamesAPI.update(gameId, patch);
      } catch (e) {
        fail(e, 'Réglage non enregistré');
      }
    },
    [gameId, store, fail]
  );

  const handleSelectMap = useCallback(
    async (mapId: number) => {
      if (!isGM || !mapId) return;
      try {
        await GamesAPI.setCurrentMap(gameId, mapId);
      } catch (e) {
        fail(e, 'Impossible d’afficher cette carte');
      }
    },
    [gameId, isGM, fail]
  );

  const handleTurnHighlight = useCallback(
    (playerId: number | null) => send({ action: 'turn.highlight', playerId }),
    [send]
  );

  const handleCharacterNameBlur = useCallback(async () => {
    const v = characterNameInput.trim();
    if (v === (you?.characterName ?? '')) return;
    try {
      await GamesAPI.updateMe(gameId, { characterName: v });
    } catch (e) {
      fail(e, 'Nom non enregistré');
    }
  }, [characterNameInput, gameId, you?.characterName, fail]);

  const handleMonsterStatusUpdate = useCallback(
    (tokenId: number, statusEffects: NonNullable<Token['statusEffects']>) =>
      handleTokenUpdate(tokenId, { statusEffects }),
    [handleTokenUpdate]
  );

  // --- Rendu --------------------------------------------------------------

  if (!state.ready || !game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-fantasy-muted-soft">
          {state.failedAttempts < 3
            ? 'Connexion à la partie…'
            : 'Le serveur ne répond pas, nouvelle tentative…'}
        </p>
        <button
          onClick={() => navigate('/games')}
          className="text-sm text-fantasy-muted-soft hover:text-fantasy-text-soft underline"
        >
          Retour aux parties
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex justify-between items-center px-4 py-2 bg-fantasy-surface border-b border-fantasy-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/games')}
            className="text-fantasy-muted-soft hover:text-fantasy-text-soft"
          >
            ← Retour
          </button>
          <h1 className="font-bold font-heading">{game.name}</h1>
          {isGM ? (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-fantasy-accent/90 text-fantasy-bg">
              Maître du Jeu
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs text-fantasy-muted-soft bg-fantasy-input-soft">
              Joueur
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isGM ? (
            <select
              value={currentMap?.id ?? ''}
              onChange={(e) => handleSelectMap(parseInt(e.target.value, 10))}
              className="rounded bg-fantasy-input-soft px-3 py-1 text-sm text-fantasy-text-soft"
            >
              {currentMap &&
                !state.maps.some((m) => m.id === currentMap.id) && (
                  <option value={currentMap.id}>{currentMap.name}</option>
                )}
              {state.maps.length === 0 && !currentMap ? (
                <option value="">Aucune carte</option>
              ) : (
                state.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))
              )}
            </select>
          ) : (
            currentMap && (
              <span className="text-sm text-fantasy-muted-soft">
                {currentMap.name}
              </span>
            )
          )}
          {isGM && (
            <button
              onClick={() => navigate(`/table/${gameId}/resources`)}
              className="px-3 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm font-medium text-fantasy-text-soft"
            >
              Ressources
            </button>
          )}
        </div>
      </header>

      <ConnectionBanner
        status={state.connection}
        failedAttempts={state.failedAttempts}
        onRetry={resync}
      />

      {actionError && (
        <div
          role="alert"
          className="px-4 py-1.5 text-sm text-center bg-red-500/15 text-red-200 border-b border-red-500/30"
        >
          {actionError}
        </div>
      )}

      {isGM && (
        <div className="px-4 py-2 bg-fantasy-accent/10 border-b border-fantasy-accent/20 flex flex-wrap items-center gap-4 text-sm text-fantasy-muted">
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <strong className="text-fantasy-text-soft">Mode MJ :</strong>
            <span>{gmTip}</span>
            <button
              type="button"
              onClick={() => setGmTip((prev) => pickRandomTip(prev))}
              className="shrink-0 p-1 rounded hover:bg-fantasy-accent/20 text-fantasy-accent-hover"
              title="Autre astuce"
            >
              ↻
            </button>
          </span>
          {game.inviteCode && (
            <CopyableCode
              code={game.inviteCode}
              label="Code d'invitation :"
              className="flex items-center gap-2"
            />
          )}
        </div>
      )}

      {game.isGemma && isGM && (
        <div className="px-4 py-2 bg-fantasy-surface border-b border-fantasy-border-soft flex flex-wrap items-center gap-4 text-sm">
          <strong className="text-fantasy-text-soft">GEMMA :</strong>
          <Checkbox
            checked={game.tokenMovementLocked}
            onChange={() =>
              updateSettings({ tokenMovementLocked: !game.tokenMovementLocked })
            }
            aria-label="Bloquer mouvement des jetons"
          >
            <span className="text-fantasy-muted-soft">
              Bloquer mouvement des jetons
            </span>
          </Checkbox>
          <div className="flex items-center gap-2">
            <span className="text-fantasy-muted-soft">Tour de :</span>
            <select
              value={selectedPlayerForTurn ?? ''}
              onChange={(e) =>
                setSelectedPlayerForTurn(
                  e.target.value ? parseInt(e.target.value, 10) : null
                )
              }
              className="rounded bg-fantasy-input-soft px-2 py-1 text-sm text-fantasy-text-soft"
            >
              <option value="">—</option>
              {gamePlayers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.characterName || p.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                handleTurnHighlight(
                  selectedPlayerForTurn ?? gamePlayers[0]?.userId ?? null
                )
              }
              className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft"
            >
              Début du tour
            </button>
            <button
              type="button"
              onClick={() => handleTurnHighlight(null)}
              className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft"
            >
              Fin de surbrillance
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0">
          <MapCanvas
            map={currentMap}
            tokens={tokens}
            gameId={gameId}
            mapElements={mapElements}
            isGM={isGM}
            currentUserId={user?.id ?? 0}
            mapView={mapView}
            tokensMovementLocked={game.tokenMovementLocked}
            highlightedPlayerId={live.turnPlayerId}
            connectedUserIds={state.presence.map((u) => u.userId)}
            connectedUsers={state.presence}
            onMapViewChange={handleMapViewChange}
            hasSharedView={live.view != null}
            onMapPanEnd={isGM ? flushMapView : undefined}
            onTokenMove={handleTokenMove}
            onTokenDragStart={handleTokenDragStart}
            onTokenDragEnd={handleTokenDragEnd}
            onTokenCreate={
              isGM && placementData ? handleTokenCreate : undefined
            }
            onTokenSelect={(t) => setSelectedTokenId(t?.id ?? null)}
            onTokenDoubleClick={handleTokenDoubleClick}
            selectedToken={selectedToken}
            fogVisionRadius={game.fogVisionRadius}
            diceRollOverlay={
              game.isGemma ? (
                <DiceRollOverlay
                  roll={state.lastRoll}
                  durationMs={2500}
                  inline
                />
              ) : undefined
            }
          />
        </div>
        <aside className="w-80 flex flex-col gap-4 p-4 bg-fantasy-surface/50 overflow-y-auto text-fantasy-text-soft">
          <PresenceBar users={state.presence} />
          <DicePanel
            gameId={gameId}
            onRoll={handleRoll}
            rollError={rollError}
            lastRoll={state.lastRoll}
            lastRollHidden={state.lastRollHidden}
            isGemma={game.isGemma}
            isGM={isGM}
          />
          <ChatPanel messages={state.messages} onSend={handleSendMessage} />
          {isGM && (
            <MapSettingsPanel
              fogVisionRadius={game.fogVisionRadius}
              onChangeFogRadius={(fogVisionRadius) =>
                updateSettings({ fogVisionRadius })
              }
            />
          )}
          <TokenPanel
            isGM={isGM}
            currentUserId={user?.id ?? 0}
            elements={elements}
            onStartPlacement={setPlacementData}
            placementActive={placementData != null}
            onCancelPlacement={() => setPlacementData(null)}
            selectedToken={selectedToken}
            onTokenSelect={(t) => setSelectedTokenId(t?.id ?? null)}
            onTokenDoubleClick={handleTokenDoubleClick}
            onTokenUpdate={handleTokenUpdate}
            onTokenDelete={handleTokenDelete}
            tokens={tokens}
          />
          {!isGM && !game.isGemma && (
            <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
              <label className="block text-sm font-medium mb-2 text-fantasy-text-soft">
                Nom de personnage
              </label>
              <input
                type="text"
                value={characterNameInput}
                onChange={(e) => setCharacterNameInput(e.target.value)}
                onBlur={handleCharacterNameBlur}
                onKeyDown={(e) =>
                  e.key === 'Enter' && (e.target as HTMLInputElement).blur()
                }
                placeholder={user?.displayName ?? 'Mon personnage'}
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
              />
            </div>
          )}
          <CharacterSheetPanel
            gameId={gameId}
            isGM={isGM}
            isGemma={game.isGemma}
            players={gamePlayers}
          />
          {isGM ? (
            <MusicPanel
              gameId={gameId}
              music={live.music}
              serverOffsetMs={state.serverOffsetMs}
              send={send}
            />
          ) : (
            <MusicPlayer
              gameId={gameId}
              music={live.music}
              serverOffsetMs={state.serverOffsetMs}
            />
          )}
        </aside>
      </div>

      {monsterView && (
        <MonsterEditorModal
          element={monsterView.element}
          onClose={() => setMonsterView(null)}
          mode="view"
          tokenData={monsterView.tokenData}
          tokenKind={monsterView.tokenKind}
          isGM={isGM}
          tokenId={monsterView.tokenId}
          statusEffects={
            tokens.find((t) => t.id === monsterView.tokenId)?.statusEffects ??
            []
          }
          onStatusUpdate={
            isGM
              ? (se) => handleMonsterStatusUpdate(monsterView.tokenId, se)
              : undefined
          }
        />
      )}
    </div>
  );
}
