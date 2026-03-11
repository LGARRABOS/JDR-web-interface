import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getErrorMessage } from '../utils/errorMessage';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState('');
  const { register, error: authError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authError) setErr(authError);
  }, [authError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await register(email, password, displayName);
      navigate('/games');
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-8 shadow-xl">
        <h1 className="text-2xl font-bold font-heading text-center mb-6 text-fantasy-text-soft">
          Inscription
        </h1>
        {err && (
          <div
            role="alert"
            className="mb-4 p-3 rounded bg-fantasy-danger/20 border border-fantasy-error text-fantasy-error text-sm"
          >
            {err}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Nom d'affichage
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded bg-fantasy-input-soft px-4 py-2 text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-fantasy-input-soft px-4 py-2 text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded bg-fantasy-input-soft px-4 py-2 text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-medium"
          >
            S'inscrire
          </button>
        </form>
        <p className="mt-4 text-center text-fantasy-muted-soft text-sm">
          Déjà un compte ?{' '}
          <Link
            to="/login"
            className="text-fantasy-accent-hover hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
