import { useRef, useState } from 'react';
import type { Handout } from '../../realtime/protocol';
import { Eye, EyeOff, Trash } from './icons';

interface HandoutsTabProps {
  isGM: boolean;
  handouts: Handout[];
  onOpen: (id: number) => void;
  onCreate?: (title: string, body: string, file?: File) => Promise<boolean>;
  onShow?: (id: number) => void;
  onHide?: (id: number) => void;
  onDelete?: (id: number) => void;
}

/**
 * Onglet Documents. Le MJ prépare des documents et les montre aux joueurs ;
 * un joueur retrouve ici tout ce qui lui a été montré.
 */
export function HandoutsTab({
  isGM,
  handouts,
  onOpen,
  onCreate,
  onShow,
  onHide,
  onDelete,
}: HandoutsTabProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = [...handouts].sort((a, b) => b.id - a.id);

  const submit = async () => {
    if (!onCreate || busy) return;
    setBusy(true);
    const ok = await onCreate(title, body, file ?? undefined);
    setBusy(false);
    if (ok) {
      setTitle('');
      setBody('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const input =
    'w-full rounded-lg bg-fantasy-bg border border-fantasy-border-soft px-3 text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent';

  return (
    <div className="flex flex-col gap-4">
      {isGM && onCreate && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-fantasy-muted">
            Préparez une lettre, un plan ou un portrait, puis montrez-le : il
            s&apos;ouvre chez tous les joueurs.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex. Lettre du baron)"
            aria-label="Titre du document"
            className={`${input} h-10`}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Texte (facultatif)"
            aria-label="Texte du document"
            rows={3}
            className={`${input} py-2 resize-y`}
          />
          <label className="text-sm text-fantasy-text-soft flex items-center gap-2">
            <span className="shrink-0">Image</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-w-0 text-[13px] file:mr-2 file:px-2.5 file:h-8 file:rounded-lg file:border-0 file:bg-fantasy-input-soft file:text-fantasy-text"
            />
          </label>
          <button
            type="submit"
            disabled={busy || (!body.trim() && !file)}
            className="h-10 rounded-lg bg-fantasy-accent text-fantasy-bg font-semibold disabled:opacity-50"
          >
            {busy ? 'Ajout…' : 'Ajouter le document'}
          </button>
        </form>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-fantasy-muted-soft italic">
          {isGM
            ? 'Aucun document pour l’instant.'
            : 'Le MJ ne vous a encore montré aucun document.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-2.5 p-2 rounded-xl bg-fantasy-input-soft/60"
            >
              <button
                type="button"
                onClick={() => onOpen(h.id)}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                title="Ouvrir"
              >
                {h.imageUrl ? (
                  <img
                    src={h.imageUrl}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-lg bg-fantasy-bg flex items-center justify-center text-xl shrink-0">
                    📜
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-semibold truncate">
                    {h.title}
                  </span>
                  {isGM && (
                    <span
                      className={`text-xs ${h.shown ? 'text-fantasy-accent' : 'text-fantasy-muted'}`}
                    >
                      {h.shown ? 'Montré aux joueurs' : 'Caché'}
                    </span>
                  )}
                </span>
              </button>
              {isGM && (
                <>
                  <button
                    type="button"
                    onClick={() => onShow?.(h.id)}
                    className="h-9 px-2.5 rounded-lg bg-fantasy-accent text-fantasy-bg text-[13px] font-semibold shrink-0"
                    title={
                      h.shown
                        ? 'Le rouvrir chez tous les joueurs'
                        : 'Le montrer aux joueurs'
                    }
                  >
                    {h.shown ? 'Remontrer' : 'Montrer'}
                  </button>
                  {h.shown && (
                    <button
                      type="button"
                      onClick={() => onHide?.(h.id)}
                      className="icon-btn !w-9 !h-9 shrink-0"
                      aria-label={`Cacher ${h.title} aux joueurs`}
                      title="Cacher aux joueurs"
                    >
                      <EyeOff size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete?.(h.id)}
                    className="icon-btn !w-9 !h-9 shrink-0 hover:!text-fantasy-error"
                    aria-label={`Supprimer ${h.title}`}
                    title="Supprimer"
                  >
                    <Trash size={16} />
                  </button>
                </>
              )}
              {!isGM && (
                <span className="text-fantasy-muted shrink-0" aria-hidden>
                  <Eye size={16} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
