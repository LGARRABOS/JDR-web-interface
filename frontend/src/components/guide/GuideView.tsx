import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GUIDE_CHAPTERS,
  QUICK_START,
  getArticle,
  neighbours,
  searchGuide,
  type Audience,
  type GuideArticle,
} from '../../data/guide';
import { parseGuide, type Inline } from './guideMarkup';

type AudienceFilter = Audience | 'toutes';

const AUDIENCE_LABEL: Record<Audience, string> = {
  tous: 'Tout le monde',
  joueur: 'Joueur',
  mj: 'MJ',
};

function AudienceBadge({ audience }: { audience: Audience }) {
  if (audience === 'tous') return null;
  return (
    <span
      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
        audience === 'mj'
          ? 'bg-fantasy-accent text-fantasy-bg'
          : 'bg-fantasy-input-soft text-fantasy-text-soft'
      }`}
    >
      {AUDIENCE_LABEL[audience]}
    </span>
  );
}

function InlineText({
  parts,
  onLink,
}: {
  parts: Inline[];
  onLink: (id: string) => void;
}) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'bold' ? (
          <strong key={i} className="text-fantasy-text">
            {p.text}
          </strong>
        ) : p.kind === 'link' ? (
          <button
            key={i}
            type="button"
            onClick={() => onLink(p.id)}
            className="text-fantasy-accent underline underline-offset-2 hover:text-fantasy-accent-hover"
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function ArticleBody({
  body,
  onLink,
}: {
  body: string;
  onLink: (id: string) => void;
}) {
  const blocks = useMemo(() => parseGuide(body), [body]);
  return (
    <div className="flex flex-col gap-3.5 text-[15px] leading-relaxed text-fantasy-text-soft">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <h3
                key={i}
                className="font-heading text-lg font-semibold text-fantasy-text mt-2"
              >
                <InlineText parts={b.text} onLink={onLink} />
              </h3>
            );
          case 'tip':
            return (
              <aside
                key={i}
                className="flex gap-2.5 rounded-xl border border-fantasy-accent/40 bg-fantasy-accent/10 px-3.5 py-2.5 text-sm"
              >
                <span aria-hidden>💡</span>
                <p>
                  <InlineText parts={b.text} onLink={onLink} />
                </p>
              </aside>
            );
          case 'steps':
            return (
              <ol key={i} className="flex flex-col gap-2">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 mt-0.5 rounded-full bg-fantasy-accent text-fantasy-bg text-xs font-bold flex items-center justify-center">
                      {j + 1}
                    </span>
                    <span>
                      <InlineText parts={it} onLink={onLink} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case 'bullets':
            return (
              <ul key={i} className="flex flex-col gap-1.5 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span
                      className="shrink-0 mt-2.5 w-1.5 h-1.5 rounded-full bg-fantasy-accent"
                      aria-hidden
                    />
                    <span>
                      <InlineText parts={it} onLink={onLink} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i}>
                <InlineText parts={b.text} onLink={onLink} />
              </p>
            );
        }
      })}
    </div>
  );
}

function ArticleCard({
  a,
  onOpen,
  showChapter,
}: {
  a: GuideArticle;
  onOpen: (id: string) => void;
  showChapter?: boolean;
}) {
  const chapter = GUIDE_CHAPTERS.find((c) => c.id === a.chapter);
  return (
    <button
      type="button"
      onClick={() => onOpen(a.id)}
      className="w-full text-left rounded-xl px-3.5 py-3 bg-fantasy-input-soft/50 hover:bg-fantasy-input-soft border border-transparent hover:border-fantasy-border-soft"
    >
      <span className="flex items-center gap-2">
        <span className="flex-1 min-w-0 font-semibold text-fantasy-text truncate">
          {a.title}
        </span>
        <AudienceBadge audience={a.audience} />
      </span>
      <span className="block text-sm text-fantasy-muted mt-0.5">
        {showChapter && chapter ? `${chapter.title} · ` : ''}
        {a.summary}
      </span>
    </button>
  );
}

interface GuideViewProps {
  /** Rôle du lecteur : sert de filtre par défaut. */
  defaultAudience?: AudienceFilter;
  /** Article à ouvrir au départ (sinon l'accueil du guide). */
  initialArticleId?: string | null;
  /** Mise en page sur une colonne (panneau en partie, téléphone). */
  compact?: boolean;
  /** Appelé quand l'article affiché change (pour l'adresse de la page). */
  onArticleChange?: (id: string | null) => void;
}

/** Le guide du jeu : accueil, recherche, chapitres et articles. */
export function GuideView({
  defaultAudience = 'toutes',
  initialArticleId = null,
  compact = false,
  onArticleChange,
}: GuideViewProps) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>(defaultAudience);
  const [articleId, setArticleId] = useState<string | null>(
    getArticle(initialArticleId) ? initialArticleId : null
  );
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Navigation de la page (lien direct, bouton Précédent du navigateur).
  useEffect(() => {
    setArticleId(getArticle(initialArticleId) ? initialArticleId : null);
  }, [initialArticleId]);

  const open = (id: string | null) => {
    setArticleId(id);
    setQuery('');
    onArticleChange?.(id);
    contentRef.current?.scrollTo({ top: 0 });
  };

  const results = useMemo(
    () => searchGuide(query, audience),
    [query, audience]
  );
  const article = getArticle(articleId);
  const searching = query.trim() !== '';

  const filters: { id: AudienceFilter; label: string }[] = [
    { id: 'toutes', label: 'Tout' },
    { id: 'joueur', label: 'Joueur' },
    { id: 'mj', label: 'MJ' },
  ];

  const header = (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher : brouillard, dés, importer un fichier…"
        aria-label="Rechercher dans le guide"
        className="flex-1 h-11 px-4 rounded-xl bg-fantasy-bg border border-fantasy-border-soft text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent"
      />
      <div
        role="group"
        aria-label="Afficher les articles pour"
        className="flex gap-1 p-1 rounded-xl bg-fantasy-input-soft/60 shrink-0"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={audience === f.id}
            onClick={() => setAudience(f.id)}
            className={`h-9 px-3 rounded-lg text-sm ${
              audience === f.id
                ? 'bg-fantasy-surface text-fantasy-text font-bold'
                : 'text-fantasy-muted hover:text-fantasy-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );

  const chapterArticles = (chapterId: string) =>
    results.filter((a) => a.chapter === chapterId);

  const home = (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-heading text-xl font-bold mb-3">
          Par où commencer ?
        </h2>
        <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
          {(['joueur', 'mj'] as const)
            .filter((r) => audience === 'toutes' || audience === r)
            .map((role) => (
              <div
                key={role}
                className="rounded-2xl border border-fantasy-border-soft bg-fantasy-input-soft/40 p-4"
              >
                <p className="font-heading font-semibold mb-2">
                  {role === 'joueur' ? '🧝 Je suis joueur' : '🧙 Je suis MJ'}
                </p>
                <ol className="flex flex-col gap-1.5">
                  {QUICK_START[role].map((id, i) => {
                    const a = getArticle(id)!;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => open(id)}
                          className="flex items-center gap-2.5 text-left text-sm hover:text-fantasy-accent"
                        >
                          <span className="shrink-0 w-5 h-5 rounded-full bg-fantasy-accent text-fantasy-bg text-[11px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          {a.title}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
        </div>
      </section>
      <section>
        <h2 className="font-heading text-xl font-bold mb-3">Chapitres</h2>
        <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
          {GUIDE_CHAPTERS.map((c) => {
            const list = chapterArticles(c.id);
            if (list.length === 0) return null;
            const expanded = openChapter === c.id;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-fantasy-border-soft overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenChapter(expanded ? null : c.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-fantasy-input-soft/50"
                >
                  <span className="text-2xl" aria-hidden>
                    {c.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{c.title}</span>
                    <span className="block text-sm text-fantasy-muted truncate">
                      {c.description}
                    </span>
                  </span>
                  <span className="text-sm text-fantasy-muted tabular-nums">
                    {list.length}
                  </span>
                </button>
                {expanded && (
                  <ul className="border-t border-fantasy-border-soft p-1.5 flex flex-col">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => open(a.id)}
                          className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm hover:bg-fantasy-input-soft"
                        >
                          <span className="flex-1 min-w-0 truncate">
                            {a.title}
                          </span>
                          <AudienceBadge audience={a.audience} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const searchView = (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fantasy-muted">
        {results.length === 0
          ? 'Aucun article ne correspond. Essayez un autre mot.'
          : `${results.length} article${results.length > 1 ? 's' : ''}`}
      </p>
      {results.map((a) => (
        <ArticleCard key={a.id} a={a} onOpen={open} showChapter />
      ))}
    </div>
  );

  const articleView = article && (
    <article className="flex flex-col gap-4 max-w-2xl">
      <nav className="flex items-center gap-2 text-sm text-fantasy-muted">
        <button
          type="button"
          onClick={() => open(null)}
          className="hover:text-fantasy-text"
        >
          ← Guide
        </button>
        <span aria-hidden>/</span>
        <span>
          {GUIDE_CHAPTERS.find((c) => c.id === article.chapter)?.title}
        </span>
      </nav>
      <header className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <h1 className="flex-1 font-heading text-2xl font-bold text-fantasy-text">
            {article.title}
          </h1>
          <span className="mt-1.5">
            <AudienceBadge audience={article.audience} />
          </span>
        </div>
        <p className="text-fantasy-muted">{article.summary}</p>
      </header>
      <ArticleBody body={article.body} onLink={open} />
      {article.related && article.related.length > 0 && (
        <section className="mt-2">
          <h2 className="text-sm font-semibold text-fantasy-muted uppercase tracking-wide mb-2">
            Voir aussi
          </h2>
          <div className="flex flex-col gap-2">
            {article.related.map((id) => {
              const r = getArticle(id);
              return r ? <ArticleCard key={id} a={r} onOpen={open} /> : null;
            })}
          </div>
        </section>
      )}
      <PrevNext id={article.id} onOpen={open} />
    </article>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-4 min-h-0 h-full">
        {header}
        <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
          {searching ? searchView : (articleView ?? home)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      {header}
      <div className="flex-1 min-h-0 flex gap-6">
        <nav
          aria-label="Sommaire du guide"
          className="hidden lg:block w-64 shrink-0 overflow-y-auto pr-2"
        >
          <button
            type="button"
            onClick={() => open(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-2 ${
              article
                ? 'hover:bg-fantasy-input-soft'
                : 'bg-fantasy-input-soft font-bold'
            }`}
          >
            Accueil du guide
          </button>
          {GUIDE_CHAPTERS.map((c) => {
            const list = chapterArticles(c.id);
            if (list.length === 0) return null;
            return (
              <div key={c.id} className="mb-3">
                <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-fantasy-accent">
                  {c.icon} {c.title}
                </p>
                <ul>
                  {list.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => open(a.id)}
                        aria-current={a.id === articleId ? 'page' : undefined}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm truncate ${
                          a.id === articleId
                            ? 'bg-fantasy-accent/20 text-fantasy-accent font-semibold'
                            : 'text-fantasy-muted hover:text-fantasy-text hover:bg-fantasy-input-soft'
                        }`}
                      >
                        {a.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto pr-1">
          {searching ? searchView : (articleView ?? home)}
        </div>
      </div>
    </div>
  );
}

function PrevNext({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (id: string) => void;
}) {
  const { prev, next } = neighbours(id);
  return (
    <div className="mt-4 pt-4 border-t border-fantasy-border-soft grid grid-cols-2 gap-2">
      {prev ? (
        <button
          type="button"
          onClick={() => onOpen(prev.id)}
          className="text-left rounded-xl px-3 py-2 hover:bg-fantasy-input-soft"
        >
          <span className="block text-xs text-fantasy-muted">← Précédent</span>
          <span className="block text-sm font-semibold truncate">
            {prev.title}
          </span>
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={() => onOpen(next.id)}
          className="text-right rounded-xl px-3 py-2 hover:bg-fantasy-input-soft"
        >
          <span className="block text-xs text-fantasy-muted">Suivant →</span>
          <span className="block text-sm font-semibold truncate">
            {next.title}
          </span>
        </button>
      )}
    </div>
  );
}
