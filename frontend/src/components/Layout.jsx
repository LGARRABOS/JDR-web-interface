import React from 'react';
import { useAuth } from '../App.jsx';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-wide uppercase text-accent">
            Chronicles of Eternita
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">
              Connecté en tant que <strong>{user?.username}</strong>
              {user?.isGameMaster ? ' (MJ)' : ''}
            </span>
            <button
              onClick={logout}
              className="px-3 py-1 rounded bg-red-500/80 hover:bg-red-500 text-sm"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">{children}</main>
    </div>
  );
};

export default Layout;
