import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthForm from '../components/AuthForm.jsx';
import { loginUser } from '../services/api.js';
import { useAuth } from '../App.jsx';

const LoginPage = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const { data } = await loginUser({ identifier, password });
      login({ user: data.user, token: data.token });
    } catch (err) {
      setError("Impossible de se connecter. Vérifie tes informations.");
    }
  };

  return (
    <AuthForm
      title="Connexion"
      onSubmit={handleSubmit}
      submitLabel="Se connecter"
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div>
        <label className="block text-sm text-slate-300 mb-1">Email ou pseudo</label>
        <input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
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
      <p className="text-sm text-slate-400 text-center">
        Pas encore inscrit ?{' '}
        <Link
          to="/register"
          className="text-accent"
        >
          Créer un compte
        </Link>
      </p>
    </AuthForm>
  );
};

export default LoginPage;
