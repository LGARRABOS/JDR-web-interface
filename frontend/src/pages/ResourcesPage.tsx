import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GamesAPI, MapsAPI, MusicAPI, ElementsAPI } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';
import type { MapData } from '../components/MapCanvas';
import { MapEditor } from '../components/MapEditor';
import { Modal, ModalButtons, ModalConfirm } from '../components/Modal';
import {
  ChevronLeft,
  MapIcon,
  Music,
  Trash,
} from '../components/tabletop/icons';
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

type ResourcesTab = 'maps' | 'elements' | 'music' | 'editor';

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
    const trimmed = tagInput.trim().toLowerCase();
    const submitTags =
      trimmed && !tags.includes(trimmed) ? [...tags, trimmed] : tags;
    onSubmit(name.trim() || defaultName, category, submitTags);
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
    const trimmed = tagInput.trim().toLowerCase();
    const submitTags =
      trimmed && !tags.includes(trimmed) ? [...tags, trimmed] : tags;
    onSubmit(name.trim() || defaultName, submitTags);
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

  const [activeTab, setActiveTab] = useState<ResourcesTab>('maps');
  const [game, setGame] = useState<{
    id: number;
    name: string;
    role: string;
    currentMapId?: number;
  } | null>(null);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
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
  const [monsterSaveError, setMonsterSaveError] = useState<string | null>(null);
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

  const acceptMapFile = useCallback((file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      setPageError(
        'Format non pris en charge : utilisez une image PNG, JPG ou GIF.'
      );
      return;
    }
    setPendingMapFile(file);
  }, []);

  const handleMapFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      acceptMapFile(e.target.files?.[0]);
      e.target.value = '';
    },
    [acceptMapFile]
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

  const uploadMusicFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) {
        setPageError(
          'Format non pris en charge : utilisez un fichier MP3, OGG, WAV ou M4A.'
        );
        return;
      }
      setMusicUploading(true);
      try {
        await MusicAPI.upload(gameId, file);
      } catch (err) {
        setPageError(getErrorMessage(err, 'Envoi de la musique impossible'));
      } finally {
        loadTracks();
        setMusicUploading(false);
      }
    },
    [gameId, loadTracks]
  );

  const handleMusicUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      uploadMusicFile(e.target.files?.[0]);
      e.target.value = '';
    },
    [uploadMusicFile]
  );

  const handleShowMap = useCallback(
    async (mapId: number) => {
      try {
        await GamesAPI.setCurrentMap(gameId, mapId);
        setGame((g) => (g ? { ...g, currentMapId: mapId } : g));
      } catch (err) {
        setPageError(getErrorMessage(err, 'Impossible d’afficher cette carte'));
      }
    },
    [gameId]
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

  const acceptElementFile = useCallback((file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      setPageError(
        'Format non pris en charge : utilisez une image PNG, JPG ou GIF.'
      );
      return;
    }
    setPendingElementFile(file);
  }, []);

  const handleElementFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      acceptElementFile(e.target.files?.[0]);
      e.target.value = '';
    },
    [acceptElementFile]
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
      setMonsterSaveError(null);
      try {
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
      } catch (err) {
        setMonsterSaveError(getErrorMessage(err));
      }
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

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(null), 6000);
    return () => clearTimeout(t);
  }, [pageError]);

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

  const navItems: {
    id: ResourcesTab;
    label: string;
    count?: number;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'maps',
      label: 'Cartes',
      count: maps.length,
      icon: <MapIcon size={18} />,
    },
    {
      id: 'elements',
      label: 'Monstres & décors',
      count: elements.length,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
        </svg>
      ),
    },
    {
      id: 'music',
      label: 'Musique',
      count: tracks.length,
      icon: <Music size={18} />,
    },
    {
      id: 'editor',
      label: 'Éditeur de cartes',
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      ),
    },
  ];

  const mapQuery = mapSearchQuery.trim().toLowerCase();
  const filteredMaps = maps.filter(
    (m) =>
      !mapQuery ||
      m.name.toLowerCase().includes(mapQuery) ||
      (m.tags ?? []).some((t) => t.toLowerCase().includes(mapQuery))
  );
  const filteredElements = elements.filter((el) => {
    if (
      elementFilterCategory !== 'all' &&
      el.category !== elementFilterCategory
    )
      return false;
    const q = elementSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      el.name.toLowerCase().includes(q) ||
      (el.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });
  const openMonsterEditor = (el: GameElement) =>
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

  const inputClass =
    'h-11 px-3.5 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent';
  const primaryButton =
    'inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold hover:bg-fantasy-accent-hover disabled:opacity-50';
  const cardButton =
    'h-9 rounded-lg bg-fantasy-surface text-sm text-fantasy-text hover:bg-fantasy-surface-hover';

  return (
    <div className="h-screen flex flex-col bg-fantasy-bg text-fantasy-text overflow-hidden">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-fantasy-surface">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`/table/${gameId}`)}
            className="inline-flex items-center gap-1.5 h-10 pl-2 pr-3 rounded-lg bg-fantasy-surface hover:bg-fantasy-surface-hover text-[15px]"
          >
            <ChevronLeft size={18} />
            Table de jeu
          </button>
          <div className="leading-tight">
            <h1 className="font-heading font-bold text-[22px]">Ressources</h1>
            <span className="text-[13px] text-fantasy-muted">{game.name}</span>
          </div>
        </div>
        <span className="text-[13px] text-fantasy-muted">
          Partagées entre toutes vos parties
        </span>
      </header>

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

      {monsterSaveError && (
        <div
          role="alert"
          className="mx-4 mt-2 p-3 rounded bg-fantasy-danger/20 border border-fantasy-error text-fantasy-error text-sm"
        >
          {monsterSaveError}
        </div>
      )}

      {monsterEditorElement && (
        <MonsterEditorModal
          element={monsterEditorElement}
          onClose={() => {
            setMonsterEditorElement(null);
            setMonsterSaveError(null);
          }}
          onSave={handleMonsterEditorSave}
          mode="edit"
          isGM={true}
        />
      )}

      {pageError && (
        <div
          role="alert"
          className="glass fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2 text-sm text-red-300"
        >
          {pageError}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className={`flex flex-wrap gap-6 p-6 mx-auto ${
            activeTab === 'editor' ? 'max-w-none h-full' : 'max-w-[1360px]'
          }`}
        >
          <nav
            aria-label="Catégories"
            className="flex-[1_1_220px] max-w-[260px] flex flex-col gap-1"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 h-11 px-3 rounded-lg text-left text-[15px] ${
                    active
                      ? 'bg-fantasy-surface text-fantasy-text font-bold'
                      : 'text-fantasy-text-soft hover:bg-fantasy-surface hover:text-fantasy-text'
                  }`}
                >
                  <span className={active ? 'text-fantasy-accent' : ''}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.count != null && (
                    <span className="text-[13px] text-fantasy-muted font-normal">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <main
            className={`flex-[999_1_560px] min-w-0 flex flex-col gap-5 ${activeTab === 'editor' ? 'min-h-[500px]' : ''}`}
          >
            {activeTab === 'maps' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-heading font-semibold text-xl">Cartes</h2>
                  <div className="flex flex-wrap gap-2.5">
                    <label htmlFor="map-search" className="sr-only">
                      Rechercher une carte
                    </label>
                    <input
                      id="map-search"
                      value={mapSearchQuery}
                      onChange={(e) => setMapSearchQuery(e.target.value)}
                      placeholder="Rechercher par nom ou tag…"
                      className={`${inputClass} w-64 max-w-full`}
                    />
                    <input
                      ref={mapFileRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.gif,.webp"
                      className="hidden"
                      onChange={handleMapFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => mapFileRef.current?.click()}
                      disabled={mapUploading}
                      className={primaryButton}
                    >
                      {mapUploading ? 'Envoi…' : '+ Ajouter une carte'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {filteredMaps.map((m) => {
                    const displayed = game.currentMapId === m.id;
                    return (
                      <article
                        key={m.id}
                        className="rounded-2xl bg-fantasy-surface border border-fantasy-border-soft overflow-hidden flex flex-col"
                      >
                        <div className="relative aspect-[16/10] bg-fantasy-surface">
                          <img
                            src={m.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {displayed && (
                            <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-fantasy-accent text-fantasy-bg text-xs font-bold">
                              Affichée
                            </span>
                          )}
                        </div>
                        <div className="p-3.5 pt-3 flex flex-col gap-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="font-bold truncate" title={m.name}>
                              {m.name}
                            </h3>
                            <span className="text-xs text-fantasy-muted shrink-0">
                              {m.width} × {m.height}
                            </span>
                          </div>
                          {(m.tags ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(m.tags ?? []).map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-full bg-fantasy-surface text-fantasy-text-soft text-xs"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleShowMap(m.id)}
                              disabled={displayed}
                              className={`${cardButton} flex-1 disabled:opacity-60 disabled:cursor-default`}
                            >
                              {displayed
                                ? 'Sur la table'
                                : 'Afficher sur la table'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('editor')}
                              className={`${cardButton} w-9 flex items-center justify-center`}
                              aria-label={`Modifier ${m.name}`}
                              title="Modifier dans l'éditeur"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMapId(m.id)}
                              className="h-9 w-9 rounded-lg bg-red-400/10 text-red-300 hover:bg-red-400/20 flex items-center justify-center"
                              aria-label={`Supprimer ${m.name}`}
                              title="Supprimer"
                            >
                              <Trash size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  <DropZone
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    title="Glissez une image ici"
                    hint="PNG, JPG ou GIF"
                    minHeight="min-h-[260px]"
                    onFile={acceptMapFile}
                  />
                </div>
                {maps.length > 0 && filteredMaps.length === 0 && (
                  <p className="text-sm text-fantasy-muted">
                    Aucune carte ne correspond à « {mapSearchQuery} ».
                  </p>
                )}
              </>
            )}

            {activeTab === 'elements' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading font-semibold text-xl">
                      Monstres &amp; décors
                    </h2>
                    <p className="text-sm text-fantasy-muted">
                      Des images à placer sur vos cartes. Les monstres ont une
                      fiche (PV, mana, butin…).
                    </p>
                  </div>
                  <div>
                    <input
                      ref={elementFileRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.gif,.webp"
                      className="hidden"
                      onChange={handleElementFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => elementFileRef.current?.click()}
                      disabled={elementUploading}
                      className={primaryButton}
                    >
                      {elementUploading ? 'Envoi…' : '+ Ajouter un élément'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <label htmlFor="element-search" className="sr-only">
                    Rechercher un élément
                  </label>
                  <input
                    id="element-search"
                    value={elementSearchQuery}
                    onChange={(e) => setElementSearchQuery(e.target.value)}
                    placeholder="Rechercher par nom ou tag…"
                    className={`${inputClass} flex-1 min-w-[200px]`}
                  />
                  <div
                    role="group"
                    aria-label="Catégorie"
                    className="flex gap-1 p-1 rounded-lg bg-fantasy-surface"
                  >
                    {(
                      [
                        ['all', 'Tous'],
                        ['monster', 'Monstres'],
                        ['decor', 'Décors'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={elementFilterCategory === value}
                        onClick={() => setElementFilterCategory(value)}
                        className={`h-9 px-3 rounded-md text-sm ${
                          elementFilterCategory === value
                            ? 'bg-fantasy-accent text-fantasy-bg font-bold'
                            : 'text-fantasy-text-soft hover:text-fantasy-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
                  {filteredElements.map((el) => (
                    <article
                      key={el.id}
                      className="rounded-2xl bg-fantasy-surface border border-fantasy-border-soft overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-square bg-fantasy-surface">
                        <img
                          src={el.imageUrl}
                          alt=""
                          className="w-full h-full object-contain p-2"
                          loading="lazy"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-fantasy-bg/80 text-[11px] text-fantasy-text-soft">
                          {el.category === 'monster' ? 'Monstre' : 'Décor'}
                        </span>
                      </div>
                      <div className="p-3 flex flex-col gap-2">
                        <h3
                          className="font-bold text-[15px] truncate"
                          title={el.name}
                        >
                          {el.name}
                        </h3>
                        <div className="flex gap-1.5">
                          {el.category === 'monster' && (
                            <button
                              type="button"
                              onClick={() => openMonsterEditor(el)}
                              className={`${cardButton} flex-1`}
                            >
                              Fiche
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteElementId(el.id)}
                            className={`h-9 rounded-lg bg-red-400/10 text-red-300 hover:bg-red-400/20 flex items-center justify-center ${
                              el.category === 'monster'
                                ? 'w-9'
                                : 'flex-1 gap-1.5 text-sm'
                            }`}
                            aria-label={`Supprimer ${el.name}`}
                            title="Supprimer"
                          >
                            <Trash size={15} />
                            {el.category !== 'monster' && 'Supprimer'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  <DropZone
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    title="Glissez une image ici"
                    hint="Monstre ou décor"
                    minHeight="min-h-[220px]"
                    onFile={acceptElementFile}
                  />
                </div>
              </>
            )}

            {activeTab === 'music' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading font-semibold text-xl">
                      Musique d&apos;ambiance
                    </h2>
                    <p className="text-sm text-fantasy-muted">
                      Lancez-la depuis la table (onglet Musique) : tous les
                      joueurs l&apos;entendent en même temps.
                    </p>
                  </div>
                  <div>
                    <input
                      ref={musicFileRef}
                      type="file"
                      accept=".mp3,.ogg,.wav,.m4a"
                      className="hidden"
                      onChange={handleMusicUpload}
                    />
                    <button
                      type="button"
                      onClick={() => musicFileRef.current?.click()}
                      disabled={musicUploading}
                      className={primaryButton}
                    >
                      {musicUploading ? 'Envoi…' : '+ Ajouter une piste'}
                    </button>
                  </div>
                </div>
                {tracks.length > 0 && (
                  <ul className="rounded-2xl border border-fantasy-surface divide-y divide-fantasy-surface overflow-hidden">
                    {tracks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 px-4 py-2.5 bg-fantasy-surface"
                      >
                        <span className="text-fantasy-accent">
                          <Music size={18} />
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[15px]">
                          {t.filename.replace(/\.[a-z0-9]+$/i, '')}
                        </span>
                        <audio
                          src={t.url}
                          controls
                          preload="none"
                          className="h-9 max-w-[260px]"
                          aria-label={`Écouter ${t.filename}`}
                        />
                        <button
                          type="button"
                          onClick={() => setDeleteTrackId(t.id)}
                          className="h-9 w-9 shrink-0 rounded-lg bg-red-400/10 text-red-300 hover:bg-red-400/20 flex items-center justify-center"
                          aria-label={`Supprimer ${t.filename}`}
                          title="Supprimer"
                        >
                          <Trash size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <DropZone
                  accept=".mp3,.ogg,.wav,.m4a"
                  title="Glissez un fichier audio ici"
                  hint="MP3, OGG, WAV ou M4A"
                  minHeight="min-h-[140px]"
                  onFile={uploadMusicFile}
                />
              </>
            )}

            {activeTab === 'editor' && (
              <div className="h-[calc(100vh-10rem)] min-h-[480px]">
                <MapEditor
                  gameId={gameId}
                  maps={maps}
                  elements={elements}
                  onMapsChange={loadMaps}
                  onElementsChange={loadElements}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Zone de dépôt de fichier (clic ou glisser-déposer). */
function DropZone({
  accept,
  title,
  hint,
  minHeight,
  onFile,
}: {
  accept: string;
  title: string;
  hint: string;
  minHeight: string;
  onFile: (file: File | undefined) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
      className={`${minHeight} rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-5 text-center cursor-pointer transition-colors ${
        over
          ? 'border-fantasy-accent bg-fantasy-accent/5'
          : 'border-fantasy-border-soft hover:border-fantasy-border'
      }`}
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="text-fantasy-accent"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
      </svg>
      <span className="text-[15px] text-fantasy-text">{title}</span>
      <span className="text-[13px] text-fantasy-muted">
        {hint} · ou cliquez pour choisir
      </span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
