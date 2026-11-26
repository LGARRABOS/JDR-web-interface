import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft } from '@/shared/ui/icons';
import { GamesAPI } from '@/core/api/client';
import { getErrorMessage } from '@/shared/utils/errorMessage';
import {
  BackLink,
  PageHeader,
  PageHeading,
  PageShell,
} from '@/shared/ui/PageShell';
import { PosterCard } from '@/adventures/PosterCard';
import {
  ADVENTURES,
  MODES,
  type Adventure,
  type Mode,
  type Poster,
} from '@/adventures/catalog';

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
    <PageShell
      backdrop={backdrop?.image}
      header={
        <PageHeader>
          <BackLink to="/games">Mes parties</BackLink>
        </PageHeader>
      }
    >
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-16 flex flex-col gap-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <PageHeading kicker="Vous en serez le MJ" title="Nouvelle partie" />
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
    </PageShell>
  );
}
