import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { useTheme } from './ThemeContext';
import { createAccountStore } from '../lib/accountStore';
import { createBackupSync } from '../lib/backupSync';
import { supabase } from '../lib/supabase';

const Context = createContext(null);
export const useAccountData = () => useContext(Context);
export function AccountDataProvider({ children }) {
  const { user, session } = useAuth();
  const authSession = useRef(session);
  authSession.current = session;
  const { isPro, ready: subscriptionReady } = useSubscription();
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState({ status: 'local', error: null, lastSyncedAt: null });
  const [guest, setGuest] = useState({ hasGuestData: false, importComplete: false });
  const engine = useRef(null);
  const timer = useRef(null);
  const paused = useRef(false);
  const schedule = useRef(() => {});
  const storage = useMemo(
    () => createAccountStore(AsyncStorage, user?.id, () => schedule.current()),
    [user?.id],
  );
  const syncNow = useCallback(async () => {
    if (!user) throw new Error('Sign in to use cloud backup.');
    if (!isPro) throw new Error('Cloud backup is included with Sync Pro.');
    if (paused.current) throw new Error('Finish your active workout before syncing.');
    return engine.current?.sync();
  }, [user?.id, isPro]);
  useEffect(() => {
    if (!subscriptionReady) return;
    let alive = true;
    const updateGuest = () =>
      storage.guestImportState().then((value) => {
        if (alive) setGuest(value);
      });
    updateGuest().catch(() => {});
    if (!user || !isPro || !supabase) {
      setState({ status: 'local', error: null, lastSyncedAt: null });
      setReady(true);
      return () => {
        alive = false;
      };
    }
    const sync = createBackupSync({
      local: storage,
      canSync: () => alive && !paused.current,
      remote: {
        read: async () => {
          const { data, error } = await supabase
            .from('account_backups')
            .select('payload,revision,updated_at')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        write: async (payload, revision) => {
          const captured = authSession.current;
          if (!alive || captured?.user.id !== user.id)
            throw new Error('Your account changed. Please retry.');
          const { data, error } = await supabase
            .rpc('save_account_backup', {
              expected_revision: revision,
              backup_payload: payload,
              backup_user_id: user.id,
            })
            .setHeader('Authorization', `Bearer ${captured.access_token}`)
            .single();
          if (error) throw error;
          return data;
        },
      },
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
    sync
      .sync()
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
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
  }, [user?.id, isPro, subscriptionReady, storage]);
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
    ready,
    ...state,
    ...guest,
    importGuestData,
    syncNow,
    resolveConflict,
    setSyncPaused,
  };
  return (
    <Context.Provider value={value}>
      {ready ? (
        <React.Fragment key={epoch}>{children}</React.Fragment>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      )}
    </Context.Provider>
  );
}
