import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import CharacterCard from '../components/CharacterCard.jsx';
import DiceRoller from '../components/DiceRoller.jsx';
import MapCanvas from '../components/MapCanvas.jsx';
import useAuth from '../hooks/useAuth.jsx';
import useSocket from '../hooks/useSocket.js';
import { AssetService, CharacterService, DiceService, MapService } from '../services/api.js';

const COLOR_PALETTE = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#f97316', '#a78bfa', '#22d3ee'];

const assignColorsToUsers = (currentAssignments, characters) => {
  const assignments = { ...currentAssignments };
  let assignedCount = Object.keys(assignments).length;
  characters.forEach((character) => {
    if (!assignments[character.userId]) {
      assignments[character.userId] = COLOR_PALETTE[assignedCount % COLOR_PALETTE.length];
      assignedCount += 1;
    }
  });
  return assignments;
};

const defaultTokenPosition = (index) => ({
  x: 10 + (index % 5) * 15,
  y: 10 + Math.floor(index / 5) * 20
});

const createPlayerTokens = (characters, previousTokens, colorAssignments) => {
  const previousPositions = previousTokens.reduce((acc, token) => {
    acc[token.id] = { x: token.x, y: token.y };
    return acc;
  }, {});

  return characters.map((character, index) => {
    const id = `char-${character.id}`;
    const position = previousPositions[id] ?? defaultTokenPosition(index);
    return {
      id,
      type: 'player',
      ownerId: character.userId,
      label: character.name,
      color: colorAssignments[character.userId] || COLOR_PALETTE[index % COLOR_PALETTE.length],
      x: position.x,
      y: position.y
    };
  });
};

const buildMapPath = (filePath) => `/${filePath.replace(/^\/*/, '')}`;

const createEnemyTokenId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `enemy-${globalThis.crypto.randomUUID()}`;
  }
  return `enemy-${Date.now()}-${Math.round(Math.random() * 1000)}`;
};

const MapPage = () => {
  const { user } = useAuth();
  const socket = useSocket(Boolean(user));
  const [characters, setCharacters] = useState([]);
  const [mapImage, setMapImage] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [diceLog, setDiceLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [colorAssignments, setColorAssignments] = useState({});
  const [mapSearch, setMapSearch] = useState('');
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchMessage, setMapSearchMessage] = useState('');
  const [enemyForm, setEnemyForm] = useState({ name: '', asset: null });
  const [assetBank, setAssetBank] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetBankLoading, setAssetBankLoading] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);

  const isMJ = useMemo(() => user?.role === 'MJ', [user]);

  const loadCharacters = useCallback(async () => {
    try {
      const { data } = await CharacterService.list();
      const normalizedCharacters = data.characters.map((character) => ({
        ...character,
        speed: character.speed ?? 0
      }));
      setCharacters(normalizedCharacters);
      setColorAssignments((prevAssignments) => {
        const updatedAssignments = assignColorsToUsers(prevAssignments, normalizedCharacters);
        setTokens((prevTokens) => {
          const enemyTokens = prevTokens.filter((token) => token.type === 'enemy');
          const playerTokens = createPlayerTokens(normalizedCharacters, prevTokens, updatedAssignments);
          return [...playerTokens, ...enemyTokens];
        });
        return updatedAssignments;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMapCatalog = useCallback(
    async (searchTerm = '') => {
      if (!isMJ) {
        return;
      }
      setMapCatalogLoading(true);
      try {
        const params = searchTerm ? { search: searchTerm } : {};
        const { data } = await MapService.list(params);
        setMapCatalog(data.maps);
      } finally {
        setMapCatalogLoading(false);
      }
    },
    [isMJ]
  );

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const loadAssetBank = useCallback(
    async (searchTerm = '') => {
      if (!isMJ) {
        return;
      }
      setAssetBankLoading(true);
      try {
        const params = { category: 'token' };
        if (searchTerm) {
          params.search = searchTerm;
        }
        const { data } = await AssetService.list(params);
        setAssetBank(data.assets);
      } finally {
        setAssetBankLoading(false);
      }
    },
    [isMJ]
  );

  useEffect(() => {
    if (isMJ) {
      loadAssetBank();
    } else {
      setAssetBank([]);
      setEnemyForm({ name: '', asset: null });
    }
  }, [isMJ, loadAssetBank]);

  useEffect(() => {
    if (!isMJ || !isAssetPickerOpen) {
      return undefined;
    }
    const handler = setTimeout(() => {
      loadAssetBank(assetSearch.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [assetSearch, isAssetPickerOpen, isMJ, loadAssetBank]);

  useEffect(() => {
    if (!mapSearchMessage) {
      return undefined;
    }
    const handler = setTimeout(() => {
      setMapSearchMessage('');
    }, 4000);
    return () => clearTimeout(handler);
  }, [mapSearchMessage]);

  useEffect(() => {
    if (isMJ) {
      loadMapCatalog();
    } else {
      setMapCatalog([]);
    }
  }, [isMJ, loadMapCatalog]);

  useEffect(() => {
    if (!isMJ) {
      return undefined;
    }
    const handler = setTimeout(() => {
      loadMapCatalog(mapSearch.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [isMJ, loadMapCatalog, mapSearch]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleSocketTokenMove = (payload) => {
      setTokens((prev) =>
        prev.map((token) => (token.id === payload.id ? { ...token, x: payload.x, y: payload.y } : token))
      );
    };

    const handleSocketTokenAdd = (payload) => {
      setTokens((prev) => {
        if (prev.some((token) => token.id === payload.id)) {
          return prev;
        }
        return [...prev, payload];
      });
    };

    const handleSocketTokenRemove = (payload) => {
      setTokens((prev) => prev.filter((token) => token.id !== payload.id));
    };

    const handleDiceResult = (payload) => {
      setDiceLog((prev) => [payload, ...prev].slice(0, 10));
    };

    const handleMapUpdate = (payload) => {
      setMapImage(payload.mapImage);
    };

    socket.on('token:move', handleSocketTokenMove);
    socket.on('token:add', handleSocketTokenAdd);
    socket.on('token:remove', handleSocketTokenRemove);
    socket.on('dice:result', handleDiceResult);
    socket.on('map:update', handleMapUpdate);

    return () => {
      socket.off('token:move', handleSocketTokenMove);
      socket.off('token:add', handleSocketTokenAdd);
      socket.off('token:remove', handleSocketTokenRemove);
      socket.off('dice:result', handleDiceResult);
      socket.off('map:update', handleMapUpdate);
    };
  }, [socket]);

  const moveTokenLocally = useCallback((payload) => {
    setTokens((prev) => prev.map((token) => (token.id === payload.id ? { ...token, ...payload } : token)));
  }, []);

  const handleTokenMove = useCallback(
    (payload) => {
      const token = tokens.find((item) => item.id === payload.id);
      if (!token) {
        return;
      }
      const canControl = isMJ || (token.type === 'player' && token.ownerId === user?.id);
      if (!canControl) {
        return;
      }
      moveTokenLocally(payload);
      if (socket) {
        socket.emit('token:move', payload);
      }
    },
    [isMJ, moveTokenLocally, socket, tokens, user?.id]
  );

  const handleMapSearchSubmit = async (event) => {
    event.preventDefault();
    const query = mapSearch.trim();
    if (!query) {
      setMapSearchMessage("Saisissez un nom de carte pour la rechercher.");
      return;
    }
    setMapSearchLoading(true);
    try {
      const { data } = await MapService.list({ search: query });
      if (data.maps.length > 0) {
        const selectedMap = data.maps[0];
        const selectedPath = buildMapPath(selectedMap.filePath);
        setMapImage(selectedPath);
        socket?.emit('map:update', { mapImage: selectedPath });
        setMapSearchMessage(`Carte "${selectedMap.name}" chargée.`);
      } else {
        setMapSearchMessage('Aucune carte trouvée.');
      }
    } catch (error) {
      setMapSearchMessage("Impossible de charger la carte.");
    } finally {
      setMapSearchLoading(false);
    }
  };

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('map', file);
    formData.append('name', file.name);
    const { data } = await MapService.upload(formData);
    const uploadedPath = buildMapPath(data.map.filePath);
    setMapImage(uploadedPath);
    setMapCatalog((prev) => [data.map, ...prev.filter((map) => map.id !== data.map.id)]);
    socket?.emit('map:update', { mapImage: uploadedPath });
    setMapSearchMessage(`Carte "${data.map.name}" mise en ligne et activée.`);
    event.target.value = '';
  };

  const handleAssetUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('asset', file);
    formData.append('name', file.name);
    formData.append('category', 'token');
    const { data } = await AssetService.upload(formData);
    setAssetBank((prev) => [data.asset, ...prev.filter((asset) => asset.id !== data.asset.id)]);
    setEnemyForm((prev) => ({ ...prev, asset: data.asset }));
    setIsAssetPickerOpen(false);
    event.target.value = '';
  };

  const handleEnemyNameChange = (event) => {
    const value = event.target.value;
    setEnemyForm((prev) => ({ ...prev, name: value }));
  };

  const handleSelectAsset = (asset) => {
    setEnemyForm((prev) => ({ ...prev, asset }));
    setIsAssetPickerOpen(false);
  };

  const handleAddEnemyToken = (event) => {
    event.preventDefault();
    const name = enemyForm.name.trim();
    const asset = enemyForm.asset;
    if (!name || !asset) {
      return;
    }
    const imagePath = buildMapPath(asset.filePath);
    const newToken = {
      id: createEnemyTokenId(),
      type: 'enemy',
      ownerId: null,
      label: name,
      image: imagePath,
      x: 50,
      y: 50
    };
    setTokens((prev) => [...prev, newToken]);
    setEnemyForm((prev) => ({ ...prev, name: '' }));
    socket?.emit('token:add', newToken);
  };

  const handleRemoveEnemyToken = (tokenId) => {
    setTokens((prev) => prev.filter((token) => token.id !== tokenId));
    socket?.emit('token:remove', { id: tokenId });
  };

  const handleMapSelect = (map) => {
    const selectedPath = buildMapPath(map.filePath);
    setMapImage(selectedPath);
    socket?.emit('map:update', { mapImage: selectedPath });
  };

  const handleEnemyFormChange = (field) => (event) => {
    const value = event.target.value;
    setEnemyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddEnemyToken = (event) => {
    event.preventDefault();
    const name = enemyForm.name.trim();
    const image = enemyForm.image.trim();
    if (!name || !image) {
      return;
    }
    const newToken = {
      id: createEnemyTokenId(),
      type: 'enemy',
      ownerId: null,
      label: name,
      image,
      x: 50,
      y: 50
    };
    setTokens((prev) => [...prev, newToken]);
    setEnemyForm({ name: '', image: '' });
    socket?.emit('token:add', newToken);
  };

  const handleRemoveEnemyToken = (tokenId) => {
    setTokens((prev) => prev.filter((token) => token.id !== tokenId));
    socket?.emit('token:remove', { id: tokenId });
  };

  const handleUpdateCharacter = async (updatedCharacter) => {
    await CharacterService.update(updatedCharacter.id, {
      name: updatedCharacter.name,
      hp: updatedCharacter.hp,
      mana: updatedCharacter.mana,
      speed: updatedCharacter.speed,
      image: updatedCharacter.image || null
    });
    setCharacters((prev) => prev.map((char) => (char.id === updatedCharacter.id ? updatedCharacter : char)));
    setTokens((prev) =>
      prev.map((token) =>
        token.id === `char-${updatedCharacter.id}` ? { ...token, label: updatedCharacter.name } : token
      )
    );
  };

  const handleDiceRoll = async (expression) => {
    await DiceService.roll(expression);
  };

  const displayedTokens = useMemo(
    () =>
      tokens.map((token) => ({
        ...token,
        draggable: isMJ || (token.type === 'player' && token.ownerId === user?.id)
      })),
    [tokens, isMJ, user?.id]
  );

  const enemyTokens = useMemo(() => tokens.filter((token) => token.type === 'enemy'), [tokens]);

  const selectedAsset = enemyForm.asset;

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xl">Chargement des données...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-emerald-400">Carte</h2>
            {isMJ && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <span className="rounded bg-emerald-500 px-3 py-1 font-semibold text-slate-900">Uploader une carte</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleMapUpload} />
              </label>
            )}
          </div>
          {isMJ && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-emerald-300">Cartes enregistrées</h3>
                <form onSubmit={handleMapSearchSubmit} className="flex flex-col gap-2 md:flex-row">
                  <input
                    type="text"
                    value={mapSearch}
                    onChange={(event) => {
                      setMapSearch(event.target.value);
                      setMapSearchMessage('');
                    }}
                    placeholder="Rechercher une carte par son nom"
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
                    disabled={mapSearchLoading}
                  >
                    {mapSearchLoading ? 'Recherche...' : 'Charger'}
                  </button>
                </form>
                {mapSearchMessage && (
                  <p className="text-sm text-emerald-200">{mapSearchMessage}</p>
                )}
                <div className="flex flex-col gap-1 text-xs text-slate-300 md:flex-row md:items-center md:justify-between">
                  <span>Utilisez la recherche pour activer rapidement une carte existante.</span>
                  <Link to="/resources" className="text-emerald-400 hover:text-emerald-200">
                    Gérer toutes les ressources visuelles
                  </Link>
                </div>
              </div>
            </div>
          )}
          <div className="h-[60vh]">
            <MapCanvas mapImage={mapImage} tokens={displayedTokens} onTokenMove={handleTokenMove} />
          </div>
          {isMJ && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-emerald-300">Pions ennemis</h3>
                <form onSubmit={handleAddEnemyToken} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      type="text"
                      value={enemyForm.name}
                      onChange={handleEnemyNameChange}
                      placeholder="Nom de l'ennemi"
                      className="flex-1 rounded bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setIsAssetPickerOpen((prev) => !prev)}
                        className="flex-1 rounded border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                      >
                        {selectedAsset ? "Changer d'image" : 'Choisir une image'}
                      </button>
                      <label className="flex cursor-pointer items-center justify-center rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400">
                        Ajouter une image
                        <input type="file" className="hidden" accept="image/*" onChange={handleAssetUpload} />
                      </label>
                    </div>
                  </div>
                  {selectedAsset && (
                    <div className="flex items-center gap-3 rounded border border-slate-700 bg-slate-900 p-3">
                      <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-600">
                        <img
                          src={buildMapPath(selectedAsset.filePath)}
                          alt={selectedAsset.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-emerald-200">{selectedAsset.name}</span>
                        <span className="text-xs text-slate-400">Sélectionnée pour le prochain pion ennemi</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="submit"
                    className="self-start rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
                    disabled={!enemyForm.name.trim() || !selectedAsset}
                  >
                    Ajouter le pion
                  </button>
                </form>
                {isAssetPickerOpen && (
                  <div className="rounded border border-slate-700 bg-slate-900 p-3">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-emerald-300">Banque d'images</h4>
                        <button
                          type="button"
                          onClick={() => setIsAssetPickerOpen(false)}
                          className="text-xs text-slate-400 hover:text-slate-200"
                        >
                          Fermer
                        </button>
                      </div>
                      <input
                        type="text"
                        value={assetSearch}
                        onChange={(event) => setAssetSearch(event.target.value)}
                        placeholder="Rechercher dans la banque..."
                        className="rounded bg-slate-800 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {assetBankLoading ? (
                          <p className="text-xs text-slate-400">Chargement des images...</p>
                        ) : assetBank.length === 0 ? (
                          <p className="text-xs text-slate-400">Aucune image enregistrée pour le moment.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {assetBank.map((asset) => {
                              const publicPath = buildMapPath(asset.filePath);
                              const isActive = selectedAsset?.id === asset.id;
                              return (
                                <button
                                  type="button"
                                  key={asset.id}
                                  onClick={() => handleSelectAsset(asset)}
                                  className={`overflow-hidden rounded border ${
                                    isActive
                                      ? 'border-emerald-400 ring-1 ring-emerald-300'
                                      : 'border-slate-700 hover:border-emerald-400'
                                  }`}
                                >
                                  <img src={publicPath} alt={asset.name} className="h-24 w-full object-cover" />
                                  <span className="block truncate px-2 py-1 text-left text-[11px] text-slate-200">{asset.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {enemyTokens.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucun pion ennemi pour le moment.</p>
                  ) : (
                    enemyTokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center gap-3 rounded border border-slate-700 bg-slate-900 p-3"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-600">
                          {token.image ? (
                            <img src={token.image} alt={token.label} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-700 text-xs font-semibold uppercase text-emerald-200">
                              {token.label.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-emerald-300">{token.label}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEnemyToken(token.id)}
                            className="text-xs text-rose-400 transition hover:text-rose-300"
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
        <aside className="flex flex-col gap-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-emerald-400">Personnages</h2>
            <div className="flex max-h-[40vh] flex-col gap-3 overflow-auto pr-2">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isEditable={isMJ || character.userId === user?.id}
                  onUpdate={handleUpdateCharacter}
                />
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-emerald-400">Lancer de dés</h2>
            <DiceRoller onRoll={handleDiceRoll} log={diceLog} />
          </section>
        </aside>
      </main>
    </div>
  );
};

export default MapPage;
