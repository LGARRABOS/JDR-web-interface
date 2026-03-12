import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  WIKI_ARTICLES,
  WIKI_CATEGORIES,
  getAllTags,
  searchArticles,
  type WikiArticle,
} from '../data/wikiContent';

export function WikiPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(
    () =>
      WIKI_ARTICLES.find((a) => a.category === 'Démarrage') ?? WIKI_ARTICLES[0]
  );

  const allTags = useMemo(() => getAllTags(), []);

  const filteredArticles = useMemo(
    () => searchArticles(searchQuery, activeTag ?? undefined),
    [searchQuery, activeTag]
  );

  const articlesByCategory = useMemo(() => {
    const byCat: Record<string, WikiArticle[]> = {};
    filteredArticles.forEach((a) => {
      if (!byCat[a.category]) byCat[a.category] = [];
      byCat[a.category].push(a);
    });
    return byCat;
  }, [filteredArticles]);

  useEffect(() => {
    if (
      selectedArticle &&
      !filteredArticles.some((a) => a.id === selectedArticle.id)
    ) {
      setSelectedArticle(
        filteredArticles[0] ??
          WIKI_ARTICLES.find((a) => a.category === 'Démarrage') ??
          null
      );
    }
  }, [filteredArticles, selectedArticle]);

  const handleSelectArticle = (article: WikiArticle) => {
    setSelectedArticle(article);
    setSidebarOpen(false);
  };

  const handleTagClick = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b border-fantasy-border-soft bg-fantasy-surface">
        <div className="flex items-center gap-4">
          <Link
            to="/games"
            className="text-fantasy-muted-soft hover:text-fantasy-text-soft"
          >
            ← Retour
          </Link>
          <h1 className="text-xl font-bold font-heading text-fantasy-text-soft">
            Wiki Table JDR
          </h1>
        </div>
        <div className="flex-1 sm:max-w-md">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans le wiki..."
            className="w-full rounded bg-fantasy-input-soft px-4 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
            aria-label="Rechercher"
          />
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Tags - barre horizontale sous le header */}
        <div className="shrink-0 px-4 py-3 border-b border-fantasy-border-soft bg-fantasy-surface/30">
          <p className="text-xs text-fantasy-muted-soft mb-2">
            Filtrer par tag
          </p>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTag === tag
                    ? 'bg-fantasy-accent text-fantasy-bg'
                    : 'bg-fantasy-input-soft/80 text-fantasy-muted-soft hover:bg-fantasy-input-hover-soft hover:text-fantasy-text-soft'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden relative min-h-0">
          {/* Mobile: select pour articles (menu déroulant) */}
          <div className="sm:hidden shrink-0 p-4 border-b border-fantasy-border-soft bg-fantasy-surface/50">
            <select
              value={selectedArticle?.id ?? ''}
              onChange={(e) => {
                const a = filteredArticles.find((x) => x.id === e.target.value);
                if (a) handleSelectArticle(a);
              }}
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft border border-fantasy-border-soft"
            >
              {filteredArticles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.category} — {a.title}
                </option>
              ))}
            </select>
          </div>
          {/* Sidebar - Categories & Articles (desktop: visible, mobile: overlay avec bouton) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="sm:hidden fixed bottom-4 right-4 z-20 px-4 py-2 rounded-lg bg-fantasy-accent text-fantasy-bg text-sm font-medium shadow-lg"
          >
            {sidebarOpen ? 'Fermer' : 'Menu'}
          </button>
          {sidebarOpen && (
            <div
              className="sm:hidden fixed inset-0 bg-black/50 z-[9]"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
          )}
          <aside
            className={`w-56 shrink-0 border-r border-fantasy-border-soft bg-fantasy-surface/80 overflow-y-auto sm:block ${
              sidebarOpen
                ? 'fixed inset-y-0 left-0 z-10 pt-16 block'
                : 'hidden sm:block'
            }`}
          >
            <nav className="p-4 space-y-4">
              {WIKI_CATEGORIES.filter(
                (cat) => articlesByCategory[cat]?.length
              ).map((category) => (
                <div key={category}>
                  <h2 className="text-sm font-semibold text-fantasy-accent mb-2">
                    {category}
                  </h2>
                  <ul className="space-y-1">
                    {(articlesByCategory[category] ?? []).map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectArticle(article)}
                          className={`w-full text-left px-3 py-1.5 rounded text-sm truncate block ${
                            selectedArticle?.id === article.id
                              ? 'bg-fantasy-accent/20 text-fantasy-accent font-medium'
                              : 'text-fantasy-muted-soft hover:bg-fantasy-input-soft hover:text-fantasy-text-soft'
                          }`}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {filteredArticles.length === 0 && (
                <p className="text-sm text-fantasy-muted-soft">
                  Aucun article trouvé.
                </p>
              )}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-6">
            {selectedArticle ? (
              <article className="max-w-2xl">
                <h1 className="text-2xl font-bold font-heading text-fantasy-text-soft mb-2">
                  {selectedArticle.title}
                </h1>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selectedArticle.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-xs bg-fantasy-input-soft text-fantasy-muted-soft"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="prose prose-invert max-w-none text-fantasy-text-soft space-y-3">
                  {selectedArticle.content.split(/\n\n+/).map((para, i) => (
                    <p
                      key={i}
                      className="text-fantasy-text-soft leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </article>
            ) : (
              <p className="text-fantasy-muted-soft">
                Sélectionnez un article dans le menu de gauche.
              </p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
