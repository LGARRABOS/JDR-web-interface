import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './icons';

export interface SidePanelTab {
  id: string;
  label: string;
  badge?: number;
  /** Contenu qui gère lui-même son défilement (ex. le chat). */
  fullHeight?: boolean;
  content: ReactNode;
}

interface SidePanelProps {
  tabs: SidePanelTab[];
  active: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/** Panneau latéral à onglets, flottant à droite de la carte. Peut être replié. */
export function SidePanel({
  tabs,
  active,
  onChange,
  open,
  onToggle,
}: SidePanelProps) {
  if (!open) {
    const badge = tabs.reduce((n, t) => n + (t.badge ?? 0), 0);
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="glass absolute top-[84px] right-4 z-20 h-11 pl-2 pr-3.5 rounded-xl flex items-center gap-1.5 text-sm hover:bg-fantasy-surface"
        aria-label="Ouvrir le panneau"
      >
        <ChevronLeft size={18} />
        Panneau
        {badge > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full bg-fantasy-accent text-fantasy-bg text-[11px] font-bold">
            {badge}
          </span>
        )}
      </button>
    );
  }

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <aside className="glass absolute top-[84px] right-4 bottom-4 z-20 w-[360px] rounded-2xl flex flex-col overflow-hidden">
      <div
        role="tablist"
        className="flex gap-0.5 p-1.5 border-b border-fantasy-border-soft"
      >
        {tabs.map((t) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${t.id}`}
              onClick={() => onChange(t.id)}
              className={`tab-btn flex-1 h-10 rounded-lg text-sm ${
                selected
                  ? 'bg-fantasy-surface text-fantasy-text font-bold'
                  : 'text-fantasy-muted hover:text-fantasy-text'
              }`}
            >
              {t.label}
              {!!t.badge && !selected && (
                <span className="ml-1 px-1.5 rounded-full bg-fantasy-accent text-fantasy-bg text-[11px] font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="icon-btn !w-10 !h-10"
          aria-label="Replier le panneau"
          title="Replier le panneau"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className={
          current.fullHeight
            ? 'flex-1 min-h-0'
            : 'flex-1 min-h-0 overflow-y-auto p-4'
        }
      >
        {current.content}
      </div>
    </aside>
  );
}
