import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

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
      <div className="w-full max-w-md rounded-lg bg-slate-800/80 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-6">Connexion</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-slate-700 px-4 py-2 text-white border border-slate-600 focus:border-amber-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded bg-slate-700 px-4 py-2 text-white border border-slate-600 focus:border-amber-500 focus:outline-none"
              required
            />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            Se connecter
          </button>
        </form>
        <p className="mt-4 text-center text-slate-400 text-sm">
          Pas de compte ?{' '}
          <Link to="/register" className="text-amber-400 hover:underline">
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
