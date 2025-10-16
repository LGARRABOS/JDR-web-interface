import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ResourceManagerPage from './pages/ResourceManagerPage.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xl">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <AuthRedirect>
          <LoginPage />
        </AuthRedirect>
      }
    />
    <Route
      path="/register"
      element={
        <AuthRedirect>
          <RegisterPage />
        </AuthRedirect>
      }
    />
    <Route
      path="/map"
      element={
        <ProtectedRoute>
          <MapPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/resources"
      element={
        <ProtectedRoute>
          <ResourceManagerPage />
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<Navigate to="/map" replace />} />
  </Routes>
);

const AuthRedirect = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xl">Chargement...</div>;
  }

  if (user) {
    return <Navigate to="/map" replace />;
  }

  return children;
};

const App = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);

export default App;
