import { useCallback, useEffect, useState } from 'react';
import { CharacterSheetsAPI } from '../api/client';

interface Player {
  userId: number;
  displayName: string;
  characterName?: string;
}

interface CharacterSheetPanelProps {
  gameId: number;
  isGM: boolean;
  players?: Player[];
}

export function CharacterSheetPanel({
  gameId,
  isGM,
  players = [],
}: CharacterSheetPanelProps) {
  const [sheet, setSheet] = useState<{
    filename: string;
    mimeType: string;
    url: string;
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
        setSheet(data);
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
              ) : sheet ? (
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
          ) : sheet ? (
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
