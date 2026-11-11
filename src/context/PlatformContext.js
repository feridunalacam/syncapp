import { useAccountData } from './AccountDataContext';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Alert } from 'react-native';
import { STORAGE_KEYS } from '../lib/storage';
import spotifyService from '../services/spotify';
import deviceMusicService from '../services/deviceMusicService';
import { loadPlatforms, savePlatforms } from '../lib/platformStorage';
import { createMusicConnections } from '../lib/musicConnections';
export const PLATFORMS = {
  spotify: { id: 'spotify', name: 'Spotify', color: '#1DB954', icon: 'musical-notes-outline' },
  device: { id: 'device', name: 'Device', color: '#A4A8AC', icon: 'musical-notes' },
};
const services = { spotify: spotifyService, device: deviceMusicService };
const defaults = { device: { connected: true, accessToken: 'device' } };
const PlatformContext = createContext({ connectedPlatforms: defaults, services, ready: false });
export function PlatformProvider({ children }) {
  const { storage } = useAccountData();
  const platformOptions = { storage, accountId: storage.userId };
  const [connectedPlatforms, setConnectedPlatforms] = useState(defaults);
  const [selectedPlatform, setSelected] = useState(null);
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const store = useRef(null);
  const selected = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let initial = defaults;
      let selection = null;
      try {
        [initial, selection] = await Promise.all([
          loadPlatforms(platformOptions),
          storage.getString(STORAGE_KEYS.SELECTED_PLATFORM),
        ]);
      } catch {
        if (alive) setConnectionError('Saved connection could not be loaded. Reconnect Spotify.');
      }
      if (!alive) return;
      const manager = createMusicConnections({
        initial,
        save: (value) => savePlatforms(value, platformOptions),
        services,
        onChange: (next) => {
          if (alive) {
            setConnectedPlatforms(next);
            if (selected.current && !next[selected.current]?.connected) {
              selected.current = null;
              setSelected(null);
              storage.setString(STORAGE_KEYS.SELECTED_PLATFORM, null);
            }
          }
        },
      });
      store.current = manager;
      setConnectedPlatforms(initial);
      selected.current = initial[selection]?.connected ? selection : null;
      setSelected(selected.current);
      setReady(true);
    })();
    return () => {
      alive = false;
      store.current?.dispose();
    };
  }, []);
  const connectPlatform = useCallback(async (id, data) => {
    if (!store.current) throw new Error('Music is still loading.');
    await store.current.connect(id, data);
    setConnectionError(null);
  }, []);
  const disconnectPlatform = useCallback(async (id) => {
    try {
      await store.current?.disconnect(id);
      setConnectionError(null);
    } catch {
      setConnectionError('Could not save the disconnection. Please try again.');
      Alert.alert('Connection could not be changed', 'Please try again.');
    }
  }, []);
  const refreshToken = useCallback(async (id = null) => {
    const target = id || selected.current;
    if (!target || target === 'device') return target === 'device' ? 'device' : null;
    try {
      const token = await store.current?.refresh(target);
      if (token) setConnectionError(null);
      return token;
    } catch {
      setConnectionError('Spotify could not reconnect. Check your connection and try again.');
      return null;
    }
  }, []);
  const getValidAccessToken = useCallback(
    async (id) => {
      if (id === 'device') return 'device';
      const connection = store.current?.getState()[id];
      if (!connection?.connected) return null;
      if (!connection.accessToken || !connection.expiresAt || connection.expiresAt <= Date.now())
        return refreshToken(id);
      return connection.accessToken;
    },
    [refreshToken],
  );
  const handleSetSelectedPlatform = useCallback(async (id) => {
    if (id && !store.current?.getState()[id]?.connected) return;
    selected.current = id;
    setSelected(id);
    await storage.setString(STORAGE_KEYS.SELECTED_PLATFORM, id);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      Object.entries(store.current.getState()).forEach(([id, data]) => {
        if (id !== 'device' && data.connected && (!data.expiresAt || data.expiresAt <= Date.now()))
          refreshToken(id);
      });
    };
    check();
    const timer = setInterval(check, 60000);
    const listener = AppState.addEventListener('change', (value) => {
      if (value === 'active') check();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [ready, refreshToken]);
  const value = useMemo(
    () => ({
      PLATFORMS,
      connectedPlatforms,
      selectedPlatform,
      musicPlayer: services[selectedPlatform] || services.device,
      services,
      ready,
      connectionError,
      connectPlatform,
      disconnectPlatform,
      setSelectedPlatform: handleSetSelectedPlatform,
      isPlatformConnected: (id) => !!connectedPlatforms[id]?.connected,
      refreshToken,
      getValidAccessToken,
      refreshSpotifyToken: () => refreshToken('spotify'),
    }),
    [
      connectedPlatforms,
      selectedPlatform,
      ready,
      connectionError,
      connectPlatform,
      disconnectPlatform,
      handleSetSelectedPlatform,
      refreshToken,
      getValidAccessToken,
    ],
  );
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
export const usePlatformContext = () => useContext(PlatformContext);
