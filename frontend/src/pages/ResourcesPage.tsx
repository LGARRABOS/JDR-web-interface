import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GamesAPI, MapsAPI, MusicAPI, ElementsAPI } from '../api/client';
import type { MapData } from '../components/MapCanvas';
import { MapEditor } from '../components/MapEditor';
import { Modal, ModalButtons, ModalConfirm } from '../components/Modal';
import {
  MonsterEditorModal,
  type GameElementFull,
} from '../components/MonsterEditorModal';

interface MusicTrack {
  id: number;
  gameId?: number;
  filename: string;
  url: string;
}

interface GameElement {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  category: string;
  tags?: string[];
  createdAt: string;
  description?: string;
  uniqueTrait?: string;
  loot?: string;
  maxHp?: number;
  maxMana?: number;
  iconPosX?: number;
  iconPosY?: number;
  iconScale?: number;
}

type ResourcesTab = 'resources' | 'elements' | 'editor';

function ElementUploadForm({
  defaultName,
  existingTags,
  onSubmit,
  onCancel,
  uploading,
}: {
  defaultName: string;
  existingTags?: string[];
  onSubmit: (name: string, category: string, tags: string[]) => void;
  onCancel: () => void;
  uploading: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState<'monster' | 'decor'>('monster');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const addTag = (t: string) => {
    const trimmed = t.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim()) addTag(tagInput);
    onSubmit(name.trim() || defaultName, category, tags);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm text-fantasy-muted-soft mb-2">
          Nom
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de l'élément"
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm text-fantasy-muted-soft mb-2">
          Catégorie
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as 'monster' | 'decor')}
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm border border-fantasy-border-soft"
        >
          <option value="monster">Monstre</option>
          <option value="decor">Décor</option>
        </select>
      </div>
      <div className="mb-4">
        <label className="block text-sm text-fantasy-muted-soft mb-2">
          Tags
        </label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Rechercher ou saisir un tag (Entrée pour ajouter)"
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none mb-2"
        />
        {(existingTags ?? []).length > 0 && (
          <div className="mb-2">
            <span className="text-xs text-fantasy-muted-soft">
              Tags disponibles :
            </span>
            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
              {(existingTags ?? [])
                .filter(
                  (t) =>
                    !tags.includes(t) &&
                    (!tagInput.trim() ||
                      t.toLowerCase().includes(tagInput.trim().toLowerCase()))
                )
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs"
                  >
                    {t}
                  </button>
                ))}
            </div>
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-xs text-fantasy-muted-soft">
              Sélectionnés :
            </span>
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fantasy-accent/50 text-xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-fantasy-muted-soft hover:text-fantasy-bg"
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
          onClick={onCancel}
          className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={uploading}
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium disabled:opacity-50"
        >
          {uploading ? 'Upload...' : 'Ajouter'}
        </button>
      </ModalButtons>
    </form>
  );
}

function MapUploadForm({
  defaultName,
  existingTags,
  onSubmit,
  onCancel,
  uploading,
}: {
  defaultName: string;
  existingTags?: string[];
  onSubmit: (name: string, tags: string[]) => void;
  onCancel: () => void;
  uploading: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const addTag = (t: string) => {
    const trimmed = t.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim()) addTag(tagInput);
    onSubmit(name.trim() || defaultName, tags);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm text-fantasy-muted-soft mb-2">
          Nom
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la carte"
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm text-fantasy-muted-soft mb-2">
          Tags
        </label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Rechercher ou saisir un tag (Entrée pour ajouter)"
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none mb-2"
        />
        {(existingTags ?? []).length > 0 && (
          <div className="mb-2">
            <span className="text-xs text-fantasy-muted-soft">
              Tags disponibles :
            </span>
            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
              {(existingTags ?? [])
                .filter(
                  (t) =>
                    !tags.includes(t) &&
                    (!tagInput.trim() ||
                      t.toLowerCase().includes(tagInput.trim().toLowerCase()))
                )
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs"
                  >
                    {t}
                  </button>
                ))}
            </div>
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-xs text-fantasy-muted-soft">
              Sélectionnés :
            </span>
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fantasy-accent/50 text-xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-fantasy-muted-soft hover:text-fantasy-bg"
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
          onClick={onCancel}
          className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={uploading}
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium disabled:opacity-50"
        >
          {uploading ? 'Upload...' : 'Ajouter'}
        </button>
      </ModalButtons>
    </form>
  );
}

export function ResourcesPage() {
  const { gameId: gameIdParam } = useParams();
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 0;
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ResourcesTab>('resources');
  const [game, setGame] = useState<{
    id: number;
    name: string;
    role: string;
  } | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [elements, setElements] = useState<GameElement[]>([]);
  const [mapUploading, setMapUploading] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const [elementUploading, setElementUploading] = useState(false);
  const [pendingMapFile, setPendingMapFile] = useState<File | null>(null);
  const [pendingElementFile, setPendingElementFile] = useState<File | null>(
    null
  );
  const [deleteMapId, setDeleteMapId] = useState<number | null>(null);
  const [deleteTrackId, setDeleteTrackId] = useState<number | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);
  const [monsterEditorElement, setMonsterEditorElement] =
    useState<GameElementFull | null>(null);
  const [elementSearchQuery, setElementSearchQuery] = useState('');
  const [elementFilterCategory, setElementFilterCategory] = useState<
    'all' | 'monster' | 'decor'
  >('all');
  const mapFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const elementFileRef = useRef<HTMLInputElement>(null);

  const isGM = game?.role === 'MJ';

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

  const loadTracks = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await MusicAPI.list(gameId);
      setTracks(data.tracks ?? []);
    } catch {
      setTracks([]);
    }
  }, [gameId]);

  const loadElements = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data } = await ElementsAPI.list(gameId);
      setElements(data.elements ?? []);
    } catch {
      setElements([]);
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  const handleMapFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) return;
      setPendingMapFile(file);
      e.target.value = '';
    },
    []
  );

  const handleMapFormSubmit = useCallback(
    async (name: string, tags: string[]) => {
      if (!pendingMapFile) return;
      setMapUploading(true);
      try {
        const n = name.trim() || pendingMapFile.name.replace(/\.[^.]+$/, '');
        const { data } = await MapsAPI.upload(gameId, pendingMapFile, n, tags);
        setMaps((prev) => [...prev, data.map]);
      } catch {
        loadMaps();
      } finally {
        setMapUploading(false);
        setPendingMapFile(null);
      }
    },
    [gameId, loadMaps, pendingMapFile]
  );

  const handleMusicUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) return;
      setMusicUploading(true);
      try {
        await MusicAPI.upload(gameId, file);
        loadTracks();
      } catch {
        loadTracks();
      } finally {
        setMusicUploading(false);
        e.target.value = '';
      }
    },
    [gameId, loadTracks]
  );

  const handleDeleteMapConfirm = useCallback(async () => {
    if (!deleteMapId) return;
    try {
      await MapsAPI.delete(deleteMapId);
      setMaps((prev) => prev.filter((m) => m.id !== deleteMapId));
    } catch {
      loadMaps();
    } finally {
      setDeleteMapId(null);
    }
  }, [loadMaps, deleteMapId]);

  const handleDeleteTrackConfirm = useCallback(async () => {
    if (!deleteTrackId) return;
    try {
      await MusicAPI.delete(gameId, deleteTrackId);
      setTracks((prev) => prev.filter((t) => t.id !== deleteTrackId));
    } catch {
      loadTracks();
    } finally {
      setDeleteTrackId(null);
    }
  }, [gameId, loadTracks, deleteTrackId]);

  const handleElementFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) return;
      setPendingElementFile(file);
      e.target.value = '';
    },
    []
  );

  const handleElementFormSubmit = useCallback(
    async (name: string, category: string, tags: string[]) => {
      if (!pendingElementFile) return;
      const cat = (category || 'monster').toLowerCase().trim();
      if (cat !== 'monster' && cat !== 'decor') return;
      setElementUploading(true);
      try {
        const n =
          name.trim() || pendingElementFile.name.replace(/\.[^.]+$/, '');
        const { data } = await ElementsAPI.upload(
          gameId,
          pendingElementFile,
          n,
          cat,
          tags
        );
        setElements((prev) => [...prev, data.element]);
        setPendingElementFile(null);
        if (cat === 'monster') {
          const el = data.element as GameElementFull;
          setMonsterEditorElement({
            ...el,
            description: el.description ?? '',
            uniqueTrait: el.uniqueTrait ?? '',
            loot: el.loot ?? '',
            maxHp: el.maxHp ?? 10,
            maxMana: el.maxMana ?? 0,
            iconPosX: el.iconPosX ?? 50,
            iconPosY: el.iconPosY ?? 50,
            iconScale: el.iconScale ?? 1,
          });
        }
      } catch {
        loadElements();
      } finally {
        setElementUploading(false);
      }
    },
    [gameId, loadElements, pendingElementFile]
  );

  const handleMonsterEditorSave = useCallback(
    async (patch: Partial<GameElementFull>) => {
      if (!monsterEditorElement) return;
      const { data } = await ElementsAPI.update(
        gameId,
        monsterEditorElement.id,
        patch
      );
      const updated = (data as { element?: GameElementFull }).element;
      if (updated) {
        setElements((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e))
        );
      }
      setMonsterEditorElement(null);
    },
    [gameId, monsterEditorElement]
  );

  const handleDeleteElementConfirm = useCallback(async () => {
    if (!deleteElementId) return;
    try {
      await ElementsAPI.delete(gameId, deleteElementId);
      setElements((prev) => prev.filter((el) => el.id !== deleteElementId));
    } catch {
      loadElements();
    } finally {
      setDeleteElementId(null);
    }
  }, [gameId, loadElements, deleteElementId]);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-fantasy-muted-soft">Chargement...</p>
      </div>
    );
  }

  if (!isGM) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-fantasy-muted-soft">Accès réservé au MJ</p>
        <button
          onClick={() => navigate(`/table/${gameId}`)}
          className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft"
        >
          Retour à la table
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-fantasy-bg text-fantasy-text-soft overflow-hidden">
      <header className="shrink-0 flex justify-between items-center px-4 py-3 bg-fantasy-surface border-b border-fantasy-border-soft">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/table/${gameId}`)}
            className="text-fantasy-muted-soft hover:text-fantasy-bg"
          >
            ← Table de jeu
          </button>
          <h1 className="font-bold text-lg">Ressources — {game.name}</h1>
        </div>
      </header>

      <nav className="shrink-0 flex gap-1 px-4 py-2 bg-fantasy-surface/50 border-b border-fantasy-border-soft">
        <button
          onClick={() => setActiveTab('resources')}
          className={`px-4 py-2 rounded text-sm font-medium ${
            activeTab === 'resources'
              ? 'bg-fantasy-accent/80 text-fantasy-bg'
              : 'bg-fantasy-input-soft/50 text-fantasy-muted-soft hover:text-fantasy-bg'
          }`}
        >
          Ressources
        </button>
        <button
          onClick={() => setActiveTab('elements')}
          className={`px-4 py-2 rounded text-sm font-medium ${
            activeTab === 'elements'
              ? 'bg-fantasy-accent/80 text-fantasy-bg'
              : 'bg-fantasy-input-soft/50 text-fantasy-muted-soft hover:text-fantasy-bg'
          }`}
        >
          Bibliothèque d&apos;éléments
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 rounded text-sm font-medium ${
            activeTab === 'editor'
              ? 'bg-fantasy-accent/80 text-fantasy-bg'
              : 'bg-fantasy-input-soft/50 text-fantasy-muted-soft hover:text-fantasy-bg'
          }`}
        >
          Modifier les cartes
        </button>
      </nav>

      <Modal
        open={!!pendingMapFile}
        onClose={() => setPendingMapFile(null)}
        title="Ajouter une carte"
      >
        <MapUploadForm
          defaultName={pendingMapFile?.name.replace(/\.[^.]+$/, '') ?? ''}
          existingTags={[...new Set(maps.flatMap((m) => m.tags ?? []))]}
          onSubmit={(name, tags) => {
            handleMapFormSubmit(name, tags);
            setPendingMapFile(null);
          }}
          onCancel={() => setPendingMapFile(null)}
          uploading={mapUploading}
        />
      </Modal>

      <Modal
        open={!!pendingElementFile}
        onClose={() => setPendingElementFile(null)}
        title="Ajouter un élément"
      >
        <ElementUploadForm
          defaultName={pendingElementFile?.name.replace(/\.[^.]+$/, '') ?? ''}
          existingTags={[...new Set(elements.flatMap((e) => e.tags ?? []))]}
          onSubmit={(name, category, tags) => {
            handleElementFormSubmit(name, category, tags);
          }}
          onCancel={() => setPendingElementFile(null)}
          uploading={elementUploading}
        />
      </Modal>

      <ModalConfirm
        open={deleteMapId !== null}
        onClose={() => setDeleteMapId(null)}
        onConfirm={handleDeleteMapConfirm}
        title="Supprimer la carte"
        message="Supprimer cette carte ?"
        confirmLabel="Supprimer"
        danger
      />

      <ModalConfirm
        open={deleteTrackId !== null}
        onClose={() => setDeleteTrackId(null)}
        onConfirm={handleDeleteTrackConfirm}
        title="Supprimer la piste"
        message="Supprimer cette piste ?"
        confirmLabel="Supprimer"
        danger
      />

      <ModalConfirm
        open={deleteElementId !== null}
        onClose={() => setDeleteElementId(null)}
        onConfirm={handleDeleteElementConfirm}
        title="Supprimer l'élément"
        message="Supprimer cet élément ?"
        confirmLabel="Supprimer"
        danger
      />

      {monsterEditorElement && (
        <MonsterEditorModal
          element={monsterEditorElement}
          onClose={() => setMonsterEditorElement(null)}
          onSave={handleMonsterEditorSave}
          mode="edit"
          isGM={true}
        />
      )}

      <main className="flex-1 min-h-0 overflow-auto p-6">
        <div
          className={`mx-auto ${activeTab === 'editor' ? 'max-w-[none] w-full h-full' : 'max-w-4xl'}`}
        >
          {activeTab === 'editor' && (
            <div className="h-[calc(100vh-12rem)] min-h-[400px]">
              <MapEditor
                gameId={gameId}
                maps={maps}
                elements={elements}
                onMapsChange={loadMaps}
                onElementsChange={loadElements}
              />
            </div>
          )}

          {activeTab === 'elements' && (
            <section className="rounded-lg bg-fantasy-surface/80 p-6">
              <h2 className="text-xl font-semibold mb-4 text-fantasy-text-soft">
                Bibliothèque d&apos;éléments
              </h2>
              <p className="text-fantasy-muted-soft text-sm mb-4">
                Uploadez des images de monstres ou de décor pour les placer sur
                vos cartes.
              </p>
              <div className="flex flex-wrap gap-4 mb-4">
                <input
                  ref={elementFileRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.gif"
                  className="hidden"
                  onChange={handleElementFileSelect}
                />
                <button
                  onClick={() => elementFileRef.current?.click()}
                  disabled={elementUploading}
                  className="px-4 py-2 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover font-medium disabled:opacity-50"
                >
                  {elementUploading ? 'Upload...' : '+ Ajouter un élément'}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="text"
                  value={elementSearchQuery}
                  onChange={(e) => setElementSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou tag..."
                  className="flex-1 rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                />
                <select
                  value={elementFilterCategory}
                  onChange={(e) =>
                    setElementFilterCategory(
                      e.target.value as 'all' | 'monster' | 'decor'
                    )
                  }
                  className="rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft border border-fantasy-border-soft"
                >
                  <option value="all">Tous</option>
                  <option value="monster">Monstres</option>
                  <option value="decor">Décor</option>
                </select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {elements
                  .filter((el) => {
                    if (
                      elementFilterCategory !== 'all' &&
                      el.category !== elementFilterCategory
                    )
                      return false;
                    const q = elementSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    const matchName = el.name.toLowerCase().includes(q);
                    const matchTags = (el.tags ?? []).some((t) =>
                      t.toLowerCase().includes(q)
                    );
                    return matchName || matchTags;
                  })
                  .map((el) => (
                    <div
                      key={el.id}
                      className="rounded-lg bg-fantasy-input-soft/50 overflow-hidden border border-fantasy-border-soft"
                    >
                      <div className="aspect-square bg-fantasy-surface relative">
                        <img
                          src={el.imageUrl}
                          alt={el.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-2 flex items-center justify-between gap-2">
                        <span className="text-sm truncate" title={el.name}>
                          {el.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {el.category === 'monster' && (
                            <button
                              onClick={() =>
                                setMonsterEditorElement({
                                  ...el,
                                  description: el.description ?? '',
                                  uniqueTrait: el.uniqueTrait ?? '',
                                  loot: el.loot ?? '',
                                  maxHp: el.maxHp ?? 10,
                                  maxMana: el.maxMana ?? 0,
                                  iconPosX: el.iconPosX ?? 50,
                                  iconPosY: el.iconPosY ?? 50,
                                  iconScale: el.iconScale ?? 1,
                                })
                              }
                              className="text-fantasy-accent hover:text-fantasy-accent-hover text-xs px-2 py-0.5 rounded"
                              title="Modifier"
                            >
                              Modifier
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteElementId(el.id)}
                            className="text-fantasy-error hover:text-fantasy-error text-xs px-2 py-0.5 rounded"
                            title="Supprimer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {elements.length === 0 && (
                <p className="text-fantasy-muted-soft text-sm">
                  Aucun élément. Uploadez des images (png, jpg, gif) de monstres
                  ou de décor.
                </p>
              )}
            </section>
          )}

          {activeTab === 'resources' && (
            <>
              {/* Cartes */}
              <section className="rounded-lg bg-fantasy-surface/80 p-6">
                <h2 className="text-xl font-semibold mb-4 text-fantasy-text-soft">
                  Cartes
                </h2>
                <div className="flex flex-wrap gap-4 mb-4">
                  <input
                    ref={mapFileRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif"
                    className="hidden"
                    onChange={handleMapFileSelect}
                  />
                  <button
                    onClick={() => mapFileRef.current?.click()}
                    disabled={mapUploading}
                    className="px-4 py-2 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover font-medium disabled:opacity-50"
                  >
                    {mapUploading ? 'Upload...' : '+ Ajouter une carte'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {maps.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg bg-fantasy-input-soft/50 overflow-hidden border border-fantasy-border-soft"
                    >
                      <div className="aspect-video bg-fantasy-surface relative">
                        <img
                          src={m.imageUrl}
                          alt={m.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-2 flex items-center justify-between gap-2">
                        <span className="text-sm truncate">{m.name}</span>
                        <button
                          onClick={() => setDeleteMapId(m.id)}
                          className="text-fantasy-error hover:text-fantasy-error text-xs px-2 py-0.5 rounded"
                          title="Supprimer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {maps.length === 0 && (
                  <p className="text-fantasy-muted-soft text-sm">
                    Aucune carte. Uploadez une image (png, jpg, gif).
                  </p>
                )}
              </section>

              {/* Musique */}
              <section className="rounded-lg bg-fantasy-surface/80 p-6">
                <h2 className="text-xl font-semibold mb-4 text-fantasy-text-soft">
                  Musique d&apos;ambiance
                </h2>
                <div className="flex flex-wrap gap-4 mb-4">
                  <input
                    ref={musicFileRef}
                    type="file"
                    accept=".mp3,.ogg,.wav,.m4a"
                    className="hidden"
                    onChange={handleMusicUpload}
                  />
                  <button
                    onClick={() => musicFileRef.current?.click()}
                    disabled={musicUploading}
                    className="px-4 py-2 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent-hover font-medium disabled:opacity-50"
                  >
                    {musicUploading ? 'Upload...' : '+ Ajouter une piste'}
                  </button>
                </div>
                <ul className="space-y-2">
                  {tracks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between py-2 px-3 rounded bg-fantasy-input-soft/50"
                    >
                      <span className="text-sm truncate">{t.filename}</span>
                      <button
                        onClick={() => setDeleteTrackId(t.id)}
                        className="text-fantasy-error hover:text-fantasy-error text-xs px-2 py-0.5 rounded shrink-0"
                        title="Supprimer"
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
                {tracks.length === 0 && (
                  <p className="text-fantasy-muted-soft text-sm">
                    Aucune piste. Uploadez un fichier audio (mp3, ogg, wav,
                    m4a).
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
