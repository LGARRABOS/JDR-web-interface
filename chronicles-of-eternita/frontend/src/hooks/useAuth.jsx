import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const register = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/register', payload);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.response?.data?.message || 'Inscription impossible');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/login', payload);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.response?.data?.message || 'Connexion impossible');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, register, login, logout, refresh: fetchUser }),
    [user, loading, error, register, login, logout, fetchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};

export { useAuth };
export default useAuth;
