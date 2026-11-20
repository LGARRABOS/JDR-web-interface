import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getActAs, switchActAs, tableGameId } from './auth/actAs';
import { AuthPage } from './pages/AuthPage';
import { GameLobbyPage } from './pages/GameLobbyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { ServerErrorPage } from './pages/ServerErrorPage';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';

// Pages lourdes chargées à la demande : l'écran de connexion et la liste des
// parties s'affichent sans télécharger la table, le moteur 3D ni le guide.
const TabletopPage = lazy(() =>
  import('./pages/TabletopPage').then((m) => ({ default: m.TabletopPage }))
);
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const ResourcesPage = lazy(() =>
  import('./pages/ResourcesPage').then((m) => ({ default: m.ResourcesPage }))
);
const WikiPage = lazy(() =>
  import('./pages/WikiPage').then((m) => ({ default: m.WikiPage }))
);

function PageLoading() {
  return (
    <div className="min-h-screen grid place-items-center text-fantasy-muted">
      Chargement…
    </div>
  );
}

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AuthRedirect = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Chargement...</div>;
  }

  if (user) {
    return <Navigate to="/games" replace />;
  }

  return children;
};

/**
 * Partie test : en quittant la table de la partie où l'on incarne un joueur
 * fictif, on redevient soi-même (rechargement pour repartir du bon compte).
 */
function ActAsGuard() {
  const { pathname } = useLocation();
  useEffect(() => {
    const a = getActAs();
    if (a && tableGameId(pathname) !== a.gameId) switchActAs(null);
  }, [pathname]);
  return null;
}

export const App = () => {
  return (
    <AuthProvider>
      <ActAsGuard />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route
            path="/"
            element={
              <AuthRedirect>
                <AuthPage />
              </AuthRedirect>
            }
          />
          <Route
            path="/login"
            element={
              <AuthRedirect>
                <AuthPage initialMode="login" />
              </AuthRedirect>
            }
          />
          <Route
            path="/register"
            element={
              <AuthRedirect>
                <AuthPage initialMode="register" />
              </AuthRedirect>
            }
          />
          <Route
            path="/games"
            element={
              <ProtectedRoute>
                <GameLobbyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/table/:gameId"
            element={
              <ProtectedRoute>
                <TabletopPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/table/:gameId/resources"
            element={
              <ProtectedRoute>
                <ResourcesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <LibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/guide"
            element={
              <ProtectedRoute>
                <WikiPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/games/wiki"
            element={<Navigate to="/guide" replace />}
          />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/500" element={<ServerErrorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
};
