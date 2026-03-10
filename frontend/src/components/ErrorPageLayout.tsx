import { Link } from 'react-router-dom';

interface ErrorPageLayoutProps {
  code: number;
  title: string;
  message: string;
}

export function ErrorPageLayout({ code, title, message }: ErrorPageLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-8 shadow-xl text-center">
        <p className="text-6xl font-bold font-heading text-fantasy-accent mb-2">
          {code}
        </p>
        <h1 className="text-2xl font-bold font-heading text-fantasy-text-soft mb-4">
          {title}
        </h1>
        <p className="text-fantasy-muted-soft mb-6">{message}</p>
        <Link
          to="/games"
          className="inline-block px-6 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-medium"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
