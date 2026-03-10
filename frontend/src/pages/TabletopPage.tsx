import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  GamesAPI,
  MapsAPI,
  TokensAPI,
  MapElementsAPI,
  ElementsAPI,
  MessagesAPI,
  RollsAPI,
} from '../api/client';
import {
  MapCanvas,
  type Token,
  type MapData,
  type MapView,
  type MapElement,
} from '../components/MapCanvas';
import { TokenPanel, type TokenFormData } from '../components/TokenPanel';
import { DicePanel } from '../components/DicePanel';
import { ChatPanel } from '../components/ChatPanel';
import { PresenceBar } from '../components/PresenceBar';
import { CharacterSheetPanel } from '../components/CharacterSheetPanel';
import { MusicPanel } from '../components/MusicPanel';
import { MusicPlayer } from '../components/MusicPlayer';
import { useGameSocket } from '../hooks/useGameSocket';

const GM_TIPS = [
  'Utilisez le panneau "Ajouter un ennemi" pour créer des tokens (nom + PV), puis placez-les sur la carte.',
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

export function TabletopPage() {
  const { gameId: gameIdParam } = useParams();
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 0;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [game, setGame] = useState<{
    id: number;
    name: string;
    role: string;
    inviteCode?: string;
    characterName?: string;
    currentMapId?: number;
  } | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [mapElements, setMapElements] = useState<MapElement[]>([]);
  const [elements, setElements] = useState<
    Array<{ id: number; name: string; imageUrl: string; category: string }>
  >([]);
  const [messages, setMessages] = useState<
    Array<{
      id: number;
      userId: number;
      role: string;
      content: string;
      displayName?: string;
    }>
  >([]);
  const [lastRoll, setLastRoll] = useState<{
    expression: string;
    result: number;
    displayName?: string;
  } | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<
    Array<{
      userId: number;
      displayName: string;
      characterName?: string;
      role: string;
    }>
  >([]);
  const [gamePlayers, setGamePlayers] = useState<
    Array<{ userId: number; displayName: string; characterName?: string }>
  >([]);
  const [musicState, setMusicState] = useState<{
    trackId: number | null;
    position: number;
    playing: boolean;
  } | null>(null);
  const [placementData, setPlacementData] = useState<TokenFormData | null>(
    null
  );
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [gmTip, setGmTip] = useState(pickRandomTip);
  const draggingTokenIdRef = useRef<number | null>(null);
  const [mapView, setMapView] = useState<MapView>({
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  const mapViewSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const isGM = game?.role === 'MJ';

  useEffect(() => {
    if (!isGM) return;
    const interval = setInterval(
      () => setGmTip((prev) => pickRandomTip(prev)),
      15000
    );
    return () => clearInterval(interval);
  }, [isGM]);

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await GamesAPI.get(gameId);
      setGame(data.game);
    } catch {
      navigate('/games');
    }
  }, [gameId, navigate]);

  const loadMaps = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await MapsAPI.list(gameId);
      setMaps(data.maps ?? []);
    } catch {
      setMaps([]);
    }
  }, [gameId]);

  const loadTokens = useCallback(async () => {
    if (!currentMap) return;
    try {
      const { data } = await TokensAPI.list(currentMap.id);
      setTokens(data.tokens ?? []);
    } catch {
      setTokens([]);
    }
  }, [currentMap]);

  const loadMapElements = useCallback(async () => {
    if (!currentMap) return;
    try {
      const { data } = await MapElementsAPI.list(currentMap.id);
      setMapElements(data.elements ?? []);
    } catch {
      setMapElements([]);
    }
  }, [currentMap]);

  const loadElements = useCallback(async () => {
    if (!gameId || !isGM) return;
    try {
      const { data } = await ElementsAPI.list(gameId);
      setElements(data.elements ?? []);
    } catch {
      setElements([]);
    }
  }, [gameId, isGM]);

  const loadGamePlayers = useCallback(async () => {
    if (!gameId || !isGM) return;
    try {
      const { data } = await GamesAPI.players(gameId);
      setGamePlayers(data.players ?? []);
    } catch {
      setGamePlayers([]);
    }
  }, [gameId, isGM]);

  const loadMessages = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await MessagesAPI.list(gameId);
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    loadGamePlayers();
  }, [loadGamePlayers]);

  // Définir la carte courante : priorité à currentMapId du jeu, sinon première carte
  useEffect(() => {
    if (!maps.length) {
      setCurrentMap(null);
      return;
    }
    const targetId = game?.currentMapId;
    const target = targetId ? maps.find((m) => m.id === targetId) : maps[0];
    setCurrentMap(target ?? maps[0]);
  }, [maps, game?.currentMapId]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    loadMapElements();
  }, [loadMapElements]);

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    return () => {
      if (mapViewSendTimeoutRef.current) {
        clearTimeout(mapViewSendTimeoutRef.current);
      }
    };
  }, []);

  const { send } = useGameSocket(gameId, {
    'token.created': (p) => {
      const t = p as Token;
      if (t.mapId === currentMap?.id)
        setTokens((prev) => [...prev.filter((x) => x.id !== t.id), t]);
    },
    'token.updated': (p) => {
      const t = p as Token;
      if (t.mapId === currentMap?.id && draggingTokenIdRef.current !== t.id)
        setTokens((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    },
    'token.deleted': (p) => {
      const { id } = p as { id: number };
      setTokens((prev) => prev.filter((x) => x.id !== id));
    },
    'map_element.created': (p) => {
      const el = p as MapElement;
      if (el.mapId === currentMap?.id)
        setMapElements((prev) =>
          prev.some((x) => x.id === el.id) ? prev : [...prev, el]
        );
    },
    'map_element.updated': (p) => {
      const el = p as MapElement;
      if (el.mapId === currentMap?.id)
        setMapElements((prev) => prev.map((x) => (x.id === el.id ? el : x)));
    },
    'map_element.deleted': (p) => {
      const { id } = p as { id: number };
      setMapElements((prev) => prev.filter((x) => x.id !== id));
    },
    'chat.message': (p) => {
      const m = p as {
        id: number;
        userId: number;
        role: string;
        content: string;
        displayName?: string;
      };
      setMessages((prev) => [...prev, m]);
    },
    'dice.rolled': (p) => {
      const r = p as {
        expression: string;
        result: number;
        displayName?: string;
      };
      setLastRoll(r);
    },
    'presence.joined': (p) => {
      const u = p as {
        userId: number;
        displayName: string;
        characterName?: string;
        role: string;
      };
      setConnectedUsers((prev) => {
        if (prev.some((x) => x.userId === u.userId)) return prev;
        return [...prev, u];
      });
    },
    'presence.left': (p) => {
      const { userId } = p as { userId: number };
      setConnectedUsers((prev) => prev.filter((x) => x.userId !== userId));
    },
    'presence.list': (p) => {
      const { users } = p as {
        users: Array<{
          userId: number;
          displayName: string;
          characterName?: string;
          role: string;
        }>;
      };
      const seen = new Map<
        number,
        {
          userId: number;
          displayName: string;
          characterName?: string;
          role: string;
        }
      >();
      (users ?? []).forEach((u) => {
        if (!seen.has(u.userId)) seen.set(u.userId, u);
      });
      setConnectedUsers(Array.from(seen.values()));
    },
    'music.play': (p) => {
      const { trackId, position } = p as { trackId: number; position: number };
      setMusicState({ trackId, position: position ?? 0, playing: true });
    },
    'music.pause': (p) => {
      const { trackId, position } = p as {
        trackId?: number;
        position?: number;
      };
      setMusicState((prev) =>
        prev
          ? {
              trackId: trackId ?? prev.trackId,
              position: position ?? prev.position,
              playing: false,
            }
          : null
      );
    },
    'music.seek': (p) => {
      const { trackId, position } = p as { trackId: number; position: number };
      setMusicState((prev) =>
        prev
          ? { ...prev, trackId, position }
          : { trackId, position, playing: false }
      );
    },
    'map.displayed': (p) => {
      const { mapId } = p as { mapId: number };
      setGame((g) => (g ? { ...g, currentMapId: mapId } : null));
      setMapView({ scale: 1, offset: { x: 0, y: 0 } });
    },
    'map.created': (p) => {
      const m = p as MapData;
      setMaps((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m]
      );
    },
    'map.deleted': (p) => {
      const { mapId } = p as { mapId: number };
      setMaps((prev) => prev.filter((m) => m.id !== mapId));
      setGame((g) =>
        g?.currentMapId === mapId ? { ...g, currentMapId: undefined } : g
      );
    },
    'map.view': (p) => {
      const { scale, offsetX, offsetY } = p as {
        scale: number;
        offsetX: number;
        offsetY: number;
      };
      setMapView({
        scale: scale ?? 1,
        offset: { x: offsetX ?? 0, y: offsetY ?? 0 },
      });
    },
  });

  const handleTokenUpdate = useCallback(
    async (
      id: number,
      data: {
        hp?: number;
        maxHp?: number;
        mana?: number;
        maxMana?: number;
        iconUrl?: string;
        width?: number;
        height?: number;
      }
    ) => {
      try {
        await TokensAPI.update(id, data);
        setTokens((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...data } : t))
        );
      } catch {
        loadTokens();
      }
    },
    [loadTokens]
  );

  const handleTokenDelete = useCallback(
    async (id: number) => {
      try {
        await TokensAPI.delete(id);
        setTokens((prev) => prev.filter((t) => t.id !== id));
        setSelectedToken((prev) => (prev?.id === id ? null : prev));
      } catch {
        loadTokens();
      }
    },
    [loadTokens]
  );

  const handleMapViewChange = useCallback(
    (view: MapView) => {
      setMapView(view);
      if (!isGM) return;
      if (mapViewSendTimeoutRef.current) {
        clearTimeout(mapViewSendTimeoutRef.current);
      }
      mapViewSendTimeoutRef.current = setTimeout(() => {
        mapViewSendTimeoutRef.current = null;
        send('map.view', {
          scale: view.scale,
          offsetX: view.offset.x,
          offsetY: view.offset.y,
        });
      }, 80);
    },
    [isGM, send]
  );

  const handleTokenMove = useCallback((id: number, x: number, y: number) => {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
  }, []);

  const handleTokenDragStart = useCallback((id: number) => {
    draggingTokenIdRef.current = id;
  }, []);

  const handleTokenDragEnd = useCallback(
    async (id: number, x: number, y: number) => {
      draggingTokenIdRef.current = null;
      try {
        await TokensAPI.update(id, { x, y });
      } catch {
        loadTokens();
      }
    },
    [loadTokens]
  );

  const handleTokenCreate = useCallback(
    async (x: number, y: number) => {
      if (!currentMap || !placementData) return;
      const { name, hp, maxHp, mana, maxMana, iconUrl, width, height } =
        placementData;
      try {
        const { data } = await TokensAPI.create(currentMap.id, {
          x,
          y,
          kind: 'PNJ',
          name,
          hp,
          maxHp,
          mana,
          maxMana,
          iconUrl,
          width,
          height,
          visibleToPlayers: true,
        });
        setTokens((prev) => [...prev, data.token]);
        setPlacementData(null);
      } catch {
        loadTokens();
        setPlacementData(null);
      }
    },
    [currentMap, loadTokens, placementData]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        await MessagesAPI.create(gameId, { content });
      } catch {
        loadMessages();
      }
    },
    [gameId, loadMessages]
  );

  const handleRoll = useCallback(
    async (expression: string) => {
      try {
        await RollsAPI.roll(gameId, { expression });
      } catch {
        // ignore
      }
    },
    [gameId]
  );

  const [characterNameInput, setCharacterNameInput] = useState('');
  useEffect(() => {
    if (game?.characterName !== undefined)
      setCharacterNameInput(game.characterName ?? '');
  }, [game?.characterName]);

  const handleCharacterNameBlur = useCallback(async () => {
    const v = characterNameInput.trim();
    setGame((g) => (g ? { ...g, characterName: v } : null));
    try {
      await GamesAPI.updateMe(gameId, { characterName: v });
    } catch {
      loadGame();
    }
  }, [gameId, characterNameInput, loadGame]);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-fantasy-muted-soft">Chargement...</p>
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
          <select
            value={currentMap?.id ?? ''}
            onChange={async (e) => {
              if (!isGM) return;
              const id = parseInt(e.target.value, 10);
              const map = maps.find((m) => m.id === id) ?? null;
              setCurrentMap(map);
              setMapView({ scale: 1, offset: { x: 0, y: 0 } });
              if (map) {
                try {
                  await GamesAPI.setCurrentMap(gameId, map.id);
                  setGame((g) => (g ? { ...g, currentMapId: map.id } : null));
                } catch {
                  loadMaps();
                }
              }
            }}
            disabled={!isGM}
            className="rounded bg-fantasy-input-soft px-3 py-1 text-sm text-fantasy-text-soft disabled:opacity-70"
          >
            {maps.length === 0 ? (
              <option value="">Aucune carte</option>
            ) : (
              maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
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
            <span className="flex items-center gap-2">
              Code d&apos;invitation :{' '}
              <code className="px-2 py-0.5 rounded bg-fantasy-surface font-mono font-bold text-fantasy-accent-hover">
                {game.inviteCode}
              </code>
            </span>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <MapCanvas
            map={currentMap}
            tokens={tokens}
            mapElements={mapElements}
            isGM={isGM}
            currentUserId={user?.id ?? 0}
            mapView={mapView}
            onMapViewChange={isGM ? handleMapViewChange : undefined}
            onTokenMove={handleTokenMove}
            onTokenDragStart={handleTokenDragStart}
            onTokenDragEnd={handleTokenDragEnd}
            onTokenCreate={
              isGM && placementData ? handleTokenCreate : undefined
            }
            onTokenSelect={setSelectedToken}
          />
        </div>
        <aside className="w-80 flex flex-col gap-4 p-4 bg-fantasy-surface/50 overflow-y-auto text-fantasy-text-soft">
          <PresenceBar users={connectedUsers} />
          <TokenPanel
            isGM={isGM}
            currentUserId={user?.id ?? 0}
            elements={elements}
            onStartPlacement={setPlacementData}
            placementActive={placementData != null}
            onCancelPlacement={() => setPlacementData(null)}
            selectedToken={
              selectedToken
                ? (tokens.find((t) => t.id === selectedToken.id) ??
                  selectedToken)
                : null
            }
            onTokenSelect={setSelectedToken}
            onTokenUpdate={handleTokenUpdate}
            onTokenDelete={handleTokenDelete}
            tokens={tokens}
          />
          {!isGM && (
            <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
              <label className="block text-sm font-medium mb-2 text-fantasy-text-soft">
                Nom de personnage
              </label>
              <input
                type="text"
                value={characterNameInput}
                onChange={(e) => setCharacterNameInput(e.target.value)}
                onBlur={handleCharacterNameBlur}
                placeholder={user?.displayName ?? 'Mon personnage'}
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
              />
            </div>
          )}
          <CharacterSheetPanel
            gameId={gameId}
            isGM={isGM}
            players={gamePlayers}
          />
          {isGM ? (
            <MusicPanel gameId={gameId} send={send} showUpload={false} />
          ) : (
            <MusicPlayer gameId={gameId} musicState={musicState} />
          )}
          <DicePanel gameId={gameId} onRoll={handleRoll} lastRoll={lastRoll} />
          <ChatPanel messages={messages} onSend={handleSendMessage} />
        </aside>
      </div>
    </div>
  );
}
