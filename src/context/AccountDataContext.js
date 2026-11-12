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
import { billingScopeActive, sameBillingScope } from '../lib/accountBillingScope';
import { createAccountBackupRemote } from '../lib/accountBackupRemote';

const Context = createContext(null);
export const useAccountData = () => useContext(Context);
export function AccountDataProvider({ children }) {
  const { user, session } = useAuth();
  const authSession = useRef(session);
  authSession.current = session;
  const {
    isPro,
    ready: subscriptionReady,
    scope,
    scopeConfirmed,
    accessVerified,
  } = useSubscription();
  const access = useRef(null);
  access.current = { userId: user?.id, scope, scopeConfirmed, accessVerified, isPro };
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
  const localReady = preparedStorage === storage;
  const reportLoadFailure = useCallback(() => {
    setPreparedStorage(null);
    setLocalError(true);
  }, []);
  const syncNow = useCallback(async () => {
    if (!user) throw new Error('Sign in to use cloud backup.');
    if (!isPro) throw new Error('Cloud backup is included with Sync Pro.');
    if (paused.current) throw new Error('Finish your active workout before syncing.');
    return engine.current?.sync();
  }, [user?.id, isPro]);
  useEffect(() => {
    let alive = true;
    setPreparedStorage(null);
    setLocalError(false);
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
  }, [storage, loadAttempt]);
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
        if (alive) setEpoch((value) => value + 1);
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
    setEpoch((value) => value + 1);
    schedule.current();
  };
  const resolveConflict = async (choice) => {
    if (!['cloud', 'local'].includes(choice)) throw new Error('Choose a valid backup.');
    if (paused.current) throw new Error('Finish your active workout before restoring a backup.');
    return engine.current?.sync(choice);
  };
  const setSyncPaused = useCallback((value) => {
    paused.current = value;
    if (!value) schedule.current();
  }, []);
  const value = {
    storage,
    ready: localReady,
    ...state,
    ...guest,
    importGuestData,
    syncNow,
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
          {localError ? (
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
