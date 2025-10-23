import { useState, useEffect } from 'react';
import { User } from 'oidc-client-ts';
import { getAccessToken, isOidcEnabled, login, logout, init } from '@/frontend/auth/oidc';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        await init();
        const enabled = await isOidcEnabled();
        
        if (!enabled) {
          setUser(null);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        const token = await getAccessToken();
        if (token) {
          // Get user info from localStorage or reconstruct from token
          const userData = localStorage.getItem('oidc.user');
          if (userData) {
            const parsedUser = JSON.parse(userData);
            setUser(parsedUser);
            setIsAuthenticated(true);
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogin = async () => {
    try {
      setError(null);
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      await logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  };

  const getToken = (): string | null => {
    if (!isAuthenticated) return null;
    return user?.access_token || null;
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    error,
    login: handleLogin,
    logout: handleLogout,
    getAccessToken: getToken,
  };
};