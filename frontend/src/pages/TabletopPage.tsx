import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  ElementsAPI,
  FogAPI,
  HandoutsAPI,
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
import { CharacterSheetPanel } from '../components/CharacterSheetPanel';
import { DiceRollOverlay } from '../components/DiceRollOverlay';
import { TopBar } from '../components/tabletop/TopBar';
import { GmToolbar, type FogTool } from '../components/tabletop/GmToolbar';
import {
  elementForPlayers,
  tokensForPlayers,
} from '../components/tabletop/playerView';
import { SidePanel, type SidePanelTab } from '../components/tabletop/SidePanel';
import { ChatFeed } from '../components/tabletop/ChatFeed';
import { DiceBar } from '../components/tabletop/DiceBar';
import { TokenQuickCard } from '../components/tabletop/TokenQuickCard';
import { MonsterSheetView } from '../components/tabletop/MonsterSheetView';
import { HandoutsTab } from '../components/tabletop/HandoutsTab';
import { HandoutViewer } from '../components/tabletop/HandoutViewer';
import { NotesTab } from '../components/tabletop/NotesTab';
import type { Handout } from '../realtime/protocol';
import { MiniPlayer, MusicTab } from '../components/tabletop/MusicControls';
import { useAmbientMusic } from '../hooks/useAmbientMusic';
import { useGameSession } from '../realtime/useGameSession';
import type { RulerPoint } from '../realtime/protocol';
import type { DrawnRuler } from '../components/tabletop/RulerLayer';
import { colorForUser, displayNameOf } from '../components/tabletop/presence';
import { getErrorMessage } from '../utils/errorMessage';

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
  const [characterNameInput, setCharacterNameInput] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  // Sur téléphone, le panneau couvre la carte : il démarre replié.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 640
  );
  const [activeTab, setActiveTab] = useState('chat');
  const [fitSignal, setFitSignal] = useState(0);
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

  const [playerSheet, setPlayerSheet] = useState<GameElementFull | null>(null);
  // Vue « comme un joueur » : le MJ voit la table telle que ses joueurs la voient.
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const viewAsGM = isGM && !previewAsPlayer;
  const [fogTool, setFogTool] = useState<FogTool>(null);
  const fog = scene?.fog ?? null;

  const handleTokenDoubleClick = useCallback(
    (t: Token) => {
      if ((t.kind !== 'PNJ' && t.kind !== 'MORT') || t.elementId == null)
        return;
      // Les joueurs ne consultent la fiche qu'une fois le monstre vaincu.
      if (!viewAsGM && t.kind !== 'MORT') return;
      ElementsAPI.get(gameId, t.elementId)
        .then(({ data }) => {
          const el = (data as { element?: GameElementFull }).element;
          if (!el) return;
          if (!viewAsGM) {
            // En vue joueur, le MJ reçoit la fiche complète : on la filtre ici.
            setPlayerSheet(isGM ? elementForPlayers(el) : el);
            return;
          }
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
        .catch((e) => {
          setMonsterView(null);
          if (!isGM) fail(e, 'Fiche indisponible');
        });
    },
    [gameId, isGM, viewAsGM, fail]
  );

  // --- Brouillard de guerre ------------------------------------------------

  const currentMapId = scene?.map.id;
  const toggleWarFog = useCallback(() => {
    if (!currentMapId) return;
    FogAPI.setEnabled(currentMapId, !fog?.enabled).catch((e) =>
      fail(e, 'Brouillard non modifié')
    );
  }, [currentMapId, fog?.enabled, fail]);

  const handleFogDraw = useCallback(
    (zone: Parameters<typeof FogAPI.addPatch>[1]) => {
      if (!currentMapId) return;
      FogAPI.addPatch(currentMapId, zone).catch((e) =>
        fail(e, 'Zone non enregistrée')
      );
    },
    [currentMapId, fail]
  );

  const handleFogUndo = useCallback(() => {
    if (!currentMapId) return;
    FogAPI.undo(currentMapId).catch((e) => fail(e, 'Annulation impossible'));
  }, [currentMapId, fail]);

  const handleFogReset = useCallback(
    (revealAll: boolean) => {
      if (!currentMapId) return;
      FogAPI.reset(currentMapId, revealAll).catch((e) =>
        fail(e, 'Brouillard non modifié')
      );
    },
    [currentMapId, fail]
  );

  // Changer de carte range l'outil de dessin.
  useEffect(() => setFogTool(null), [currentMapId]);

  // --- Documents -------------------------------------------------------------

  const handleCreateHandout = useCallback(
    async (title: string, body: string, file?: File) => {
      try {
        const { data } = await HandoutsAPI.create(gameId, title, body, file);
        store.upsertHandoutLocally((data as { handout: Handout }).handout);
        return true;
      } catch (e) {
        fail(e, 'Document non ajouté');
        return false;
      }
    },
    [gameId, store, fail]
  );

  // --- Règle de mesure (tout le monde) --------------------------------------

  const [rulerActive, setRulerActive] = useState(false);
  const rulerSentAt = useRef(0);
  const rulerPending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRulerChange = useCallback(
    (line: { from: RulerPoint; to: RulerPoint } | null) => {
      if (!currentMapId) return;
      const sendNow = () => {
        rulerSentAt.current = Date.now();
        send(
          line
            ? { action: 'ruler', mapId: currentMapId, ...line }
            : { action: 'ruler', mapId: currentMapId }
        );
      };
      if (rulerPending.current) clearTimeout(rulerPending.current);
      rulerPending.current = null;
      // Au plus ~20 envois par seconde ; la fin du geste part toujours.
      const wait = 50 - (Date.now() - rulerSentAt.current);
      if (!line || wait <= 0) sendNow();
      else rulerPending.current = setTimeout(sendNow, wait);
    },
    [currentMapId, send]
  );
  useEffect(() => setRulerActive(false), [currentMapId]);
  useEffect(() => {
    if (!rulerActive) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && setRulerActive(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rulerActive]);

  const remoteRulers: DrawnRuler[] = useMemo(
    () =>
      state.rulers.flatMap((r) => {
        if (!r.from || !r.to) return [];
        const who =
          state.players.find((p) => p.userId === r.userId) ??
          state.presence.find((p) => p.userId === r.userId);
        const isMJ = who?.role === 'MJ';
        return [
          {
            key: `u${r.userId}`,
            from: r.from,
            to: r.to,
            color: isMJ
              ? 'rgb(var(--c-accent))'
              : colorForUser(r.userId, state.players).bg,
            label: who ? (isMJ ? 'MJ' : displayNameOf(who)) : undefined,
          },
        ];
      }),
    [state.rulers, state.players, state.presence]
  );
  const myRulerColor =
    you && you.role !== 'MJ'
      ? colorForUser(you.userId, state.players).bg
      : 'rgb(var(--c-accent))';

  // Échap quitte la vue joueur.
  useEffect(() => {
    if (!previewAsPlayer) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && setPreviewAsPlayer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewAsPlayer]);

  const handlePlayerFieldsChange = useCallback(
    (elementId: number, playerFields: string[]) => {
      ElementsAPI.update(gameId, elementId, { playerFields }).catch((e) =>
        fail(e, 'Réglage non enregistré')
      );
    },
    [gameId, fail]
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

  // --- Musique, chat non lu, onglets ------------------------------------

  const music = useAmbientMusic({
    gameId,
    music: live.music,
    serverOffsetMs: state.serverOffsetMs,
    isGM,
    send,
  });

  const feedCount = state.messages.length + state.rolls.length;
  const [seenCount, setSeenCount] = useState(0);
  const chatVisible = panelOpen && activeTab === 'chat';
  useEffect(() => {
    if (chatVisible || !state.ready) setSeenCount(feedCount);
  }, [chatVisible, feedCount, state.ready]);
  const unread = Math.max(0, feedCount - seenCount);

  // Pour le MJ, le dernier jet affiché peut être un jet caché.
  const latestRoll =
    isGM &&
    state.lastRollHidden &&
    (state.lastRoll?.key ?? 0) < state.lastRollHidden.key
      ? state.lastRollHidden
      : state.lastRoll;

  const openResources = useCallback(
    () => navigate(`/table/${gameId}/resources`),
    [navigate, gameId]
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

  const chatTab: SidePanelTab = {
    id: 'chat',
    label: 'Chat',
    badge: unread,
    fullHeight: true,
    content: (
      <ChatFeed
        messages={state.messages}
        rolls={state.rolls}
        players={state.players}
        onSend={handleSendMessage}
      />
    ),
  };
  const musicTab: SidePanelTab = {
    id: 'music',
    label: 'Musique',
    content: (
      <MusicTab m={music} onOpenResources={isGM ? openResources : undefined} />
    ),
  };
  const handoutsTab: SidePanelTab = {
    id: 'docs',
    label: 'Docs',
    content: (
      <HandoutsTab
        isGM={isGM}
        handouts={state.handouts}
        onOpen={(id) => store.setOpenHandout(id)}
        onCreate={isGM ? handleCreateHandout : undefined}
        onShow={(id) =>
          HandoutsAPI.show(gameId, id).catch((e) =>
            fail(e, 'Document non montré')
          )
        }
        onHide={(id) =>
          HandoutsAPI.update(gameId, id, { shown: false })
            .then(({ data }) =>
              store.upsertHandoutLocally((data as { handout: Handout }).handout)
            )
            .catch((e) => fail(e, 'Document non caché'))
        }
        onDelete={(id) =>
          HandoutsAPI.delete(gameId, id)
            .then(() => store.removeHandoutLocally(id))
            .catch((e) => fail(e, 'Suppression impossible'))
        }
      />
    ),
  };
  const tabs: SidePanelTab[] = isGM
    ? [
        chatTab,
        {
          id: 'tokens',
          label: 'Jetons',
          content: (
            <TokenPanel
              embedded
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
          ),
        },
        {
          id: 'sheets',
          label: 'Fiches',
          content: (
            <CharacterSheetPanel
              embedded
              gameId={gameId}
              isGM={isGM}
              isGemma={game.isGemma}
              players={gamePlayers}
            />
          ),
        },
        musicTab,
        handoutsTab,
        {
          id: 'notes',
          label: 'Notes',
          content: (
            <NotesTab
              gameId={gameId}
              mapId={currentMap?.id}
              mapName={currentMap?.name}
            />
          ),
        },
      ]
    : [
        chatTab,
        {
          id: 'sheet',
          label: 'Ma fiche',
          content: (
            <div className="flex flex-col gap-4">
              {!game.isGemma && (
                <label className="flex flex-col gap-1.5 text-sm text-fantasy-text-soft">
                  Nom de personnage
                  <input
                    type="text"
                    value={characterNameInput}
                    onChange={(e) => setCharacterNameInput(e.target.value)}
                    onBlur={handleCharacterNameBlur}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && (e.target as HTMLInputElement).blur()
                    }
                    placeholder={user?.displayName ?? 'Mon personnage'}
                    className="h-11 px-3 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent"
                  />
                </label>
              )}
              <CharacterSheetPanel
                embedded
                gameId={gameId}
                isGM={false}
                isGemma={game.isGemma}
                players={gamePlayers}
              />
            </div>
          ),
        },
        musicTab,
        handoutsTab,
      ];

  const openHandout =
    state.openHandoutId != null
      ? state.handouts.find((h) => h.id === state.openHandoutId)
      : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden bg-fantasy-bg text-fantasy-text">
      <div className="absolute inset-0 flex">
        <MapCanvas
          map={currentMap}
          tokens={previewAsPlayer ? tokensForPlayers(tokens) : tokens}
          gameId={gameId}
          mapElements={mapElements}
          isGM={viewAsGM}
          fog={fog}
          fogTool={viewAsGM ? fogTool : null}
          onFogDraw={handleFogDraw}
          rulerActive={rulerActive}
          remoteRulers={remoteRulers}
          rulerColor={myRulerColor}
          onRulerChange={handleRulerChange}
          onTokenFace={
            previewAsPlayer
              ? undefined
              : (id, facing) => handleTokenUpdate(id, { facing })
          }
          currentUserId={user?.id ?? 0}
          mapView={mapView}
          tokensMovementLocked={game.tokenMovementLocked}
          highlightedPlayerId={live.turnPlayerId}
          connectedUserIds={state.presence.map((u) => u.userId)}
          connectedUsers={state.presence}
          onMapViewChange={
            previewAsPlayer
              ? (v) =>
                  store.setLocalView({
                    scale: v.scale,
                    offsetX: v.offset.x,
                    offsetY: v.offset.y,
                  })
              : handleMapViewChange
          }
          hasSharedView={live.view != null}
          fitSignal={fitSignal}
          onMapPanEnd={viewAsGM ? flushMapView : undefined}
          onTokenMove={handleTokenMove}
          onTokenDragStart={handleTokenDragStart}
          onTokenDragEnd={handleTokenDragEnd}
          onTokenCreate={
            viewAsGM && placementData ? handleTokenCreate : undefined
          }
          onTokenSelect={(t) => setSelectedTokenId(t?.id ?? null)}
          onTokenDoubleClick={handleTokenDoubleClick}
          selectedToken={selectedToken}
          fogVisionRadius={game.fogVisionRadius}
          renderTokenPopup={(t, name, close) => (
            <TokenQuickCard
              token={t}
              displayName={name}
              isGM={viewAsGM}
              canEdit={
                viewAsGM || (t.kind === 'PJ' && t.ownerUserId === user?.id)
              }
              onUpdate={handleTokenUpdate}
              onDelete={handleTokenDelete}
              onOpenSheet={handleTokenDoubleClick}
              onClose={close}
              manaLabel={game.isGemma ? 'Aether' : 'Mana'}
            />
          )}
          diceRollOverlay={
            game.isGemma ? (
              <DiceRollOverlay roll={state.lastRoll} durationMs={2500} inline />
            ) : undefined
          }
        />
      </div>

      <TopBar
        game={game}
        isGM={isGM}
        you={you}
        maps={state.maps}
        currentMap={currentMap}
        players={state.players}
        presence={state.presence}
        connection={state.connection}
        failedAttempts={state.failedAttempts}
        turnPlayerId={live.turnPlayerId}
        onBack={() => navigate('/games')}
        onSelectMap={handleSelectMap}
        onOpenResources={openResources}
        onRetry={resync}
        rulerActive={rulerActive}
        onToggleRuler={currentMap ? () => setRulerActive((v) => !v) : undefined}
      />

      {actionError && (
        <div
          role="alert"
          className="glass absolute top-20 left-1/2 -translate-x-1/2 z-40 rounded-xl px-4 py-2 text-sm text-red-300"
        >
          {actionError}
        </div>
      )}

      {placementData && (
        <div className="glass absolute top-20 left-1/2 -translate-x-1/2 z-30 rounded-xl pl-4 pr-1.5 py-1.5 flex items-center gap-3 text-sm">
          Cliquez sur la carte pour placer <strong>{placementData.name}</strong>
          <button
            type="button"
            onClick={() => setPlacementData(null)}
            className="h-8 px-3 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover"
          >
            Annuler
          </button>
        </div>
      )}

      {previewAsPlayer && (
        <div className="glass absolute top-20 left-1/2 -translate-x-1/2 z-40 rounded-xl pl-4 pr-1.5 py-1.5 flex items-center gap-3 text-sm">
          <span>
            <strong>Vue joueur</strong> : vous voyez la table comme vos joueurs.
          </span>
          <button
            type="button"
            onClick={() => setPreviewAsPlayer(false)}
            className="h-8 px-3 rounded-lg bg-fantasy-accent text-fantasy-bg font-semibold"
          >
            Revenir en MJ
          </button>
        </div>
      )}

      {viewAsGM && (
        <GmToolbar
          placementActive={placementData != null}
          enemyPanelOpen={panelOpen && activeTab === 'tokens'}
          onSelectTool={() => {
            setPlacementData(null);
            if (activeTab === 'tokens') setActiveTab('chat');
          }}
          onAddEnemy={() => {
            setPanelOpen(true);
            setActiveTab('tokens');
          }}
          fogVisionRadius={game.fogVisionRadius}
          onChangeFog={(fogVisionRadius) => updateSettings({ fogVisionRadius })}
          tokensLocked={game.tokenMovementLocked}
          onToggleLock={() =>
            updateSettings({ tokenMovementLocked: !game.tokenMovementLocked })
          }
          players={state.players}
          turnPlayerId={live.turnPlayerId}
          onTurn={handleTurnHighlight}
          onRecenter={() => setFitSignal((n) => n + 1)}
          hasMap={currentMap != null}
          warFogEnabled={!!fog?.enabled}
          onToggleWarFog={toggleWarFog}
          fogTool={fogTool}
          onFogTool={setFogTool}
          canUndoFog={(fog?.patches.length ?? 0) > 0}
          onFogUndo={handleFogUndo}
          onFogReset={handleFogReset}
          onPreviewAsPlayer={() => {
            setPlacementData(null);
            setFogTool(null);
            setSelectedTokenId(null);
            setPreviewAsPlayer(true);
          }}
        />
      )}

      <SidePanel
        tabs={tabs}
        active={activeTab}
        onChange={setActiveTab}
        open={panelOpen}
        onToggle={setPanelOpen}
      />

      <DiceBar
        isGM={isGM}
        onRoll={handleRoll}
        error={rollError}
        lastRoll={latestRoll}
        panelOpen={panelOpen}
      />

      <div
        className="absolute left-4 z-20"
        style={{ bottom: isGM && currentMap ? 72 : 16 }}
      >
        <MiniPlayer m={music} />
      </div>
      <audio ref={music.audioRef} className="hidden" preload="auto" />

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
          onPlayerFieldsChange={
            isGM
              ? (fields) =>
                  handlePlayerFieldsChange(monsterView.element.id, fields)
              : undefined
          }
        />
      )}
      {openHandout && (
        <HandoutViewer
          handout={openHandout}
          onClose={() => store.setOpenHandout(null)}
        />
      )}
      {playerSheet && (
        <MonsterSheetView
          element={playerSheet}
          onClose={() => setPlayerSheet(null)}
        />
      )}
    </div>
  );
}
