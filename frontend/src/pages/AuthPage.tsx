import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/core/auth/useAuth';
import { getErrorMessage } from '@/shared/utils/errorMessage';
import { ThemePicker } from '@/shared/ui/ThemePicker';
import { MapIcon, Music } from '@/shared/ui/icons';
import { PageHeader, PageShell, glassPanel } from '@/shared/ui/PageShell';
import { ADVENTURES, MODES } from '@/adventures/catalog';

const POSTERS = [...MODES, ...ADVENTURES];

type Mode = 'login' | 'register';

const FEATURES = [
  {
    icon: <MapIcon size={20} />,
    text: 'Cartes et jetons synchronisés, brouillard de guerre',
  },
  {
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2l9 5.2v9.6L12 22l-9-5.2V7.2z" />
        <path d="M12 2l4.5 7.5h-9z" />
      </svg>
    ),
    text: 'Dés et chat partagés, jets cachés pour le MJ',
  },
  {
    icon: <Music size={20} />,
    text: "Musique d'ambiance entendue par tous au même moment",
  },
];

/** Page d'accueil : présentation + connexion / création de compte. */
export function AuthPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  // Affiche mise en avant : elle change toutes les 7 s et éclaire le fond.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setShown((i) => (i + 1) % POSTERS.length),
      7000
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => setMode(initialMode), [initialMode]);

  useEffect(() => {
    clearError();
    setErr('');
  }, [clearError, mode]);

  useEffect(() => {
    if (authError) setErr(authError);
  }, [authError]);

  const switchMode = (m: Mode) => {
    setMode(m);
    // L'adresse reflète l'onglet, pour pouvoir partager un lien « créer un compte ».
    navigate(m === 'login' ? '/login' : '/register', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName);
      navigate('/games');
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'h-12 px-3.5 rounded-lg bg-fantasy-bg border border-fantasy-border text-base text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent';

  return (
    <PageShell
      backdrop={POSTERS[shown].image}
      header={<PageHeader home="/login" />}
    >
      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-12 pb-14 flex flex-wrap items-center gap-14">
        <section className="flex-[1_1_440px] flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <span className="text-[11px] uppercase tracking-[0.35em] text-fantasy-accent">
              Pour le MJ et ses joueurs, dans le navigateur
            </span>
            <h1 className="font-heading font-bold text-4xl md:text-5xl leading-tight tracking-wide">
              Votre table de jeu de rôle, partagée en direct
            </h1>
            <span className="h-px w-16 bg-fantasy-accent/70" />
            <p className="text-lg md:text-xl leading-relaxed max-w-xl text-fantasy-text-soft">
              Cartes, jetons, dés, fiches et musique : tout ce que fait le MJ
              apparaît instantanément chez les joueurs.
            </p>
          </div>
          <ul className="flex flex-col gap-3.5">
            {FEATURES.map((f) => (
              <li
                key={f.text}
                className="flex items-center gap-3.5 text-[17px]"
              >
                <span className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center bg-fantasy-surface border border-fantasy-border text-fantasy-accent">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
          {/* Les affiches des tables et aventures, en éventail. */}
          <div aria-hidden className="flex items-end gap-3 pt-2 pl-2">
            {POSTERS.map((p, i) => (
              <img
                key={p.id}
                src={p.image}
                alt=""
                className={`w-24 sm:w-28 aspect-[2/3] object-cover rounded-lg border shadow-2xl transition-all duration-700 ${
                  i === shown
                    ? '-translate-y-2 border-[var(--accent)] shadow-[0_0_32px_-6px_var(--accent)]'
                    : 'border-white/10 opacity-70'
                }`}
                style={
                  {
                    '--accent': p.accent,
                    rotate: `${(i - (POSTERS.length - 1) / 2) * 4}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </section>

        <section
          aria-label={mode === 'login' ? 'Connexion' : 'Création de compte'}
          className={`${glassPanel} flex-[0_1_420px] w-full p-7 flex flex-col gap-5 shadow-2xl`}
        >
          <div
            role="tablist"
            className="flex gap-1 p-1 rounded-xl bg-fantasy-bg"
          >
            {(
              [
                ['login', 'Se connecter'],
                ['register', 'Créer un compte'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`flex-1 h-10 rounded-lg text-[15px] ${
                  mode === m
                    ? 'bg-fantasy-surface-hover text-fantasy-text font-bold'
                    : 'text-fantasy-muted hover:text-fantasy-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {err && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-fantasy-danger/15 border border-fantasy-danger/40 text-fantasy-error text-sm"
            >
              {err}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <label className="flex flex-col gap-1.5 text-sm text-fantasy-muted">
                Pseudo
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  placeholder="Comment les autres vous verront"
                  className={inputClass}
                  required
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm text-fantasy-muted">
              Adresse e-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="vous@exemple.fr"
                className={inputClass}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-fantasy-muted">
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                minLength={mode === 'register' ? 6 : undefined}
                className={inputClass}
                required
              />
              {mode === 'register' && (
                <span className="text-xs text-fantasy-muted-soft">
                  6 caractères minimum
                </span>
              )}
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold text-base hover:bg-fantasy-accent-hover disabled:opacity-60"
            >
              {submitting
                ? '…'
                : mode === 'login'
                  ? 'Se connecter'
                  : 'Créer mon compte'}
            </button>
          </form>

          <div className="flex items-center gap-3 text-[13px] text-fantasy-muted">
            <span className="flex-1 h-px bg-fantasy-border" />
            Invité par votre MJ ?
            <span className="flex-1 h-px bg-fantasy-border" />
          </div>
          <p className="text-sm leading-relaxed text-center text-fantasy-muted">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-fantasy-accent hover:underline"
                >
                  Créez un compte
                </button>
                , puis entrez le{' '}
                <strong className="text-fantasy-text">
                  code d&apos;invitation
                </strong>{' '}
                qu&apos;il vous a donné.
              </>
            ) : (
              <>
                Une fois connecté, entrez le{' '}
                <strong className="text-fantasy-text">
                  code d&apos;invitation
                </strong>{' '}
                qu&apos;il vous a donné.
              </>
            )}
          </p>
        </section>
      </main>

      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-sm text-fantasy-muted-soft">
        <span>Table JDR</span>
        <span className="flex items-center gap-3">
          Palette
          <ThemePicker compact />
        </span>
      </footer>
    </PageShell>
  );
}
