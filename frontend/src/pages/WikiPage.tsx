import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GuideView } from '@/core/guide/GuideView';
import { BackLink, PageHeader, PageShell } from '@/shared/ui/PageShell';

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
    <PageShell
      fill
      header={
        <PageHeader
          title={
            <span className="font-heading text-lg tracking-wide">
              Guide du jeu
            </span>
          }
        >
          <BackLink to="/games">Mes parties</BackLink>
        </PageHeader>
      }
    >
      <main className="relative z-10 flex-1 min-h-0 w-full max-w-6xl mx-auto p-4 sm:p-6">
        <GuideView
          compact={!wide}
          initialArticleId={articleId}
          onArticleChange={(id) => navigate(id ? `/guide#${id}` : '/guide')}
        />
      </main>
    </PageShell>
  );
}
