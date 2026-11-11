import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Close } from '../tabletop/icons';
import { GuideView } from './GuideView';

interface GuideDrawerProps {
  isGM: boolean;
  onClose: () => void;
}

/** Le guide ouvert pendant une partie, par-dessus la table. */
export function GuideDrawer({ isGM, onClose }: GuideDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Échap ferme le guide, sauf pendant la saisie d'une recherche.
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement))
        onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Guide du jeu"
        className="glass w-full sm:w-[560px] h-full sm:h-[calc(100%-2rem)] sm:my-4 sm:mr-4 sm:rounded-2xl flex flex-col p-4 gap-3 animate-[fadeIn_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3">
          <h2 className="flex-1 font-heading text-xl font-bold">
            Guide du jeu
          </h2>
          <Link
            to="/guide"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-fantasy-muted hover:text-fantasy-text"
            title="Ouvrir le guide dans un nouvel onglet"
          >
            Plein écran ↗
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn !w-9 !h-9"
            aria-label="Fermer le guide"
          >
            <Close size={18} />
          </button>
        </header>
        <div className="flex-1 min-h-0">
          <GuideView compact defaultAudience={isGM ? 'toutes' : 'joueur'} />
        </div>
      </aside>
    </div>
  );
}
