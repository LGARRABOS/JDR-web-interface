import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LibraryAPI } from '../api/client';
import { ResourcesPage } from './ResourcesPage';

/** Bibliothèque personnelle : la page Ressources, hors de toute partie. */
export function LibraryPage() {
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    LibraryAPI.get()
      .then(({ data }) => {
        if (!cancelled) setGameId((data as { gameId: number }).gameId);
      })
      .catch(() => {
        if (!cancelled) navigate('/games');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (gameId == null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-fantasy-muted-soft">Chargement...</p>
      </div>
    );
  }
  return <ResourcesPage libraryGameId={gameId} />;
}
