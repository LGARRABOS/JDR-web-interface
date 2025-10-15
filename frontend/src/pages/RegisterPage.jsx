import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthForm from '../components/AuthForm.jsx';
import { registerUser } from '../services/api.js';
import { useAuth } from '../App.jsx';

const RegisterPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isGameMaster, setIsGameMaster] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const { data } = await registerUser({
        username,
        email,
        password,
        isGameMaster,
      });
      login({ user: data.user, token: data.token });
    } catch (err) {
      setError("Impossible de créer le compte. Essaie avec un autre email/pseudo.");
    }
  };

  return (
    <AuthForm
      title="Inscription"
      onSubmit={handleSubmit}
      submitLabel="Créer le compte"
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div>
        <label className="block text-sm text-slate-300 mb-1">Pseudo</label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={isGameMaster}
          onChange={(event) => setIsGameMaster(event.target.checked)}
        />
        Je serai le Maître du Jeu
      </label>
      <p className="text-sm text-slate-400 text-center">
        Déjà membre ?{' '}
        <Link
          to="/login"
          className="text-accent"
        >
          Se connecter
        </Link>
      </p>
    </AuthForm>
  );
};

export default RegisterPage;
