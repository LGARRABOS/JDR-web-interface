import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { startVersionWatch } from './version';

/** Événements bloqués hors de la fenêtre d'actualisation (y compris les écouteurs posés sur window). */
const BLOCKED_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'pointerdown',
  'pointerup',
  'pointermove',
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'dblclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'dragstart',
  'drop',
] as const;

/** Raccourcis d'actualisation du navigateur, laissés passer. */
function isReloadShortcut(e: Event) {
  if (!(e instanceof KeyboardEvent)) return false;
  return (
    e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')
  );
}

/**
 * Quand une nouvelle version du site est déployée, affiche une fenêtre qui
 * demande d'actualiser la page et bloque toute autre action : le reste de la
 * page devient inerte et les clics, touches et molette sont interceptés.
 */
export function OutdatedVersionGuard() {
  const [outdated, setOutdated] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => startVersionWatch({ onOutdated: () => setOutdated(true) }),
    []
  );

  useEffect(() => {
    if (!outdated) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button')?.focus();

    const block = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && dialogRef.current?.contains(t)) return;
      if (isReloadShortcut(e)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    };
    for (const type of BLOCKED_EVENTS) {
      window.addEventListener(type, block, { capture: true, passive: false });
    }
    return () => {
      for (const type of BLOCKED_EVENTS) {
        window.removeEventListener(type, block, { capture: true });
      }
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      document.body.style.overflow = '';
    };
  }, [outdated]);

  if (!outdated) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="outdated-version-title"
      aria-describedby="outdated-version-text"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4"
    >
      <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft shadow-xl max-w-md w-full p-5 text-center">
        <h2
          id="outdated-version-title"
          className="text-lg font-semibold font-heading text-fantasy-text-soft"
        >
          Nouvelle version disponible
        </h2>
        <p
          id="outdated-version-text"
          className="mt-3 text-sm text-fantasy-text-soft"
        >
          Le site vient d'être mis à jour. Actualisez la page pour continuer à
          jouer sur la même version que les autres joueurs.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
        >
          Actualiser la page
        </button>
      </div>
    </div>,
    document.body
  );
}
