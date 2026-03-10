import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await login(email, password);
      navigate('/games');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-8 shadow-xl">
        <h1 className="text-2xl font-bold font-heading text-center mb-6 text-fantasy-text-soft">
          Connexion
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {err && <p className="text-fantasy-error text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-medium"
          >
            Se connecter
          </button>
        </form>
        <p className="mt-4 text-center text-fantasy-muted-soft text-sm">
          Pas de compte ?{' '}
          <Link
            to="/register"
            className="text-fantasy-accent-hover hover:underline"
          >
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
