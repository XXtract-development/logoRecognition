/**
 * useCurrentUser (Epic 8, Story 8.5)
 *
 * Fetches the authenticated user from `GET /auth/me` so the UI can hide/disable
 * ADMIN-only actions. This is a UX layer only — the backend remains the real
 * guard (it returns 403 for non-admins on mutating endpoints).
 */
import { useEffect, useState } from 'react';
import apiClient from '@/services/apiClient';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company?: string;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  loading: boolean;
  isAdmin: boolean;
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/auth/me')
      .then((response) => {
        if (active && response.data?.success) {
          setUser(response.data.user ?? null);
        }
      })
      .catch(() => {
        // Not authenticated / no role info — treat as non-admin.
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading, isAdmin: user?.role === 'ADMIN' };
}

export default useCurrentUser;
