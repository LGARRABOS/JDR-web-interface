import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.jsx';

const NavBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="flex items-center justify-between bg-slate-800 px-6 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-emerald-400">Chronicles of Eternita</span>
        <Link className="text-sm text-slate-300 hover:text-white" to="/map">
          Carte
        </Link>
        {user?.role === 'MJ' && (
          <Link className="text-sm text-slate-300 hover:text-white" to="/resources">
            Ressources
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        {user && <span className="font-medium">{user.username} — {user.role}</span>}
        <button
          type="button"
          onClick={handleLogout}
          className="rounded bg-emerald-500 px-3 py-1 font-semibold text-slate-900 transition hover:bg-emerald-400"
        >
          Déconnexion
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
