import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, ActivityIndicator, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { useTheme } from './ThemeContext';
import { createAccountStore } from '../lib/accountStore';
import { createBackupSync } from '../lib/backupSync';
import { supabase } from '../lib/supabase';
import {
  billingScopeActive,
  parseBillingScope,
  sameBillingScope,
} from '../lib/accountBillingScope';
import { createAccountBackupRemote } from '../lib/accountBackupRemote';

const Context = createContext(null);
export const useAccountData = () => useContext(Context);
export function AccountDataProvider({ children }) {
  const { user, session, signOut } = useAuth();
  const authSession = useRef(session);
  authSession.current = session;
  const {
    isPro,
    ready: subscriptionReady,
    scope: subscriptionScope,
    scopeConfirmed,
    accessVerified,
    error: subscriptionError,
    refresh,
  } = useSubscription();
  const scope = useMemo(() => {
    if (!user) return null;
    try {
      return parseBillingScope(subscriptionScope, user.id);
    } catch {
      return null;
    }
  }, [subscriptionScope, user?.id]);
  const hasLocalScope = !user || !!scope;
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;
  const scopeOperation = useRef(null);
  const [scopeAction, setScopeAction] = useState(null);
  useEffect(() => {
    setScopeAction(null);
    return () => {
      scopeOperation.current = null;
    };
  }, [user?.id]);
  const access = useRef(null);
  access.current = {
    userId: user?.id,
    scope,
    scopeConfirmed,
    accessVerified,
    isPro,
    ready: subscriptionReady,
  };
  const { theme } = useTheme();
  const [preparedStorage, setPreparedStorage] = useState(null);
  const [localError, setLocalError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState({ status: 'local', error: null, lastSyncedAt: null });
  const [guest, setGuest] = useState({ hasGuestData: false, importComplete: false });
  const engine = useRef(null);
  const timer = useRef(null);
  const paused = useRef(false);
  const schedule = useRef(() => {});
  const storage = useMemo(
    () =>
      createAccountStore(AsyncStorage, user?.id, () => schedule.current(), {
        namespace: user ? scope?.namespace || `unresolved:${user.id}` : null,
        allowGuestImport: !!user && scope?.lane === 'production',
      }),
    [user?.id, scope?.namespace],
  );
  const currentStorage = useRef(storage);
  currentStorage.current = storage;
  const currentEpoch = useRef(epoch);
  currentEpoch.current = epoch;
  const recoveryReloadPending = useRef(null);
  const previewIntents = useRef(new WeakMap());
  const localReady = hasLocalScope && preparedStorage === storage;
  const currentLocalReady = useRef(localReady);
  currentLocalReady.current = localReady;
  const scopeBusy = scopeAction?.userId === user?.id && scopeAction?.pending;
  const scopeFailed =
    !hasLocalScope &&
    !scopeBusy &&
    (subscriptionReady || subscriptionError || scopeAction?.userId === user?.id);
  const retryAccountAccess = async (withoutAccount = false) => {
    const userId = user?.id;
    if (!userId || currentUser.current !== userId || scopeOperation.current?.userId === userId)
      return;
    const operation = { userId };
    scopeOperation.current = operation;
    setScopeAction({ userId, pending: true });
    try {
      if (withoutAccount) await signOut();
      else await refresh();
    } catch {
      // Keep the account screen closed; neither action may select another namespace.
    } finally {
      if (scopeOperation.current === operation) {
        scopeOperation.current = null;
        if (currentUser.current === userId) setScopeAction({ userId, pending: false });
      }
    }
  };
  const reportLoadFailure = useCallback(() => {
    setPreparedStorage(null);
    setLocalError(true);
  }, []);
  const syncNow = useCallback(async () => {
    if (!user) throw new Error('Sign in to use cloud backup.');
    if (!isPro) throw new Error('Cloud backup is included with Sync Pro.');
    if (paused.current) throw new Error('Finish your active workout before syncing.');
    if (
      currentUser.current !== user.id ||
      currentStorage.current !== storage ||
      authSession.current?.user?.id !== user.id ||
      !authSession.current?.access_token
    )
      throw new Error('Your account changed. Sign in and verify this account before syncing.');
    const sync = engine.current;
    if (
      !localReady ||
      !currentLocalReady.current ||
      !subscriptionReady ||
      !access.current?.ready ||
      !access.current?.scopeConfirmed ||
      !access.current?.accessVerified ||
      !access.current?.isPro ||
      !sameBillingScope(scope, access.current?.scope) ||
      !billingScopeActive(access.current?.scope) ||
      !sync
    )
      throw new Error('Cloud backup is not ready. Refresh account access in Sync Pro, then retry.');
    return sync.sync();
  }, [user?.id, isPro, storage, localReady, subscriptionReady, scope]);
  useEffect(() => {
    let alive = true;
    setPreparedStorage(null);
    setLocalError(false);
    if (!hasLocalScope) return;
    storage.prepare().then(
      () => {
        if (alive) setPreparedStorage(storage);
      },
      () => {
        if (alive) setLocalError(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [storage, loadAttempt, hasLocalScope]);
  useEffect(() => {
    if (!localReady || !subscriptionReady) return;
    let alive = true;
    const updateGuest = () =>
      storage.guestImportState().then((value) => {
        if (alive) setGuest(value);
      });
    updateGuest().catch(() => {});
    if (
      !user ||
      !isPro ||
      !supabase ||
      !scopeConfirmed ||
      !accessVerified ||
      !billingScopeActive(scope)
    ) {
      setState({ status: 'local', error: null, lastSyncedAt: null });
      return () => {
        alive = false;
      };
    }
    const sync = createBackupSync({
      local: storage,
      canSync: () =>
        alive &&
        !paused.current &&
        access.current?.scopeConfirmed &&
        access.current?.accessVerified &&
        access.current?.isPro &&
        sameBillingScope(scope, access.current.scope) &&
        billingScopeActive(access.current.scope),
      remote: createAccountBackupRemote({
        client: supabase,
        scope,
        getSession: () => authSession.current,
        isCurrent: () =>
          alive &&
          access.current?.userId === user.id &&
          access.current?.scopeConfirmed &&
          access.current?.accessVerified &&
          access.current?.isPro &&
          sameBillingScope(scope, access.current.scope) &&
          billingScopeActive(access.current.scope),
      }),
      onState: (next) => {
        if (alive)
          setState((previous) => ({
            ...next,
            lastSyncedAt: next.lastSyncedAt || previous.lastSyncedAt,
          }));
      },
      onRestore: () => {
        if (alive) {
          currentEpoch.current += 1;
          setEpoch((value) => value + 1);
        }
      },
    });
    engine.current = sync;
    const safelySync = () => {
      if (!paused.current) sync.sync().catch(() => {});
    };
    schedule.current = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(safelySync, 1500);
    };
    sync.sync().catch(() => {});
    const active = AppState.addEventListener('change', (value) => {
      if (value === 'active') safelySync();
    });
    const periodic = setInterval(safelySync, 60000);
    return () => {
      alive = false;
      schedule.current = () => {};
      clearTimeout(timer.current);
      clearInterval(periodic);
      active.remove();
      sync.stop();
      engine.current = null;
    };
  }, [
    user?.id,
    isPro,
    subscriptionReady,
    storage,
    localReady,
    scopeConfirmed,
    accessVerified,
    scope?.active,
  ]);
  const importGuestData = async () => {
    if (paused.current) throw new Error('Finish your active workout before importing records.');
    await storage.importGuestData();
    setGuest(await storage.guestImportState());
    currentEpoch.current += 1;
    setEpoch((value) => value + 1);
    schedule.current();
  };
  const captureIntent = (kind, nativeIntent, syncEngine = null) => {
    const intent = {};
    previewIntents.current.set(intent, {
      kind,
      nativeIntent,
      storage,
      scope,
      epoch: currentEpoch.current,
      token: authSession.current?.access_token,
      syncEngine,
    });
    return intent;
  };
  const isCurrentCopy = (copy) =>
    copy?.storage === storage &&
    currentStorage.current === storage &&
    currentUser.current === user?.id &&
    copy.epoch === currentEpoch.current &&
    copy.token === authSession.current?.access_token &&
    sameBillingScope(copy.scope, access.current?.scope) &&
    !paused.current;
  const getRecoveryPreview = async () => {
    if (!user || currentStorage.current !== storage || !localReady)
      throw new Error('Open this account before reviewing saved device records.');
    if (paused.current) throw new Error('Finish your active workout before recovering records.');
    const capture = {
      storage,
      scope,
      epoch: currentEpoch.current,
      token: authSession.current?.access_token,
    };
    const preview = await storage.getRecoveryPreview();
    if (!isCurrentCopy(capture))
      throw new Error('Your account or workout changed. Review the copy again.');
    return preview ? { ...preview, intent: captureIntent('recovery', preview.intent) } : null;
  };
  const getBackupPreview = async () => {
    const sync = engine.current;
    if (!sync || !user || currentStorage.current !== storage)
      throw new Error('Verify this account’s Sync Pro access before reviewing cloud backup.');
    const capture = {
      storage,
      scope,
      epoch: currentEpoch.current,
      token: authSession.current?.access_token,
    };
    const preview = await sync.getBackupPreview();
    if (!isCurrentCopy(capture) || engine.current !== sync)
      throw new Error('Your account or workout changed. Review both copies again.');
    return { ...preview, intent: captureIntent('backup', preview.intent, sync) };
  };
  const recoverDeviceCopy = async (intent) => {
    const copy = intent && previewIntents.current.get(intent);
    if (copy?.kind !== 'recovery' || !isCurrentCopy(copy))
      throw new Error('Your account or workout changed. Review the saved device copy again.');
    const applied = await storage.recoverDeviceCopy(copy.nativeIntent, () => isCurrentCopy(copy));
    if (!applied) throw new Error('Your records changed. Review the saved device copy again.');
    if (!isCurrentCopy(copy)) {
      recoveryReloadPending.current = copy;
      return { status: 'paused' };
    }
    currentEpoch.current += 1;
    setEpoch((value) => value + 1);
    setState((previous) => ({
      ...previous,
      status: 'conflict',
      error: 'Recovered records are on this device. Review both copies before syncing.',
    }));
    return { status: 'recovered' };
  };
  const resolveConflict = async (choice, intent) => {
    if (!['cloud', 'local'].includes(choice)) throw new Error('Choose a valid backup.');
    if (paused.current) throw new Error('Finish your active workout before restoring a backup.');
    const copy = intent && previewIntents.current.get(intent);
    if (copy?.kind !== 'backup' || !isCurrentCopy(copy) || copy.syncEngine !== engine.current)
      throw new Error('Review both copies again before choosing a backup.');
    return copy.syncEngine.sync(
      choice,
      copy.nativeIntent,
      () => isCurrentCopy(copy) && copy.syncEngine === engine.current,
    );
  };
  const setSyncPaused = useCallback((value) => {
    paused.current = value;
    if (!value) {
      const pending = recoveryReloadPending.current;
      recoveryReloadPending.current = null;
      if (
        pending &&
        pending.storage === currentStorage.current &&
        sameBillingScope(pending.scope, access.current?.scope)
      ) {
        currentEpoch.current += 1;
        setEpoch((previous) => previous + 1);
      }
      schedule.current();
    }
  }, []);
  const value = {
    storage,
    ready: localReady,
    ...state,
    ...guest,
    importGuestData,
    syncNow,
    getBackupPreview,
    getRecoveryPreview,
    recoverDeviceCopy,
    resolveConflict,
    setSyncPaused,
    reportLoadFailure,
  };
  return (
    <Context.Provider value={value}>
      {localReady ? (
        <React.Fragment key={`${storage.namespace || 'guest'}:${epoch}`}>{children}</React.Fragment>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
          {scopeFailed ? (
            <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
              <Text accessibilityRole="alert" style={{ color: theme.text, textAlign: 'center' }}>
                Account access could not be checked. Your saved records remain on this device. Retry
                to open this account’s records, or use Sync without an account.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => retryAccountAccess()}
                style={{ padding: 16, borderRadius: 16, backgroundColor: theme.accent }}
              >
                <Text style={{ color: theme.accentText, fontWeight: '600' }}>Retry</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => retryAccountAccess(true)}
                style={{ padding: 16 }}
              >
                <Text style={{ color: theme.text }}>Use without an account</Text>
              </Pressable>
            </View>
          ) : hasLocalScope && localError ? (
            <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
              <Text accessibilityRole="alert" style={{ color: theme.text, textAlign: 'center' }}>
                Saved records could not be opened. Retry to recover this device’s data.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLoadAttempt((value) => value + 1)}
                style={{ padding: 16, borderRadius: 16, backgroundColor: theme.accent }}
              >
                <Text style={{ color: theme.accentText, fontWeight: '600' }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator color={theme.accent} />
          )}
        </View>
      )}
    </Context.Provider>
  );
}
