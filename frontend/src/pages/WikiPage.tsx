import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GuideView } from '../components/guide/GuideView';
import { D20Logo } from './AuthPage';

/** Le guide du jeu en pleine page (/guide, et /guide#article). */
export function WikiPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, '')) || null;
  const [articleId, setArticleId] = useState<string | null>(fromHash);
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024
  );

  useEffect(() => setArticleId(fromHash), [fromHash]);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 h-16 border-b border-fantasy-border-soft bg-fantasy-surface/60">
        <Link
          to="/games"
          className="h-10 px-3 rounded-lg hover:bg-fantasy-input-soft flex items-center text-sm text-fantasy-muted hover:text-fantasy-text"
        >
          ← Mes parties
        </Link>
        <span className="flex items-center gap-2 font-heading text-lg font-bold">
          <D20Logo size={26} />
          Guide du jeu
        </span>
      </header>
      <main className="flex-1 min-h-0 w-full max-w-6xl mx-auto p-4 sm:p-6">
        <GuideView
          compact={!wide}
          initialArticleId={articleId}
          onArticleChange={(id) => navigate(id ? `/guide#${id}` : '/guide')}
        />
      </main>
    </div>
  );
}
