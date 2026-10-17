import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

// The user object always comes from GET /me. Nothing role-related is trusted
// from localStorage: editing it in devtools changes nothing server-side anyway.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/me');
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    refreshUser().catch(() => setToken(null)).finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email: email.trim(), password });
    setToken(data.access_token);
    return refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, setUser }),
    [user, loading, login, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
