import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft } from '../components/tabletop/icons';
import { GamesAPI } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';
import { D20Logo } from './AuthPage';
import {
  ADVENTURES,
  MODES,
  type Adventure,
  type Mode,
  type Poster,
} from '../data/adventures';

// Nouvelle partie : choix du mode (JDR standard ou GEMMA), puis de
// l'aventure GEMMA, présentés comme des affiches ; enfin le nom et les
// options de la partie.

type Step = 'mode' | 'adventure' | 'details';

export function NewGamePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<Mode | null>(null);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [hover, setHover] = useState<Poster | null>(null);
  const [name, setName] = useState('');
  const [isTest, setIsTest] = useState(false);
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const chosen: Poster | null = adventure ?? mode;
  // Fond de page : l'affiche survolée, sinon celle choisie.
  const backdrop = hover ?? chosen;

  const pickMode = (m: Mode) => {
    setMode(m);
    setAdventure(null);
    setHover(null);
    setStep(m.gemma ? 'adventure' : 'details');
  };
  const pickAdventure = (a: Adventure) => {
    setAdventure(a);
    setHover(null);
    setStep('details');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setErr('');
    setBusy(true);
    try {
      const variant = mode.gemma ? (adventure?.variant ?? '') : '';
      const { data } = await GamesAPI.create({
        name: name.trim() || undefined,
        isGemma: mode.gemma,
        gemmaVariant: variant || undefined,
        isTest: isTest || undefined,
        sample: isTest ? sample : undefined,
      });
      navigate(
        data.game?.id
          ? `/table/${data.game.id}${variant === 'arpenteur' ? '?vue=arpenteur' : ''}`
          : '/games'
      );
    } catch (e2: unknown) {
      setErr(getErrorMessage(e2, 'Création impossible'));
      setBusy(false);
    }
  };

  const steps: { id: Step; label: string; done: boolean; can: boolean }[] = [
    { id: 'mode', label: 'Mode de jeu', done: !!mode, can: true },
    ...(mode?.gemma !== false
      ? [
          {
            id: 'adventure' as const,
            label: 'Aventure',
            done: !!adventure,
            can: !!mode?.gemma,
          },
        ]
      : []),
    {
      id: 'details',
      label: 'La partie',
      done: false,
      can: !!mode && (!mode.gemma || !!adventure),
    },
  ];

  return (
    <div className="relative min-h-screen bg-fantasy-bg text-fantasy-text overflow-hidden">
      {/* Fond : l'affiche, très floue, comme une lumière de salle. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 transition-opacity duration-700"
        style={{ opacity: backdrop ? 0.32 : 0 }}
      >
        {backdrop && (
          <img
            key={backdrop.id}
            src={backdrop.image}
            alt=""
            className="w-full h-full object-cover scale-110 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-fantasy-bg/40 via-fantasy-bg/70 to-fantasy-bg" />
      </div>

      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/games" className="flex items-center gap-2.5">
            <D20Logo size={28} />
            <span className="font-heading font-bold text-lg tracking-wide">
              Table JDR
            </span>
          </Link>
          <Link
            to="/games"
            className="h-10 px-4 rounded-lg border border-fantasy-border text-sm text-fantasy-text-soft hover:text-fantasy-text flex items-center gap-2"
          >
            <ChevronLeft size={16} />
            Mes parties
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-16 flex flex-col gap-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide">
            Nouvelle partie
          </h1>
          <ol className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="w-8 h-px bg-fantasy-border" />}
                <button
                  type="button"
                  disabled={!s.can}
                  onClick={() => setStep(s.id)}
                  aria-current={step === s.id ? 'step' : undefined}
                  className={`h-9 px-3.5 rounded-full border flex items-center gap-2 transition-colors disabled:opacity-40 ${
                    step === s.id
                      ? 'border-fantasy-accent text-fantasy-accent bg-fantasy-accent/10'
                      : 'border-fantasy-border text-fantasy-text-soft hover:text-fantasy-text'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${
                      s.done
                        ? 'bg-fantasy-accent text-fantasy-bg'
                        : 'bg-white/10'
                    }`}
                  >
                    {s.done ? <Check size={12} /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {step === 'mode' && (
          <section aria-label="Mode de jeu" className="flex flex-col gap-6">
            <p className="text-center text-fantasy-text-soft">
              Quelle table voulez-vous ouvrir ?
            </p>
            <div className="flex flex-wrap justify-center gap-6 lg:gap-10">
              {MODES.map((m) => (
                <div
                  key={m.id}
                  className="min-w-[260px]"
                  style={{
                    width: 'min(100%, 420px, calc((100vh - 300px) * 2 / 3))',
                  }}
                >
                  <PosterCard
                    poster={m}
                    big
                    selected={mode?.id === m.id}
                    onPick={() => pickMode(m)}
                    onHover={setHover}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 'adventure' && (
          <section aria-label="Aventure GEMMA" className="flex flex-col gap-6">
            <p className="text-center text-fantasy-text-soft">
              Choisissez l&apos;aventure de votre table GEMMA.
              <span className="block text-xs text-fantasy-muted mt-1">
                L&apos;univers GEMMA ne se change plus après la création ;
                l&apos;aventure, si.
              </span>
            </p>
            {/* Galerie : autant d'affiches que d'aventures, centrées. */}
            <div className="flex flex-wrap justify-center gap-6">
              {ADVENTURES.map((a) => (
                <div key={a.id} className="w-[min(100%,260px)]">
                  <PosterCard
                    poster={a}
                    selected={adventure?.id === a.id}
                    onPick={() => pickAdventure(a)}
                    onHover={setHover}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 'details' && mode && chosen && (
          <form
            onSubmit={create}
            className="mx-auto w-full max-w-5xl grid grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr] gap-8 items-start"
          >
            <PosterCard poster={chosen} selected />
            <div className="flex flex-col gap-5 rounded-2xl bg-fantasy-surface/85 backdrop-blur border border-fantasy-border p-6">
              <div>
                <p
                  className="text-xs uppercase tracking-[0.3em]"
                  style={{ color: chosen.accent }}
                >
                  {chosen.kicker}
                </p>
                <h2 className="font-heading text-3xl mt-1">{chosen.title}</h2>
                <p className="text-fantasy-text-soft mt-2">{chosen.tagline}</p>
              </div>
              {adventure && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {adventure.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span style={{ color: adventure.accent }}>
                        <Check size={14} className="shrink-0" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex flex-col gap-1.5 text-sm text-fantasy-text-soft">
                Nom de la partie
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={chosen.title}
                  autoFocus
                  className="h-12 px-3.5 rounded-lg bg-fantasy-bg border border-fantasy-border text-base text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent"
                />
              </label>
              <div className="flex flex-col gap-2 rounded-xl border border-fantasy-border p-3.5">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isTest}
                    onChange={(e) => setIsTest(e.target.checked)}
                    className="w-[18px] h-[18px] accent-fantasy-accent"
                  />
                  Partie test
                  <span className="text-fantasy-muted">
                    (joueurs fictifs que vous incarnez, sans invitation)
                  </span>
                </label>
                {isTest && (
                  <label className="flex items-center gap-2.5 text-sm text-fantasy-muted cursor-pointer select-none pl-7">
                    <input
                      type="checkbox"
                      checked={sample}
                      onChange={(e) => setSample(e.target.checked)}
                      className="w-4 h-4 accent-fantasy-accent"
                    />
                    Remplir avec des données d&apos;exemple (3 joueurs, une
                    carte, des monstres
                    {adventure?.sample ? `, ${adventure.sample}` : ''})
                  </label>
                )}
              </div>
              {err && (
                <p role="alert" className="text-sm text-fantasy-error">
                  {err}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(mode.gemma ? 'adventure' : 'mode')}
                  className="h-11 px-4 rounded-lg border border-fantasy-border text-sm text-fantasy-text-soft hover:text-fantasy-text flex items-center gap-2"
                >
                  <ChevronLeft size={16} />
                  Changer
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-12 px-6 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold hover:bg-fantasy-accent-hover disabled:opacity-60"
                >
                  {busy ? 'Création…' : 'Créer la partie'}
                </button>
              </div>
              <p className="text-xs text-fantasy-muted">
                Vous en serez le Maître du Jeu.
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

/** Affiche : illustration plein cadre, titre en typographie de cinéma. */
function PosterCard({
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
