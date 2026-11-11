import { useEffect } from 'react';
import type { Handout } from '../../realtime/protocol';
import { Close } from './icons';

interface HandoutViewerProps {
  handout: Handout;
  onClose: () => void;
}

/** Document ouvert en grand (lettre, plan, portrait…). */
export function HandoutViewer({ handout: h, onClose }: HandoutViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label={h.title}
        className="glass rounded-2xl w-full max-w-3xl max-h-full overflow-hidden flex flex-col text-fantasy-text animate-[fadeIn_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-fantasy-border-soft">
          <h2 className="flex-1 font-heading text-lg font-semibold truncate">
            {h.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn !w-9 !h-9"
            aria-label="Fermer"
          >
            <Close size={18} />
          </button>
        </header>
        <div className="overflow-y-auto p-4 flex flex-col gap-4">
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
        </div>
      </section>
    </div>
  );
}
