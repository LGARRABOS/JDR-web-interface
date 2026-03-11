import { useCallback, useEffect, useRef, useState } from 'react';
import { TokensAPI, MapElementsAPI, MapsAPI } from '../api/client';
import { Modal, ModalButtons } from './Modal';
import type { MapData } from './MapCanvas';
import type { Token } from './MapCanvas';

interface GameElement {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  category: string;
  tags?: string[];
  createdAt: string;
}

interface MapElement {
  id: number;
  mapId: number;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: string;
}

interface MapEditorProps {
  gameId: number;
  maps: MapData[];
  elements: GameElement[];
  onMapsChange: () => void;
  onElementsChange: () => void;
}

export function MapEditor({
  gameId: _gameId,
  maps,
  elements,
  onMapsChange,
  onElementsChange: _onElementsChange,
}: MapEditorProps) {
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [mapElements, setMapElements] = useState<MapElement[]>([]);
  const [placementElement, setPlacementElement] = useState<GameElement | null>(
    null
  );
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [selectedMapElement, setSelectedMapElement] =
    useState<MapElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [decorSearch, setDecorSearch] = useState('');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [displaySize, setDisplaySize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [saveMessage, setSaveMessage] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [saveTagInput, setSaveTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    type: 'token' | 'mapElement';
    id: number;
    startXMap: number;
    startYMap: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
  } | null>(null);
  const resizeRef = useRef<{
    type: 'token' | 'mapElement';
    id: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    lastW: number;
    lastH: number;
    corner: string;
  } | null>(null);

  const loadTokens = useCallback(async () => {
    if (!selectedMap) return;
    try {
      const { data } = await TokensAPI.list(selectedMap.id);
      setTokens(data.tokens ?? []);
    } catch {
      setTokens([]);
    }
  }, [selectedMap]);

  const loadMapElements = useCallback(async () => {
    if (!selectedMap) return;
    try {
      const { data } = await MapElementsAPI.list(selectedMap.id);
      setMapElements(data.elements ?? []);
    } catch {
      setMapElements([]);
    }
  }, [selectedMap]);

  useEffect(() => {
    if (selectedMap) {
      loadTokens();
      loadMapElements();
    } else {
      setTokens([]);
      setMapElements([]);
    }
  }, [selectedMap, loadTokens, loadMapElements]);

  useEffect(() => {
    if (selectedMap) {
      const updated = maps.find((m) => m.id === selectedMap.id);
      if (updated && updated !== selectedMap) {
        setSelectedMap(updated);
      }
    }
  }, [maps, selectedMap]);

  // Précharger l'image pour récupérer les dimensions réelles (plus fiable que onLoad)
  useEffect(() => {
    if (!selectedMap?.imageUrl) {
      setDisplaySize(null);
      return;
    }
    setDisplaySize(null);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDisplaySize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = selectedMap.imageUrl;
    return () => {
      img.src = '';
    };
  }, [selectedMap?.id, selectedMap?.imageUrl]);

  const displayW = displaySize?.w ?? selectedMap?.width ?? 800;
  const displayH = displaySize?.h ?? selectedMap?.height ?? 600;

  const updateScaleToFit = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!selectedMap) return;
    updateScaleToFit();
    const ro = new ResizeObserver(updateScaleToFit);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [selectedMap, updateScaleToFit]);

  const handleMapSelect = (map: MapData) => {
    setSelectedMap(map);
    setDisplaySize(null);
    setSelectedToken(null);
    setSelectedMapElement(null);
    setPlacementElement(null);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!selectedMap || !mapContainerRef.current) return;
    if ((e.target as HTMLElement).closest('[data-token]')) return;
    if ((e.target as HTMLElement).closest('[data-map-element]')) return;
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;

    const mapRect = mapContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - mapRect.left) * selectedMap.width) / mapRect.width;
    const y = ((e.clientY - mapRect.top) * selectedMap.height) / mapRect.height;
    if (x < 0 || y < 0 || x > selectedMap.width || y > selectedMap.height)
      return;

    if (placementElement) {
      if (placementElement.category === 'monster') {
        TokensAPI.create(selectedMap.id, {
          kind: 'PNJ',
          name: placementElement.name,
          iconUrl: placementElement.imageUrl,
          x,
          y,
          width: 50,
          height: 50,
          hp: 10,
          maxHp: 10,
          mana: 0,
          maxMana: 0,
          visibleToPlayers: true,
        }).then(({ data }) => {
          setTokens((prev) => [...prev, data.token]);
          setPlacementElement(null);
        });
      } else {
        MapElementsAPI.create(selectedMap.id, {
          imageUrl: placementElement.imageUrl,
          x,
          y,
          width: 50,
          height: 50,
        }).then(({ data }) => {
          setMapElements((prev) => [...prev, data.element]);
          setPlacementElement(null);
        });
      }
    } else {
      setSelectedToken(null);
      setSelectedMapElement(null);
    }
  };

  const handleTokenClick = (e: React.MouseEvent, token: Token) => {
    e.stopPropagation();
    setSelectedToken(token);
    setSelectedMapElement(null);
  };

  const handleMapElementClick = (e: React.MouseEvent, el: MapElement) => {
    e.stopPropagation();
    setSelectedMapElement(el);
    setSelectedToken(null);
  };

  const handleDeleteSelected = () => {
    if (selectedToken) {
      TokensAPI.delete(selectedToken.id).then(() => {
        setTokens((prev) => prev.filter((t) => t.id !== selectedToken.id));
        setSelectedToken(null);
      });
    } else if (selectedMapElement) {
      MapElementsAPI.delete(selectedMapElement.id).then(() => {
        setMapElements((prev) =>
          prev.filter((el) => el.id !== selectedMapElement.id)
        );
        setSelectedMapElement(null);
      });
    }
  };

  const handleMapMouseDown = (e: React.MouseEvent) => {
    if (!selectedMap || (e.target as HTMLElement).closest('[data-token]'))
      return;
    if ((e.target as HTMLElement).closest('[data-map-element]')) return;
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    if (e.button === 0) {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffset: { ...offset },
      };
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragRef.current && selectedMap && mapContainerRef.current) {
        const { type, id, startXMap, startYMap } = dragRef.current;
        const mapRect = mapContainerRef.current.getBoundingClientRect();
        const x =
          ((e.clientX - mapRect.left) * selectedMap.width) / mapRect.width;
        const y =
          ((e.clientY - mapRect.top) * selectedMap.height) / mapRect.height;
        const dx = x - startXMap;
        const dy = y - startYMap;
        const newX = Math.max(0, Math.min(selectedMap.width, startXMap + dx));
        const newY = Math.max(0, Math.min(selectedMap.height, startYMap + dy));
        dragRef.current.lastX = newX;
        dragRef.current.lastY = newY;
        if (type === 'token') {
          setTokens((prev) =>
            prev.map((t) => (t.id === id ? { ...t, x: newX, y: newY } : t))
          );
        } else {
          setMapElements((prev) =>
            prev.map((el) => (el.id === id ? { ...el, x: newX, y: newY } : el))
          );
        }
      } else if (resizeRef.current) {
        const { type, id, startX, startY, startW, startH, corner } =
          resizeRef.current;
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        let dw = 0,
          dh = 0;
        if (corner.includes('e')) dw += dx;
        if (corner.includes('w')) dw -= dx;
        if (corner.includes('s')) dh += dy;
        if (corner.includes('n')) dh -= dy;
        const newW = Math.max(20, startW + dw);
        const newH = Math.max(20, startH + dh);
        resizeRef.current.lastW = newW;
        resizeRef.current.lastH = newH;
        if (type === 'token') {
          setTokens((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, width: newW, height: newH } : t
            )
          );
        } else {
          setMapElements((prev) =>
            prev.map((el) =>
              el.id === id ? { ...el, width: newW, height: newH } : el
            )
          );
        }
      } else if (panRef.current) {
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        setOffset({
          x: panRef.current.startOffset.x + dx,
          y: panRef.current.startOffset.y + dy,
        });
      }
    },
    [scale, selectedMap]
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const { type, id, lastX, lastY } = dragRef.current;
      if (type === 'token') {
        TokensAPI.update(id, { x: lastX, y: lastY });
      } else {
        MapElementsAPI.update(id, { x: lastX, y: lastY });
      }
      dragRef.current = null;
    }
    if (resizeRef.current) {
      const { type, id, lastW, lastH } = resizeRef.current;
      if (type === 'token') {
        TokensAPI.update(id, { width: lastW, height: lastH });
      } else {
        MapElementsAPI.update(id, { width: lastW, height: lastH });
      }
      resizeRef.current = null;
    }
    panRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const getTokenSize = (t: Token) => ({
    w: t.width ?? 56,
    h: t.height ?? 56,
  });

  const filterBySearch = (el: GameElement, q: string) => {
    const qq = q.trim().toLowerCase();
    if (!qq) return true;
    const matchName = el.name.toLowerCase().includes(qq);
    const matchTags = (el.tags ?? []).some((t) => t.toLowerCase().includes(qq));
    return matchName || matchTags;
  };

  const decorElements = elements.filter(
    (el) => el.category === 'decor' && filterBySearch(el, decorSearch)
  );
  const monsterElements = elements.filter(
    (el) => el.category === 'monster' && filterBySearch(el, monsterSearch)
  );

  const openSaveModal = () => {
    if (selectedMap) {
      setSaveName(selectedMap.name);
      setSaveTags(selectedMap.tags ?? []);
      setSaveTagInput('');
      setSaveModalOpen(true);
    }
  };

  const addSaveTag = (t: string) => {
    const trimmed = t.trim().toLowerCase();
    if (trimmed && !saveTags.includes(trimmed)) {
      setSaveTags((prev) => [...prev, trimmed]);
      setSaveTagInput('');
    }
  };

  const removeSaveTag = (t: string) => {
    setSaveTags((prev) => prev.filter((x) => x !== t));
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveSubmit = async () => {
    if (!selectedMap) return;
    setSaving(true);
    setSaveError(null);
    try {
      await MapsAPI.update(selectedMap.id, {
        name: saveName.trim() || selectedMap.name,
        tags: saveTags,
      });
      onMapsChange();
      loadTokens();
      loadMapElements();
      setSaveModalOpen(false);
      setSaveMessage(true);
      setTimeout(() => setSaveMessage(false), 2000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Erreur lors de l'enregistrement";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (maps.length === 0) {
    return (
      <section className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-6">
        <p className="text-fantasy-muted-soft">
          Aucune carte. Uploadez d&apos;abord des cartes dans l&apos;onglet
          Ressources.
        </p>
      </section>
    );
  }

  return (
    <section className="h-full flex flex-col rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-6">
      <h2 className="text-xl font-semibold mb-4 shrink-0">
        Modifier les cartes
      </h2>
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Gauche : Décor */}
        <div className="w-48 shrink-0 space-y-3">
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-2">
              Décor
            </label>
            <input
              type="text"
              value={decorSearch}
              onChange={(e) => setDecorSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full rounded bg-fantasy-input-soft px-2 py-1.5 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft mb-2"
            />
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {decorElements.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() =>
                    setPlacementElement(
                      placementElement?.id === el.id ? null : el
                    )
                  }
                  className={`flex items-center gap-2 p-2 rounded text-left text-sm ${
                    placementElement?.id === el.id
                      ? 'bg-fantasy-accent/50 border border-fantasy-accent'
                      : 'bg-fantasy-input-soft/50 hover:bg-fantasy-input-hover-soft border border-transparent'
                  }`}
                >
                  <img
                    src={el.imageUrl}
                    alt={el.name}
                    className="w-8 h-8 object-contain rounded shrink-0"
                  />
                  <span className="truncate flex-1 text-xs">{el.name}</span>
                </button>
              ))}
            </div>
            {decorElements.length === 0 && (
              <p className="text-fantasy-muted-soft text-xs">
                {elements.some((e) => e.category === 'decor')
                  ? 'Aucun résultat'
                  : 'Aucun décor'}
              </p>
            )}
          </div>
        </div>

        {/* Centre : Carte */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
            <select
              value={selectedMap?.id ?? ''}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10);
                const map = maps.find((m) => m.id === id);
                handleMapSelect(map ?? null);
              }}
              className="rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
            >
              <option value="">Carte à éditer...</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              {saveMessage && (
                <span className="text-sm text-fantasy-accent-hover">
                  Carte enregistrée
                </span>
              )}
              <button
                type="button"
                onClick={openSaveModal}
                className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium"
              >
                Enregistrer
              </button>
            </div>
          </div>
          <div
            ref={viewportRef}
            className="flex-1 min-h-0 rounded-lg overflow-hidden bg-fantasy-bg relative"
          >
            {!selectedMap ? (
              <div className="absolute inset-0 flex items-center justify-center text-fantasy-muted-soft">
                Sélectionnez une carte
              </div>
            ) : (
              <>
                <div className="absolute bottom-2 right-2 z-10 flex gap-1">
                  <button
                    type="button"
                    onClick={() => updateScaleToFit()}
                    className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft-hover text-sm"
                    title="Ajuster à la fenêtre"
                  >
                    ⊡
                  </button>
                  <button
                    type="button"
                    onClick={() => setScale((s) => Math.min(2, s * 1.2))}
                    className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft-hover text-sm"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setScale((s) => Math.max(0.25, s / 1.2))}
                    className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft-hover text-sm"
                  >
                    −
                  </button>
                </div>
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                  <div
                    className="flex items-center justify-center overflow-hidden shrink-0"
                    style={{
                      aspectRatio: `${displayW} / ${displayH}`,
                      width: '100%',
                      height: '100%',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
                    }}
                  >
                    <div
                      ref={mapContainerRef}
                      className="relative cursor-crosshair w-full h-full"
                      style={{ aspectRatio: `${displayW} / ${displayH}` }}
                      onMouseDown={handleMapMouseDown}
                      onClick={handleCanvasClick}
                    >
                      <img
                        src={selectedMap.imageUrl}
                        alt={selectedMap.name}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                      {mapElements.map((el) => (
                        <div
                          key={el.id}
                          data-map-element
                          className="absolute cursor-move"
                          style={{
                            left: `${(el.x / selectedMap.width) * 100}%`,
                            top: `${(el.y / selectedMap.height) * 100}%`,
                            width: el.width,
                            height: el.height,
                            transform: 'translate(-50%, -50%)',
                            border:
                              selectedMapElement?.id === el.id
                                ? '2px solid #f59e0b'
                                : 'none',
                          }}
                          onClick={(e) => handleMapElementClick(e, el)}
                          onMouseDown={(e) => {
                            if (
                              e.button === 0 &&
                              mapContainerRef.current &&
                              selectedMap
                            ) {
                              e.stopPropagation();
                              dragRef.current = {
                                type: 'mapElement',
                                id: el.id,
                                startXMap: el.x,
                                startYMap: el.y,
                                lastX: el.x,
                                lastY: el.y,
                              };
                            }
                          }}
                        >
                          <img
                            src={el.imageUrl}
                            alt=""
                            className="w-full h-full object-contain pointer-events-none"
                          />
                          {selectedMapElement?.id === el.id && (
                            <>
                              <div
                                data-resize-handle
                                className="absolute -bottom-1 -right-1 w-5 h-5 bg-fantasy-accent-hover cursor-se-resize rounded-sm z-10"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  resizeRef.current = {
                                    type: 'mapElement',
                                    id: el.id,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startW: el.width,
                                    startH: el.height,
                                    lastW: el.width,
                                    lastH: el.height,
                                    corner: 'se',
                                  };
                                }}
                              />
                            </>
                          )}
                        </div>
                      ))}
                      {tokens.map((t) => {
                        const { w, h } = getTokenSize(t);
                        return (
                          <div
                            key={t.id}
                            data-token
                            className="absolute cursor-pointer flex flex-col items-center relative"
                            style={{
                              left: `${(t.x / selectedMap.width) * 100}%`,
                              top: `${(t.y / selectedMap.height) * 100}%`,
                              transform: 'translate(-50%, -50%)',
                              border:
                                selectedToken?.id === t.id
                                  ? '2px solid #f59e0b'
                                  : 'none',
                            }}
                            onClick={(e) => handleTokenClick(e, t)}
                            onMouseDown={(e) => {
                              if (
                                e.button === 0 &&
                                mapContainerRef.current &&
                                selectedMap
                              ) {
                                e.stopPropagation();
                                dragRef.current = {
                                  type: 'token',
                                  id: t.id,
                                  startXMap: t.x,
                                  startYMap: t.y,
                                  lastX: t.x,
                                  lastY: t.y,
                                };
                              }
                            }}
                          >
                            {(t.maxHp != null || t.maxMana != null) && (
                              <div className="flex gap-1 text-[9px] text-white drop-shadow mb-0.5">
                                {t.maxHp != null &&
                                  `PV ${t.hp ?? t.maxHp}/${t.maxHp}`}
                                {t.maxMana != null &&
                                  ` Mana ${t.mana ?? t.maxMana}/${t.maxMana}`}
                              </div>
                            )}
                            {t.iconUrl ? (
                              <img
                                src={t.iconUrl}
                                alt={t.name}
                                className="object-contain"
                                style={{ width: w, height: h }}
                              />
                            ) : (
                              <div
                                className="rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{
                                  width: w,
                                  height: h,
                                  backgroundColor: t.color,
                                }}
                              >
                                {t.name.slice(0, 2)}
                              </div>
                            )}
                            {selectedToken?.id === t.id && (
                              <div
                                data-resize-handle
                                className="absolute -bottom-1 -right-1 w-5 h-5 bg-fantasy-accent-hover cursor-se-resize rounded-sm z-10"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  const { w: cw, h: ch } = getTokenSize(t);
                                  resizeRef.current = {
                                    type: 'token',
                                    id: t.id,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startW: cw,
                                    startH: ch,
                                    lastW: cw,
                                    lastH: ch,
                                    corner: 'se',
                                  };
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Droite : Monstres */}
        <div className="w-48 shrink-0 space-y-3">
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-2">
              Monstres
            </label>
            <input
              type="text"
              value={monsterSearch}
              onChange={(e) => setMonsterSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full rounded bg-fantasy-input-soft px-2 py-1.5 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft mb-2"
            />
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {monsterElements.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() =>
                    setPlacementElement(
                      placementElement?.id === el.id ? null : el
                    )
                  }
                  className={`flex items-center gap-2 p-2 rounded text-left text-sm ${
                    placementElement?.id === el.id
                      ? 'bg-fantasy-accent/50 border border-fantasy-accent'
                      : 'bg-fantasy-input-soft/50 hover:bg-fantasy-input-hover-soft border border-transparent'
                  }`}
                >
                  <img
                    src={el.imageUrl}
                    alt={el.name}
                    className="w-8 h-8 object-contain rounded shrink-0"
                  />
                  <span className="truncate flex-1 text-xs">{el.name}</span>
                </button>
              ))}
            </div>
            {monsterElements.length === 0 && (
              <p className="text-fantasy-muted-soft text-xs">
                {elements.some((e) => e.category === 'monster')
                  ? 'Aucun résultat'
                  : 'Aucun monstre'}
              </p>
            )}
          </div>
          {selectedToken && (
            <div className="space-y-2 p-2 rounded bg-fantasy-input-soft/50">
              <div className="text-sm font-medium text-fantasy-text">
                {selectedToken.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-fantasy-muted-soft mb-0.5">
                    PV
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedToken.hp ?? selectedToken.maxHp ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) {
                        setTokens((prev) =>
                          prev.map((t) =>
                            t.id === selectedToken.id ? { ...t, hp: v } : t
                          )
                        );
                        TokensAPI.update(selectedToken.id, { hp: v });
                      }
                    }}
                    className="w-full rounded bg-fantasy-input-soft px-2 py-1 text-fantasy-text-soft"
                  />
                </div>
                <div>
                  <label className="block text-fantasy-muted-soft mb-0.5">
                    PV max
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedToken.maxHp ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 0) {
                        setTokens((prev) =>
                          prev.map((t) =>
                            t.id === selectedToken.id ? { ...t, maxHp: v } : t
                          )
                        );
                        TokensAPI.update(selectedToken.id, { maxHp: v });
                      }
                    }}
                    className="w-full rounded bg-fantasy-input-soft px-2 py-1 text-fantasy-text-soft"
                  />
                </div>
                <div>
                  <label className="block text-fantasy-muted-soft mb-0.5">
                    Mana
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedToken.mana ?? selectedToken.maxMana ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) {
                        setTokens((prev) =>
                          prev.map((t) =>
                            t.id === selectedToken.id ? { ...t, mana: v } : t
                          )
                        );
                        TokensAPI.update(selectedToken.id, { mana: v });
                      }
                    }}
                    className="w-full rounded bg-fantasy-input-soft px-2 py-1 text-fantasy-text-soft"
                  />
                </div>
                <div>
                  <label className="block text-fantasy-muted-soft mb-0.5">
                    Mana max
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedToken.maxMana ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 0) {
                        setTokens((prev) =>
                          prev.map((t) =>
                            t.id === selectedToken.id ? { ...t, maxMana: v } : t
                          )
                        );
                        TokensAPI.update(selectedToken.id, { maxMana: v });
                      }
                    }}
                    className="w-full rounded bg-fantasy-input-soft px-2 py-1 text-fantasy-text-soft"
                  />
                </div>
              </div>
            </div>
          )}
          {(selectedToken || selectedMapElement) && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="w-full px-3 py-2 rounded bg-fantasy-danger hover:bg-fantasy-error text-sm"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      <Modal
        open={saveModalOpen}
        onClose={() => {
          setSaveModalOpen(false);
          setSaveError(null);
        }}
        title="Enregistrer la carte"
      >
        {saveError && (
          <p className="mb-4 text-fantasy-error text-sm">{saveError}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveSubmit();
          }}
        >
          <div className="mb-4">
            <label className="block text-sm text-fantasy-muted-soft mb-2">
              Nom
            </label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Nom de la carte"
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-fantasy-muted-soft mb-2">
              Tags
            </label>
            <input
              type="text"
              value={saveTagInput}
              onChange={(e) => setSaveTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSaveTag(saveTagInput);
                }
              }}
              placeholder="Tag (Entrée pour ajouter)"
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft mb-2"
            />
            {saveTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {saveTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fantasy-input-soft text-xs"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeSaveTag(t)}
                      className="text-fantasy-muted-soft hover:text-fantasy-text"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <ModalButtons>
            <button
              type="button"
              onClick={() => setSaveModalOpen(false)}
              className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft-hover text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </ModalButtons>
        </form>
      </Modal>
    </section>
  );
}
