import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAccountPlatforms } from '../lib/platformStorage';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  supabase,
  isSupabaseConfigured,
  authStorage,
  signInWithNativeIdToken,
  authCredentialWriters,
} from '../lib/supabase';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../lib/authLinks';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../lib/authCodeExchange';
import { createAuthRecoveryState, recoverySessionIdentity } from '../lib/authRecoveryState';
import { createAuthOperationQueue } from '../lib/authOperations';
import { createSocialAuth } from '../lib/socialAuth';
import { ensureSocialProvider, AUTH_SERVICE_ORIGIN } from '../services/auth/providers';
import { signInNativeApple } from '../services/auth/apple';

const AuthContext = createContext({ user: null, ready: false, configured: false });
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState(null);
  const [socialProvider, setSocialProvider] = useState(null);
  const currentUser = useRef(null);
  const currentSession = useRef(null);
  currentUser.current = session?.user?.id || null;
  currentSession.current = session;
  const recovery = useRef(null);
  if (!recovery.current)
    recovery.current = createAuthRecoveryState({ storage: authStorage, onChange: setRecoveryMode });
  const exchangeCode = useRef(null);
  if (!exchangeCode.current && supabase) exchangeCode.current = createAuthCodeExchanger(supabase);
  const operations = useRef(null);
  if (!operations.current) operations.current = createAuthOperationQueue();
  const social = useRef(null);
  if (!social.current && supabase)
    social.current = createSocialAuth({
      client: supabase,
      enqueue: (action) => operations.current(action),
      exchangeCode: (parsed) => exchangeCode.current(parsed),
      ensureProvider: ensureSocialProvider,
      signInNativeApple,
      signInWithIdToken: signInWithNativeIdToken,
      openSession: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
      authorizationOrigin: AUTH_SERVICE_ORIGIN,
      getIdentity: () => {
        const identity = recoverySessionIdentity(currentSession.current);
        return identity ? `${identity.userId}:${identity.sessionId}` : currentUser.current;
      },
      onBusy: setSocialProvider,
    });
  const assertCurrentSession = (target) => {
    const expected = recoverySessionIdentity(target);
    const current = recoverySessionIdentity(currentSession.current);
    if (
      !target ||
      (expected
        ? expected.userId !== current?.userId || expected.sessionId !== current?.sessionId
        : target !== currentSession.current)
    )
      throw new Error('Your account changed. Please retry.');
  };
  const requireClient = () => {
    if (!supabase) throw new Error('Account services are being set up. Please try again later.');
    setError(null);
    return supabase;
  };
  const checked = async (promise) => {
    const result = await promise;
    if (result.error) {
      if (result.error.name === 'AuthRetryableFetchError')
        throw new Error('Account services could not be reached. Check your connection and retry.');
      throw result.error;
    }
    return result.data;
  };
  const exchangeLink = async (url) => {
    const parsed = parseAuthLink(url);
    if (!parsed) return;
    if (parsed.error) throw new Error(parsed.error);
    await social.current.receive(parsed);
  };
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let receivedEvent = false;
    let sessionVersion = 0;
    const receiveSession = (next, event) => {
      const version = ++sessionVersion;
      currentUser.current = next?.user?.id || null;
      currentSession.current = next;
      setSession(next);
      // Keep the initial account gate closed while unfinished recovery state is
      // restored. The bounded local read never calls Auth from its event callback.
      recovery.current.observe(next, event).then(() => {
        if (alive && version === sessionVersion) setReady(true);
      });
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      receivedEvent = true;
      if (!alive) return;
      receiveSession(next, event);
    });
    supabase.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!alive || receivedEvent) return;
        receiveSession(data.session, 'INITIAL_SESSION');
        if (failure)
          setError('Your account could not reconnect. You can keep using Sync on this device.');
      })
      .catch((failure) => {
        if (alive && !receivedEvent) {
          setError(failure.message);
          setReady(true);
        }
      });
    const receive = async (value) => {
      const parsed = parseAuthLink(value);
      if (!parsed) return;
      try {
        await exchangeLink(value);
        if (alive) setError(null);
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
      social.current?.cancel();
      recovery.current.suspend();
      subscription.unsubscribe();
      links.remove();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);
  const signIn = (email, password) => {
    requireClient();
    return operations.current(() =>
      checked(authCredentialWriters.signInWithPassword({ email: email.trim(), password })),
    );
  };
  const signUp = (email, password) => {
    requireClient();
    return operations.current(async () => {
      const data = await checked(
        authCredentialWriters.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: AUTH_REDIRECT },
        }),
      );
      return { requiresConfirmation: !data.session };
    });
  };
  const sendPasswordReset = (email) =>
    checked(
      requireClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: RECOVERY_REDIRECT }),
    );
  const updatePassword = async (password) => {
    const client = requireClient();
    const target = currentSession.current;
    return operations.current(async () => {
      assertCurrentSession(target);
      await checked(client.auth.updateUser({ password }));
      recovery.current.finish(target);
    });
  };
  const signOut = () => {
    const client = requireClient();
    const target = currentSession.current;
    return operations.current(() => {
      assertCurrentSession(target);
      return checked(client.auth.signOut({ scope: 'local' }));
    });
  };
  const signInWithOAuth = async (provider) => {
    requireClient();
    return social.current.signIn(provider);
  };
  const deleteAccount = async () => {
    const client = requireClient();
    const target = currentSession.current;
    const targetId = target?.user.id;
    if (!targetId) throw new Error('Sign in before deleting your account.');
    return operations.current(async () => {
      assertCurrentSession(target);
      const { error: failure } = await client.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
        headers: { Authorization: `Bearer ${target.access_token}` },
      });
      if (failure) {
        const body = await failure.context?.json?.().catch(() => null);
        throw new Error(
          body?.message ||
            'Account deletion could not be confirmed. Sign in again to check your account.',
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
        if (currentUser.current === targetId) setSession(null);
      }
      await cleanup;
    });
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
        dismissRecovery: () => recovery.current.finish(currentSession.current),
        clearError: () => setError(null),
        signOut,
        deleteAccount,
        signInWithOAuth,
        socialProvider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
