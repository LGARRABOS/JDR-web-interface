import { Link } from 'react-router-dom';
import { PageShell, glassPanel } from './PageShell';

interface ErrorPageLayoutProps {
  code: number;
  title: string;
  message: string;
}

export function ErrorPageLayout({
  code,
  title,
  message,
}: ErrorPageLayoutProps) {
  return (
    <PageShell backdrop="/posters/gemma.jpg">
      <main className="relative z-10 min-h-[calc(100vh-73px)] flex items-center justify-center p-6">
        <div
          className={`${glassPanel} w-full max-w-md p-10 shadow-2xl text-center flex flex-col items-center gap-3`}
        >
          <p className="font-heading text-7xl font-bold text-fantasy-accent leading-none">
            {code}
          </p>
          <h1 className="font-heading text-2xl tracking-wide">{title}</h1>
          <span className="h-px w-16 bg-fantasy-accent/70" />
          <p className="text-fantasy-text-soft mb-3">{message}</p>
          <Link
            to="/games"
            className="h-11 px-6 rounded-lg bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-bold grid place-items-center"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    </PageShell>
  );
}
