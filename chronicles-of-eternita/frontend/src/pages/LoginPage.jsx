import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';

const LoginPage = () => {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await login(form);
    navigate('/map');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-6 text-2xl font-bold text-emerald-400">Connexion</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span>Email</span>
            <input
              className="rounded bg-slate-800 px-3 py-2 focus:outline-none"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Mot de passe</span>
            <input
              className="rounded bg-slate-800 px-3 py-2 focus:outline-none"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="rounded bg-emerald-500 py-2 font-semibold text-slate-900 transition hover:bg-emerald-400"
          >
            Se connecter
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Pas encore de compte ?{' '}
          <Link className="text-emerald-400 hover:underline" to="/register">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
