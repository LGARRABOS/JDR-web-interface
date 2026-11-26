import type { CSSProperties } from 'react';
import { Check } from '@/shared/ui/icons';
import type { Poster } from './catalog';

/** Affiche : illustration plein cadre, titre en typographie de cinéma. */
export function PosterCard({
  poster,
  big = false,
  selected = false,
  onPick,
  onHover,
}: {
  poster: Poster;
  big?: boolean;
  selected?: boolean;
  onPick?: () => void;
  onHover?: (p: Poster | null) => void;
}) {
  const style = { '--accent': poster.accent } as CSSProperties;
  const body = (
    <>
      <img
        src={poster.image}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
      <div className="absolute inset-3 rounded-lg border border-white/10 pointer-events-none" />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center text-center gap-2 ${big ? 'p-8' : 'p-5'}`}
      >
        <span
          className="text-[11px] uppercase tracking-[0.35em]"
          style={{ color: poster.accent }}
        >
          {poster.kicker}
        </span>
        <span
          className={`font-heading font-bold leading-none tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] ${big ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}
        >
          {poster.title}
        </span>
        <span
          className="h-px w-16 my-1"
          style={{ background: poster.accent }}
        />
        <span
          className={`text-white/80 ${big ? 'text-sm max-w-xs' : 'text-xs'}`}
        >
          {poster.tagline}
        </span>
      </div>
      {selected && (
        <span
          className="absolute top-4 right-4 w-8 h-8 rounded-full grid place-items-center text-black"
          style={{ background: poster.accent }}
        >
          <Check size={16} />
        </span>
      )}
    </>
  );
  const frame = `group relative block w-full aspect-[2/3] overflow-hidden rounded-2xl border bg-black shadow-2xl transition-all duration-300 ${
    selected
      ? 'border-[var(--accent)] shadow-[0_0_40px_-8px_var(--accent)]'
      : 'border-white/10'
  }`;
  if (!onPick)
    return (
      <div className={frame} style={style}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => onHover?.(poster)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(poster)}
      onBlur={() => onHover?.(null)}
      aria-label={`${poster.title} — ${poster.tagline}`}
      className={`${frame} text-left hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_0_48px_-10px_var(--accent)] focus:outline-none focus-visible:border-[var(--accent)]`}
      style={style}
    >
      {body}
    </button>
  );
}
