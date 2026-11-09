import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, DiceRoll, Member } from '../../realtime/protocol';
import { colorForUser } from './presence';
import { Send } from './icons';
import { buildFeed, rollAccent, rollDetail, type FeedItem } from './feed';

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ChatFeedProps {
  messages: ChatMessage[];
  rolls: DiceRoll[];
  players: Member[];
  onSend: (content: string) => void;
}

/** Fil de discussion : messages et jets de dés mélangés par ordre chronologique. */
export function ChatFeed({ messages, rolls, players, onSend }: ChatFeedProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<FeedItem[]>(
    () => buildFeed(messages, rolls),
    [messages, rolls]
  );

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    onSend(v);
    setInput('');
  };

  const nameColor = (userId: number, role: string) =>
    role === 'MJ' ? '#c9a227' : colorForUser(userId, players).ring;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3"
      >
        {items.length === 0 && (
          <p className="m-auto text-sm text-fantasy-muted-soft text-center">
            Aucun message pour l&apos;instant.
            <br />
            Les jets de dés s&apos;afficheront aussi ici.
          </p>
        )}
        {items.map((item, idx) => {
          const prev = items[idx - 1];
          const showClock = !prev || item.at - prev.at > 10 * 60 * 1000;
          const key =
            item.kind === 'message'
              ? `m${item.message.id}`
              : `r${item.roll.id}`;
          return (
            <div key={key} className="flex flex-col gap-3">
              {showClock && item.at > 1e11 && (
                <div className="text-xs text-fantasy-muted-soft text-center">
                  {formatClock(item.at)}
                </div>
              )}
              {item.kind === 'message' ? (
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-[13px] font-bold"
                    style={{
                      color: nameColor(item.message.userId, item.message.role),
                    }}
                  >
                    {item.message.role === 'MJ'
                      ? 'MJ'
                      : (item.message.displayName ?? 'Joueur')}
                  </span>
                  <span className="text-[15px] leading-snug text-fantasy-text whitespace-pre-wrap break-words">
                    {item.message.content}
                  </span>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    item.roll.hidden
                      ? 'border border-dashed border-fantasy-border bg-fantasy-accent/5'
                      : 'border border-fantasy-border-soft bg-fantasy-surface'
                  }`}
                >
                  <span
                    className="w-12 h-12 shrink-0 rounded-lg bg-fantasy-bg flex items-center justify-center font-heading font-bold text-[22px] tabular-nums"
                    style={{
                      border: `1px solid ${item.roll.hidden ? '#4a4036' : '#c9a227'}`,
                      color:
                        rollAccent(item.roll) ??
                        (item.roll.hidden ? '#c9bda8' : '#e6c46a'),
                    }}
                  >
                    {item.roll.result}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-sm">
                      <strong>{item.roll.displayName ?? 'Joueur'}</strong>
                      {item.roll.hidden && (
                        <span className="text-fantasy-muted-soft">
                          {' '}
                          — jet caché
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-fantasy-muted-soft truncate">
                      {rollDetail(item.roll)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form
        onSubmit={submit}
        className="flex gap-2 p-3 border-t border-fantasy-border-soft"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écrire un message…"
          autoComplete="off"
          className="flex-1 h-11 px-3.5 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent"
        />
        <button
          type="submit"
          aria-label="Envoyer"
          className="w-11 h-11 rounded-lg bg-fantasy-accent text-fantasy-bg flex items-center justify-center hover:bg-fantasy-accent-hover disabled:opacity-50"
          disabled={!input.trim()}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
