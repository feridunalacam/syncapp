import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAccountPlatforms, invalidateAccountPlatforms } from '../lib/platformStorage';
import {
  clearAccountStore,
  discoverAccountNamespaces,
  invalidateAccountStores,
} from '../lib/accountStore';
import {
  invalidateBillingScope,
  getKnownBillingNamespaces,
  forgetBillingScope,
} from '../lib/accountBillingScope';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  supabase,
  isSupabaseConfigured,
  authStorage,
  signInWithNativeIdToken,
  authCredentialWriters,
  authRecoveryClient,
  authRecoveryStorage,
} from '../lib/supabase';
import { AUTH_REDIRECT, parseAuthLink } from '../lib/authLinks';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../lib/authCodeExchange';
import { createAuthRecoveryState, recoverySessionIdentity } from '../lib/authRecoveryState';
import { createAuthRecoveryFlow } from '../lib/authRecoveryFlow';
import { createAuthOperationQueue } from '../lib/authOperations';
import { createSocialAuth } from '../lib/socialAuth';
import { ensureSocialProvider, AUTH_SERVICE_ORIGIN } from '../services/auth/providers';
import { signInNativeApple, getNativeAppleAuthentication } from '../services/auth/apple';
import { observeAppleCredentialRevocation } from '../lib/appleCredentialRevocation';

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
  const recoveryFlow = useRef(null);
  if (!recoveryFlow.current && supabase)
    recoveryFlow.current = createAuthRecoveryFlow({
      auth: authRecoveryClient,
      storage: authRecoveryStorage,
      mainAuth: supabase.auth,
      enqueue: (action) => operations.current(action),
      onRecovery: (next) => {
        assertCurrentSession(next);
        return recovery.current.observe(next, 'PASSWORD_RECOVERY');
      },
    });
  const social = useRef(null);
  if (!social.current && supabase)
    social.current = createSocialAuth({
      client: supabase,
      enqueue: (action) => operations.current(action),
      exchangeCode: (parsed) => exchangeCode.current(parsed),
      ensureProvider: ensureSocialProvider,
      signInNativeApple,
      signInWithIdToken: signInWithNativeIdToken,
      registerAppleAuthorization: async (authorizationCode, target) => {
        if (!target?.access_token) return;
        assertCurrentSession(target);
        await supabase.functions.invoke('register-apple-token', {
          body: { authorization_code: authorizationCode },
          headers: { Authorization: `Bearer ${target.access_token}` },
        });
      },
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
    if (parsed.recovery) await recoveryFlow.current.receive(parsed);
    else await social.current.receive(parsed);
  };
  useEffect(() => {
    if (!supabase) return;
    recoveryFlow.current.resume();
    let alive = true;
    let receivedEvent = false;
    let sessionVersion = 0;
    let appleRevocation = null;
    const receiveSession = (next, event) => {
      const version = ++sessionVersion;
      currentUser.current = next?.user?.id || null;
      currentSession.current = next;
      setSession(next);
      // Keep the initial account gate closed while unfinished recovery state is
      // restored. The bounded local read never calls Auth from its event callback.
      recovery.current.observe(next, event).then(() => {
        if (alive && version === sessionVersion) {
          setReady(true);
          appleRevocation?.check();
        }
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
    appleRevocation = observeAppleCredentialRevocation({
      apple: getNativeAppleAuthentication(),
      getSession: () => currentSession.current,
      enqueue: (action) => operations.current(action),
      onRevoked: async (target) => {
        assertCurrentSession(target);
        social.current?.cancel();
        await checked(supabase.auth.signOut({ scope: 'local' }));
      },
    });
    const refresh = (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        appleRevocation?.check();
      } else supabase.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    return () => {
      alive = false;
      social.current?.cancel();
      recoveryFlow.current?.dispose();
      recovery.current.suspend();
      subscription.unsubscribe();
      links.remove();
      appState.remove();
      appleRevocation?.dispose();
      supabase.auth.stopAutoRefresh();
    };
  }, []);
  const cancelRecovery = () => {
    const operation = recoveryFlow.current.cancel();
    // Observe an eager failure even while an older auth action holds the queue.
    // Return the original promise: the queued await still rejects fail-closed.
    operation.catch(() => {});
    return operation;
  };
  const signIn = (email, password) => {
    requireClient();
    const cancelledRecovery = cancelRecovery();
    return operations.current(async () => {
      await cancelledRecovery;
      return checked(authCredentialWriters.signInWithPassword({ email: email.trim(), password }));
    });
  };
  const signUp = (email, password) => {
    requireClient();
    const cancelledRecovery = cancelRecovery();
    return operations.current(async () => {
      await cancelledRecovery;
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
  const sendPasswordReset = (email) => {
    requireClient();
    return recoveryFlow.current.send(email.trim());
  };
  const updatePassword = async (password) => {
    const client = requireClient();
    const target = currentSession.current;
    const cancelledRecovery = cancelRecovery();
    return operations.current(async () => {
      await cancelledRecovery;
      assertCurrentSession(target);
      await checked(client.auth.updateUser({ password }));
      recovery.current.finish(target);
    });
  };
  const signOut = () => {
    const client = requireClient();
    const target = currentSession.current;
    const cancelledRecovery = cancelRecovery();
    return operations.current(async () => {
      await cancelledRecovery;
      assertCurrentSession(target);
      return checked(client.auth.signOut({ scope: 'local' }));
    });
  };
  const signInWithOAuth = async (provider) => {
    requireClient();
    await cancelRecovery();
    return social.current.signIn(provider);
  };
  const deleteAccount = async () => {
    const client = requireClient();
    const target = currentSession.current;
    const targetId = target?.user.id;
    if (!targetId) throw new Error('Sign in before deleting your account.');
    const cancelledRecovery = cancelRecovery();
    return operations.current(async () => {
      await cancelledRecovery;
      assertCurrentSession(target);
      const { data: deletion, error: failure } = await client.functions.invoke('delete-account', {
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
      invalidateBillingScope(AsyncStorage, targetId);
      const liveNamespaces = invalidateAccountStores(AsyncStorage, targetId);
      // SecureStore saves precede their AsyncStorage metadata. A previous crash
      // can leave a credential-only orphan, so cleanup cannot depend on key
      // discovery. These are exact keys for the deleted UID, never routing hints.
      const credentialNamespaces = [targetId, `review:1:${targetId}`, `unresolved:${targetId}`];
      for (const namespace of credentialNamespaces) invalidateAccountPlatforms(namespace);
      const cleanup = (async () => {
        // Registry reads drain older confirmations. Key-name discovery covers
        // legacy installs without a registry. A failed/corrupt registry cannot
        // prevent discovery or draining already-closed live local writers.
        const discovered = await Promise.allSettled([
          getKnownBillingNamespaces(AsyncStorage, targetId),
          discoverAccountNamespaces(AsyncStorage, targetId),
        ]);
        const namespaces = [
          ...new Set([
            ...liveNamespaces,
            ...discovered.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
          ]),
        ];
        const results = await Promise.allSettled([
          ...namespaces.map((namespace) =>
            clearAccountStore(AsyncStorage, targetId, { namespace }),
          ),
          ...credentialNamespaces.map((namespace) => clearAccountPlatforms(namespace)),
        ]);
        if ([...discovered, ...results].some((result) => result.status === 'rejected'))
          throw new Error();
        // Retain namespace knowledge if any cleanup fails, for a later retry.
        await forgetBillingScope(AsyncStorage, targetId);
      })().then(
        () => null,
        () => new Error('Your account was deleted, but some device records could not be removed.'),
      );
      try {
        if (currentUser.current === targetId) {
          await client.auth.signOut({ scope: 'local' });
          if (currentUser.current === targetId) setSession(null);
        }
      } catch {
        const failure = new Error(
          'Your account was deleted, but this device could not finish signing out.',
        );
        failure.apple_revocation = deletion?.apple_revocation;
        throw failure;
      } finally {
        const cleanupError = await cleanup;
        if (cleanupError) {
          // Remote deletion already succeeded. Keep Apple's required follow-up
          // instructions visible even when a local cache could not be removed.
          cleanupError.apple_revocation = deletion?.apple_revocation;
          throw cleanupError;
        }
      }
      return deletion;
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
