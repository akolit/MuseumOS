import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  themePreference: string | null;
  langPreference: string | null;
  // Granted permissions snapshot from /auth/login or /auth/me. Used by the
  // sidebar + page-level affordances to gate UI to what the user can do.
  permissions: string[];
}

interface AuthContext {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Returns true if the current user has the named permission. Admin always
  // returns true regardless of what the matrix says (mirrors the API).
  hasPermission: (permission: string) => boolean;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const u = await api.post<User>('/auth/login', { identifier, password });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.permissions?.includes(permission) ?? false;
    },
    [user],
  );

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
