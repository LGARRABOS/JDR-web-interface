import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from './icons';

// Habillage commun des pages hors table (Mes parties, nouvelle partie,
// bibliothèque, guide, connexion, erreurs) : fond éclairé par une affiche,
// en-tête avec le logo, titres en typographie de cinéma.

export function D20Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-fantasy-accent"
    >
      <path d="M12 2l9 5.2v9.6L12 22l-9-5.2V7.2z" />
      <path d="M12 2l4.5 7.5h-9zM7.5 9.5L3 16.8M16.5 9.5L21 16.8M7.5 9.5L12 22l4.5-12.5M3 7.2l4.5 2.3M21 7.2l-4.5 2.3" />
    </svg>
  );
}

/** Fond de page : une affiche très floue, comme la lumière d'une salle. */
export function Backdrop({
  image,
  strength = 0.32,
}: {
  image?: string | null;
  strength?: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 620px at 70% 0%, rgb(var(--c-accent) / 0.09), transparent 65%)',
        }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: image ? strength : 0 }}
      >
        {image && (
          <img
            key={image}
            src={image}
            alt=""
            className="w-full h-full object-cover scale-110 blur-3xl"
          />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-fantasy-bg/40 via-fantasy-bg/70 to-fantasy-bg" />
    </div>
  );
}

/** Bouton de retour de l'en-tête (« Mes parties », « Table de jeu »…). */
export function BackLink({
  to,
  onClick,
  children,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls =
    'h-10 px-4 rounded-lg border border-fantasy-border bg-fantasy-bg/40 backdrop-blur text-sm text-fantasy-text-soft hover:text-fantasy-text hover:border-fantasy-accent/60 flex items-center gap-2 transition-colors';
  const body = (
    <>
      <ChevronLeft size={16} />
      {children}
    </>
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** En-tête commun : logo à gauche, actions à droite. */
export function PageHeader({
  home = '/games',
  title,
  children,
  wide = false,
}: {
  home?: string;
  /** Titre de la page, à côté du logo (pages outils). */
  title?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <header className="relative z-10 shrink-0 border-b border-white/5 bg-fantasy-bg/30 backdrop-blur-sm">
      <div
        className={`${wide ? 'max-w-none' : 'max-w-7xl'} mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Link to={home} className="flex items-center gap-2.5 shrink-0">
            <D20Logo size={28} />
            <span className="font-heading font-bold text-lg tracking-wide">
              Table JDR
            </span>
          </Link>
          {title && (
            <>
              <span className="w-px h-6 bg-fantasy-border" />
              <div className="min-w-0 leading-tight">{title}</div>
            </>
          )}
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
    </header>
  );
}

/** Grand titre centré : petite ligne, titre de cinéma, filet, accroche. */
export function PageHeading({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {kicker && (
        <span className="text-[11px] uppercase tracking-[0.35em] text-fantasy-accent">
          {kicker}
        </span>
      )}
      <h1 className="font-heading text-3xl sm:text-4xl tracking-wide">
        {title}
      </h1>
      <span className="h-px w-16 bg-fantasy-accent/70" />
      {subtitle && (
        <p className="text-fantasy-text-soft max-w-xl">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

/** Page complète : fond, en-tête, contenu. */
export function PageShell({
  backdrop,
  header,
  children,
  fill = false,
}: {
  backdrop?: string | null;
  header?: ReactNode;
  children: ReactNode;
  /** Page à hauteur d'écran (le contenu défile à l'intérieur). */
  fill?: boolean;
}) {
  return (
    <div
      className={`relative bg-fantasy-bg text-fantasy-text ${fill ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen overflow-x-hidden'}`}
    >
      <Backdrop image={backdrop} />
      {header ?? <PageHeader />}
      {children}
    </div>
  );
}

/** Panneau translucide des pages hors table. */
export const glassPanel =
  'rounded-2xl bg-fantasy-surface/80 backdrop-blur border border-fantasy-border';
