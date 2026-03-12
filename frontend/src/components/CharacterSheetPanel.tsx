import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterSheetsAPI } from '../api/client';
import {
  CharacterSheetForm,
  type CharacterSheetData,
} from './CharacterSheetForm';

interface Player {
  userId: number;
  displayName: string;
  characterName?: string;
}

interface CharacterSheetPanelProps {
  gameId: number;
  isGM: boolean;
  isGemma?: boolean;
  players?: Player[];
  onSheetSaved?: () => void;
}

export function CharacterSheetPanel({
  gameId,
  isGM,
  isGemma = false,
  players = [],
  onSheetSaved,
}: CharacterSheetPanelProps) {
  const [sheet, setSheet] = useState<{
    filename?: string;
    mimeType?: string;
    url?: string;
    data?: CharacterSheetData | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const loadSheet = useCallback(
    async (userId?: number) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await CharacterSheetsAPI.get(gameId, userId);
        setSheet(data as typeof sheet);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number } };
        if (err.response?.status === 404) {
          setSheet(null);
        } else {
          setError('Erreur lors du chargement');
        }
      } finally {
        setLoading(false);
      }
    },
    [gameId]
  );

  useEffect(() => {
    if (isGM && selectedUserId) {
      loadSheet(selectedUserId);
    } else if (!isGM) {
      loadSheet();
    } else {
      setSheet(null);
    }
  }, [isGM, selectedUserId, loadSheet]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.pdf', '.doc', '.docx'].includes(ext)) {
        setError('Format non autorisé (PDF, .doc, .docx uniquement)');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Fichier trop volumineux (max 10 Mo)');
        return;
      }
      setUploading(true);
      setError(null);
      try {
        await CharacterSheetsAPI.upload(gameId, file);
        loadSheet();
      } catch {
        setError("Erreur lors de l'upload");
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [gameId, loadSheet]
  );

  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetModalOpen(false);
    };
    if (sheetModalOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      loadSheet(isGM ? (selectedUserId ?? undefined) : undefined);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [sheetModalOpen, isGM, selectedUserId, loadSheet]);

  const handleCloseSheetModal = useCallback(() => {
    setSheetModalOpen(false);
    loadSheet(isGM ? (selectedUserId ?? undefined) : undefined);
  }, [loadSheet, isGM, selectedUserId]);

  if (isGemma) {
    return (
      <>
        <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
          <h3 className="text-sm font-semibold font-heading mb-3 text-fantasy-text-soft">
            Fiche personnage
          </h3>
          {isGM ? (
            <div className="space-y-2">
              <label className="block text-xs text-fantasy-muted-soft">
                Consulter la fiche de
              </label>
              <select
                value={selectedUserId ?? ''}
                onChange={(e) =>
                  setSelectedUserId(
                    e.target.value ? parseInt(e.target.value, 10) : null
                  )
                }
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm border border-fantasy-border-soft"
              >
                <option value="">— Sélectionner un joueur —</option>
                {players.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.characterName || u.displayName || `Joueur ${u.userId}`}
                  </option>
                ))}
              </select>
              {selectedUserId && (
                <>
                  {loading ? (
                    <p className="text-sm text-fantasy-muted-soft">
                      Chargement...
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheetModalOpen(true)}
                      className="w-full mt-2 px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
                    >
                      Voir la fiche
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {loading ? (
                <p className="text-sm text-fantasy-muted-soft">Chargement...</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setSheetModalOpen(true)}
                  className="w-full px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
                >
                  Éditer ma fiche personnage
                </button>
              )}
            </>
          )}
        </div>

        {sheetModalOpen && (
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(e) =>
              (e.target as HTMLElement) === overlayRef.current &&
              handleCloseSheetModal()
            }
          >
            <div
              className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-fantasy-border-soft flex items-center justify-between">
                <h2 className="text-lg font-semibold font-heading text-fantasy-text-soft">
                  {isGM ? 'Fiche personnage' : 'Ma fiche personnage'}
                </h2>
                <button
                  type="button"
                  onClick={handleCloseSheetModal}
                  className="text-fantasy-muted-soft hover:text-fantasy-text-soft text-2xl leading-none"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {loading ? (
                  <p className="text-sm text-fantasy-muted-soft py-8 text-center">
                    Chargement de la fiche...
                  </p>
                ) : (
                  <CharacterSheetForm
                    gameId={gameId}
                    initialData={sheet?.data ?? null}
                    readOnly={isGM}
                    onSaveSuccess={onSheetSaved}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-3 text-fantasy-text-soft">
        Fiche personnage
      </h3>
      {isGM ? (
        <div className="space-y-2">
          <label className="block text-xs text-fantasy-muted-soft">
            Consulter la fiche de
          </label>
          <select
            value={selectedUserId ?? ''}
            onChange={(e) =>
              setSelectedUserId(
                e.target.value ? parseInt(e.target.value, 10) : null
              )
            }
            className="w-full rounded bg-fantasy-input px-3 py-2 text-sm border border-fantasy-border"
          >
            <option value="">— Sélectionner un joueur —</option>
            {players.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.characterName || u.displayName || `Joueur ${u.userId}`}
              </option>
            ))}
          </select>
          {selectedUserId && (
            <>
              {loading ? (
                <p className="text-sm text-fantasy-muted-soft">Chargement...</p>
              ) : sheet?.url ? (
                <a
                  href={sheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-fantasy-accent-hover hover:underline"
                >
                  Voir : {sheet.filename}
                </a>
              ) : (
                <p className="text-sm text-fantasy-muted-soft">
                  Aucune fiche pour ce joueur
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="block text-xs text-fantasy-muted-soft">
              PDF ou .docx (max 10 Mo)
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              disabled={uploading}
              className="block w-full text-sm text-fantasy-muted-soft file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-fantasy-input-soft file:text-fantasy-text-soft"
            />
            {error && <p className="text-sm text-fantasy-error">{error}</p>}
            {uploading && (
              <p className="text-sm text-fantasy-muted-soft">
                Envoi en cours...
              </p>
            )}
          </div>
          {loading ? (
            <p className="mt-2 text-sm text-fantasy-muted-soft">
              Chargement...
            </p>
          ) : sheet?.url ? (
            <div className="mt-3">
              <a
                href={sheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-fantasy-accent-hover hover:underline"
              >
                Voir ma fiche : {sheet.filename}
              </a>
              {sheet.mimeType === 'application/pdf' && (
                <iframe
                  src={sheet.url}
                  title={sheet.filename}
                  className="mt-2 w-full h-64 rounded border border-fantasy-border bg-white"
                />
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fantasy-muted-soft">
              Aucune fiche uploadée
            </p>
          )}
        </>
      )}
    </div>
  );
}
