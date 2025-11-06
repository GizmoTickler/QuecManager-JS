/**
 * Authentication Hook (New API)
 *
 * Uses the new Next.js API routes instead of CGI scripts
 * Migrated from: hooks/auth.ts
 *
 * Changes:
 * - Uses /api/auth/* instead of /cgi-bin/quecmanager/auth.sh
 * - Tokens stored in httpOnly cookies instead of localStorage
 * - Better error handling and type safety
 */

import { useState, useEffect, useCallback } from 'react';

interface SessionData {
  token: string;
  username: string;
  lastActivity: number;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  error: string | null;
}

export function useAuthNew() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    username: null,
    error: null,
  });

  /**
   * Check if user is authenticated
   */
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const data = await response.json();
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          username: data.data.user.username,
          error: null,
        });
        return true;
      } else {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          username: null,
          error: null,
        });
        return false;
      }
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        username: null,
        error: 'Authentication check failed',
      });
      return false;
    }
  }, []);

  /**
   * Login with password
   */
  const login = useCallback(async (password: string): Promise<boolean> => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        credentials: 'include', // Include cookies
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          username: data.data.username,
          error: null,
        });
        return true;
      } else {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          username: null,
          error: data.error || 'Login failed',
        });
        return false;
      }
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        username: null,
        error: 'Network error during login',
      });
      return false;
    }
  }, []);

  /**
   * Logout
   */
  const logout = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        username: null,
        error: null,
      });

      return response.ok;
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if request fails
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        username: null,
        error: null,
      });
      return false;
    }
  }, []);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    ...authState,
    login,
    logout,
    checkAuth,
  };
}

/**
 * Migration note:
 *
 * To migrate from old auth.ts to this new version:
 *
 * 1. Replace import:
 *    - Old: import { useAuth } from '@/hooks/auth'
 *    - New: import { useAuthNew as useAuth } from '@/hooks/auth-new'
 *
 * 2. API changes:
 *    - Token is now stored in httpOnly cookie (more secure)
 *    - No need to manually manage localStorage
 *    - Better error handling with error states
 *
 * 3. Usage remains the same:
 *    const { isAuthenticated, login, logout } = useAuth();
 */
