// Sesión del usuario (login con Google vía Supabase).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthApi {
  loading: boolean;
  user: User | null;
  /** Login por redirección (respaldo si no carga el botón de Google) */
  signInWithGoogle: () => Promise<void>;
  /** Login con el token que devuelve el botón de Google */
  signInWithGoogleToken: (token: string, nonce: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export const displayName = (user: User | null): string =>
  user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';

export const avatarUrl = (user: User | null): string =>
  user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      // Al volver de Google por redirección queda ?code= en la dirección: la limpiamos
      if (next && window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signInWithGoogleToken = useCallback(async (token: string, nonce: string) => {
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token, nonce });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    window.google?.accounts?.id?.disableAutoSelect?.();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ loading, user: session?.user ?? null, signInWithGoogle, signInWithGoogleToken, signOut }),
    [loading, session, signInWithGoogle, signInWithGoogleToken, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
