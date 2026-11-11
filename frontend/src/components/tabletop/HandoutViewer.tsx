import { useEffect, useState } from 'react';
import { HandoutsAPI } from '../../api/client';
import type { Handout, ImportedContent } from '../../realtime/protocol';
import { ImportedContentView } from './ImportedContentView';
import { Close } from './icons';

interface HandoutViewerProps {
  gameId: number;
  handout: Handout;
  onClose: () => void;
}

/** Document ouvert en grand : texte, image, fichier importé ou PDF. */
export function HandoutViewer({
  gameId,
  handout: h,
  onClose,
}: HandoutViewerProps) {
  const [content, setContent] = useState<ImportedContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setContent(null);
    setError(null);
    if (!h.hasContent) return;
    let cancelled = false;
    HandoutsAPI.content(gameId, h.id)
      .then(({ data }) => {
        if (!cancelled)
          setContent((data as { content: ImportedContent }).content);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger le document.');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, h.id, h.hasContent]);

  const wide = h.kind === 'sheet' || h.kind === 'pdf';
  const downloadUrl =
    h.fileUrl && h.fileName
      ? `${h.fileUrl}?download=${encodeURIComponent(h.fileName)}`
      : h.fileUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label={h.title}
        className={`glass rounded-2xl w-full ${wide ? 'max-w-6xl h-full' : 'max-w-3xl max-h-full'} overflow-hidden flex flex-col text-fantasy-text animate-[fadeIn_150ms_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-fantasy-border-soft">
          <h2 className="flex-1 min-w-0 font-heading text-lg font-semibold truncate">
            {h.title}
          </h2>
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="h-9 px-3 rounded-lg border border-fantasy-border-soft text-sm hover:bg-fantasy-input-soft flex items-center shrink-0"
              title={h.fileName}
            >
              Télécharger
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="icon-btn !w-9 !h-9 shrink-0"
            aria-label="Fermer"
          >
            <Close size={18} />
          </button>
        </header>
        <div
          className={`overflow-y-auto p-4 flex flex-col gap-4 ${wide ? 'flex-1 min-h-0' : ''}`}
        >
          {h.imageUrl && (
            <img
              src={h.imageUrl}
              alt={h.title}
              className="w-full max-h-[70vh] object-contain rounded-lg bg-black/30"
            />
          )}
          {h.body && (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fantasy-text-soft">
              {h.body}
            </p>
          )}
          {h.kind === 'pdf' && h.fileUrl && (
            <iframe
              src={h.fileUrl}
              title={h.title}
              className="w-full flex-1 min-h-[60vh] rounded-lg bg-white"
            />
          )}
          {h.hasContent && !content && !error && (
            <p className="text-sm text-fantasy-muted">Chargement…</p>
          )}
          {error && <p className="text-sm text-fantasy-error">{error}</p>}
          {content && <ImportedContentView content={content} />}
        </div>
      </section>
    </div>
  );
}
