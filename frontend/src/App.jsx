import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { getStoredAuth, persistAuth, removeStoredAuth } from './services/storage.js';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const PrivateRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const App = () => {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState(() => getStoredAuth());

  useEffect(() => {
    persistAuth(authState);
  }, [authState]);

  const value = useMemo(
    () => ({
      ...authState,
      login: (data) => {
        setAuthState(data);
        navigate('/');
      },
      logout: () => {
        setAuthState({ user: null, token: null });
        removeStoredAuth();
        navigate('/login');
      },
      updateUser: (user) => {
        setAuthState((prev) => ({ ...prev, user }));
      },
    }),
    [authState, navigate],
  );

  return (
    <AuthContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
};

export default App;
