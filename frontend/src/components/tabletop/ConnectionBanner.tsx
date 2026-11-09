import type { ConnectionStatus } from '../../realtime/connection';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  failedAttempts: number;
  onRetry: () => void;
}

/** Bandeau affiché quand la connexion temps réel est coupée. */
export function ConnectionBanner({
  status,
  failedAttempts,
  onRetry,
}: ConnectionBannerProps) {
  if (status === 'open') return null;
  return (
    <div
      role="status"
      className="px-4 py-1.5 text-sm flex items-center justify-center gap-3 bg-amber-500/15 text-amber-200 border-b border-amber-500/30"
    >
      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      <span>
        {failedAttempts < 3
          ? 'Connexion au serveur…'
          : 'Connexion perdue — nouvelle tentative en cours. Vos modifications seront resynchronisées.'}
      </span>
      {failedAttempts >= 3 && (
        <button
          type="button"
          onClick={onRetry}
          className="underline hover:text-amber-100"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
