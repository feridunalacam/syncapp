import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAccountPlatforms } from '../lib/platformStorage';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../lib/authLinks';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../lib/authCodeExchange';

const AuthContext = createContext({ user: null, ready: false, configured: false });
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState(null);
  const currentUser = useRef(null);
  currentUser.current = session?.user?.id || null;
  const exchangeCode = useRef(null);
  if (!exchangeCode.current && supabase) exchangeCode.current = createAuthCodeExchanger(supabase);
  const requireClient = () => {
    if (!supabase) throw new Error('Account services are being set up. Please try again later.');
    setError(null);
    return supabase;
  };
  const checked = async (promise) => {
    const result = await promise;
    if (result.error) throw result.error;
    return result.data;
  };
  const exchangeLink = async (url) => {
    const parsed = parseAuthLink(url);
    if (!parsed) return;
    if (parsed.error) throw new Error(parsed.error);
    await exchangeCode.current(parsed);
    setError(null);
    if (parsed.recovery) setRecoveryMode(true);
  };
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      receivedEvent = true;
      if (!alive) return;
      currentUser.current = next?.user?.id || null;
      setSession(next);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') setRecoveryMode(false);
    });
    supabase.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!alive || receivedEvent) return;
        currentUser.current = data.session?.user?.id || null;
        setSession(data.session);
        if (failure) setError(failure.message);
        setReady(true);
      })
      .catch((failure) => {
        if (alive) {
          setError(failure.message);
          setReady(true);
        }
      });
    const receive = async (value) => {
      const parsed = parseAuthLink(value);
      if (!parsed) return;
      try {
        await exchangeLink(value);
      } catch (failure) {
        if (__DEV__)
          console.warn('[auth] Account link exchange failed', authExchangeDiagnostic(failure));
        if (alive)
          setError(
            'This sign-in link could not be used. Request a new link and open it on this device.',
          );
      }
    };
    Linking.getInitialURL()
      .then((value) => {
        if (value && alive) receive(value);
      })
      .catch(() => {});
    const links = Linking.addEventListener('url', ({ url }) => receive(url));
    const refresh = (state) =>
      state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    return () => {
      alive = false;
      subscription.unsubscribe();
      links.remove();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);
  const signIn = (email, password) =>
    checked(requireClient().auth.signInWithPassword({ email: email.trim(), password }));
  const signUp = async (email, password) => {
    const data = await checked(
      requireClient().auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: AUTH_REDIRECT },
      }),
    );
    return { requiresConfirmation: !data.session };
  };
  const sendPasswordReset = (email) =>
    checked(
      requireClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: RECOVERY_REDIRECT }),
    );
  const updatePassword = async (password) => {
    await checked(requireClient().auth.updateUser({ password }));
    setRecoveryMode(false);
  };
  const signOut = () => checked(requireClient().auth.signOut({ scope: 'local' }));
  const signInWithOAuth = async (provider) => {
    if (!['apple', 'google'].includes(provider)) throw new Error('Unsupported sign-in provider.');
    const data = await checked(
      requireClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
      }),
    );
    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
    if (result.type === 'success') {
      const parsed = parseAuthLink(result.url);
      if (!parsed?.code || parsed.error)
        throw new Error(parsed?.error || 'Sign-in could not be completed.');
      await exchangeLink(result.url);
    } else throw new Error('Sign-in was cancelled.');
  };
  const deleteAccount = async () => {
    const client = requireClient();
    const targetId = session?.user.id;
    if (!targetId) throw new Error('Sign in before deleting your account.');
    const { error: failure } = await client.functions.invoke('delete-account', {
      body: { confirmation: 'DELETE' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (failure) {
      const body = await failure.context?.json?.().catch(() => null);
      throw new Error(
        body?.message || 'Your account could not be deleted. Sign in again and retry.',
      );
    }
    // Remote deletion is confirmed before this device forgets its account data.
    const { clearAccountStore } = await import('../lib/accountStore');
    const cleanup = Promise.allSettled([
      clearAccountStore(AsyncStorage, targetId),
      clearAccountPlatforms(targetId),
    ]);
    if (currentUser.current === targetId) {
      await client.auth.signOut({ scope: 'local' });
      setSession(null);
    }
    await cleanup;
  };
  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session,
        ready,
        configured: isSupabaseConfigured,
        recoveryMode,
        error,
        signIn,
        signUp,
        sendPasswordReset,
        updatePassword,
        dismissRecovery: () => setRecoveryMode(false),
        clearError: () => setError(null),
        signOut,
        deleteAccount,
        signInWithOAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
