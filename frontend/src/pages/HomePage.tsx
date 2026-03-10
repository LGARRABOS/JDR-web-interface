import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-fantasy-muted-soft">Chargement...</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/games" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center space-y-10">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold font-heading text-fantasy-accent tracking-wide">
            Table JDR
          </h1>
          <p className="text-xl text-fantasy-text-soft">
            Votre table de jeu de rôle virtuelle. Créez des parties, invitez vos
            joueurs et partagez cartes, fiches et musiques.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/login"
            className="px-8 py-3 rounded-lg bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-medium transition-colors"
          >
            Connexion
          </Link>
          <Link
            to="/register"
            className="px-8 py-3 rounded-lg bg-fantasy-surface border border-fantasy-border hover:bg-fantasy-surface-hover text-fantasy-text-soft font-medium transition-colors"
          >
            Créer un compte
          </Link>
        </div>

        <p className="text-sm text-fantasy-muted-soft">
          Table JDR — Une interface simple pour vos parties de jeu de rôle
        </p>
      </div>
    </div>
  );
}
