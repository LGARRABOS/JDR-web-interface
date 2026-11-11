import { useMemo, useState } from 'react';
import type {
  DocBlock,
  DocRun,
  ImportedContent,
} from '../../realtime/protocol';
import { columnLetter, visibleRows, type SortState } from './sheetView';

function Runs({ runs }: { runs?: DocRun[] }) {
  return (
    <>
      {(runs ?? []).map((r, i) => {
        let node: React.ReactNode = r.t;
        if (r.b) node = <strong>{node}</strong>;
        if (r.i) node = <em>{node}</em>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function SimpleTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-lg border border-fantasy-border-soft">
      <table className="w-full text-sm border-collapse">
        {head && (
          <thead className="bg-fantasy-input-soft">
            <tr>
              {head.map((c, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold border-b border-fantasy-border-soft whitespace-pre-wrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="odd:bg-fantasy-bg/40">
              {r.map((c, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 align-top border-b border-fantasy-border-soft/50 whitespace-pre-wrap"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-2xl font-bold mt-2',
  2: 'text-xl font-bold mt-2',
  3: 'text-lg font-semibold mt-1',
};

/** Document importé (Word, LibreOffice, texte, Markdown). */
function DocumentView({ blocks }: { blocks: DocBlock[] }) {
  return (
    <article className="flex flex-col gap-3 text-[15px] leading-relaxed text-fantasy-text-soft">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const Tag = `h${Math.min(b.level ?? 1, 6)}` as 'h1';
            return (
              <Tag
                key={i}
                className={`font-heading text-fantasy-text ${HEADING_CLASS[b.level ?? 1] ?? 'font-semibold'}`}
              >
                <Runs runs={b.runs} />
              </Tag>
            );
          }
          case 'list':
            return (
              <ul key={i} className="list-disc pl-6 flex flex-col gap-1">
                {(b.items ?? []).map((it, j) => (
                  <li key={j} className="whitespace-pre-wrap">
                    <Runs runs={it} />
                  </li>
                ))}
              </ul>
            );
          case 'table':
            return <SimpleTable key={i} rows={b.rows ?? []} />;
          default:
            return (
              <p key={i} className="whitespace-pre-wrap">
                <Runs runs={b.runs} />
              </p>
            );
        }
      })}
    </article>
  );
}

/** Tableur importé : onglets des feuilles, recherche et tri par colonne. */
function SheetView({
  sheets,
}: {
  sheets: { name: string; rows: string[][] }[];
}) {
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const { header, body } = useMemo(
    () => visibleRows(sheet?.rows ?? [], query, sort),
    [sheet, query, sort]
  );
  const cols = Math.max(header.length, ...body.map((r) => r.length), 0);

  if (!sheet) return null;
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        {sheets.length > 1 && (
          <div
            role="tablist"
            aria-label="Feuilles"
            className="flex gap-1 overflow-x-auto max-w-full"
          >
            {sheets.map((s, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => {
                  setActive(i);
                  setSort(null);
                }}
                className={`h-8 px-3 rounded-lg text-sm whitespace-nowrap ${
                  i === active
                    ? 'bg-fantasy-accent text-fantasy-bg font-semibold'
                    : 'bg-fantasy-input-soft hover:bg-fantasy-input-hover'
                }`}
              >
                {s.name || `Feuille ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher dans le tableau…"
          aria-label="Rechercher dans le tableau"
          className="ml-auto h-9 w-full sm:w-64 px-3 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-sm focus:outline-none focus:border-fantasy-accent"
        />
      </div>
      <div className="overflow-auto rounded-lg border border-fantasy-border-soft max-h-[60vh]">
        <table className="text-sm border-collapse min-w-full">
          <thead className="sticky top-0 bg-fantasy-surface z-10">
            <tr>
              {Array.from({ length: cols }, (_, i) => {
                const dir = sort?.col === i ? sort.dir : 0;
                return (
                  <th
                    key={i}
                    aria-sort={
                      dir === 1
                        ? 'ascending'
                        : dir === -1
                          ? 'descending'
                          : 'none'
                    }
                    className="px-0 border-b border-fantasy-border-soft text-left"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          dir === 0
                            ? { col: i, dir: 1 }
                            : dir === 1
                              ? { col: i, dir: -1 }
                              : null
                        )
                      }
                      className="w-full px-3 py-2 text-left font-semibold hover:bg-fantasy-input-soft flex items-center gap-1 whitespace-nowrap"
                      title="Trier par cette colonne"
                    >
                      {header[i] || columnLetter(i)}
                      <span className="text-fantasy-muted text-xs">
                        {dir === 1 ? '▲' : dir === -1 ? '▼' : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className="odd:bg-fantasy-bg/40">
                {Array.from({ length: cols }, (_, j) => (
                  <td
                    key={j}
                    className="px-3 py-1.5 align-top border-b border-fantasy-border-soft/50 whitespace-pre-wrap max-w-[24rem]"
                  >
                    {r[j] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {body.length === 0 && (
          <p className="p-4 text-sm text-fantasy-muted-soft italic">
            {query ? 'Aucune ligne ne correspond.' : 'Feuille vide.'}
          </p>
        )}
      </div>
      <p className="text-xs text-fantasy-muted-soft">
        {body.length} ligne{body.length > 1 ? 's' : ''}
        {query ? ' trouvée' + (body.length > 1 ? 's' : '') : ''} · cliquez sur
        un en-tête pour trier
      </p>
    </div>
  );
}

/** Contenu converti d'un fichier importé. */
export function ImportedContentView({ content }: { content: ImportedContent }) {
  return (
    <div className="flex flex-col gap-3">
      {content.truncated && (
        <p className="text-sm rounded-lg px-3 py-2 bg-fantasy-input-soft text-fantasy-muted">
          Fichier très long : seul le début est affiché. Téléchargez
          l&apos;original pour tout voir.
        </p>
      )}
      {content.kind === 'sheet' ? (
        <SheetView sheets={content.sheets ?? []} />
      ) : (
        <DocumentView blocks={content.blocks ?? []} />
      )}
    </div>
  );
}
