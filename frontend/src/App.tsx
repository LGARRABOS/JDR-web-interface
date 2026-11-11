import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { GameLobbyPage } from './pages/GameLobbyPage';
import { TabletopPage } from './pages/TabletopPage';
import { LibraryPage } from './pages/LibraryPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { WikiPage } from './pages/WikiPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { ServerErrorPage } from './pages/ServerErrorPage';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';

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

export const App = () => {
  return (
    <AuthProvider>
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
        <Route path="/games/wiki" element={<Navigate to="/guide" replace />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/500" element={<ServerErrorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
};
