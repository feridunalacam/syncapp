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
import { SPOTIFY_AVAILABLE } from '../services/spotify/config';
import { SPOTIFY_UNAVAILABLE_MESSAGE } from '../services/spotify/availability';
import deviceMusicService from '../services/deviceMusicService';
import appleMusicService from '../services/appleMusic';
import { loadPlatforms, savePlatforms } from '../lib/platformStorage';
import { createMusicConnections } from '../lib/musicConnections';
export const PLATFORMS = {
  spotify: { id: 'spotify', name: 'Spotify', color: '#1DB954', icon: 'musical-notes-outline' },
  appleMusic: { id: 'appleMusic', name: 'Apple Music', color: '#FA445A', icon: 'logo-apple' },
  device: { id: 'device', name: 'Device', color: '#A4A8AC', icon: 'musical-notes' },
};
const services = {
  spotify: spotifyService,
  appleMusic: appleMusicService,
  device: deviceMusicService,
};
const isAvailable = (id) =>
  id === 'device' ||
  (id === 'spotify' && SPOTIFY_AVAILABLE) ||
  (id === 'appleMusic' && appleMusicService.available);
const defaults = { device: { connected: true, accessToken: 'device' } };
const PlatformContext = createContext({ connectedPlatforms: defaults, services, ready: false });
export function PlatformProvider({ children }) {
  const { storage } = useAccountData();
  const platformOptions = { storage, accountId: storage.namespace };
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
        if (alive)
          setConnectionError('Saved music connections could not be loaded. Please reconnect.');
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
      selected.current = initial[selection]?.connected && isAvailable(selection) ? selection : null;
      setSelected(selected.current);
      setReady(true);
    })();
    return () => {
      alive = false;
      store.current?.dispose();
    };
  }, []);
  const connectPlatform = useCallback(async (id, data) => {
    if (id === 'spotify' && !SPOTIFY_AVAILABLE) throw new Error(SPOTIFY_UNAVAILABLE_MESSAGE);
    if (!isAvailable(id)) throw new Error('This music source cannot connect in this build.');
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
    if (target === 'spotify' && !SPOTIFY_AVAILABLE) return null;
    if (!target || target === 'device') return target === 'device' ? 'device' : null;
    if (!isAvailable(target) || target === 'appleMusic') return null;
    try {
      const token = await store.current?.refresh(target);
      if (token) setConnectionError(null);
      return token;
    } catch {
      setConnectionError('Music could not reconnect. Check your connection and try again.');
      return null;
    }
  }, []);
  const getValidAccessToken = useCallback(
    async (id) => {
      if (id === 'spotify' && !SPOTIFY_AVAILABLE) throw new Error(SPOTIFY_UNAVAILABLE_MESSAGE);
      if (id === 'device') return 'device';
      if (!isAvailable(id))
        throw new Error(
          services[id]?.unavailableMessage ||
            'This music source is unavailable in this build. Choose Device audio or reconnect in Profile.',
        );
      const connection = store.current?.getState()[id];
      if (!connection?.connected) return null;
      if (id === 'appleMusic') {
        try {
          return (await appleMusicService.getAccessToken()).accessToken;
        } catch (error) {
          if (['denied', 'restricted'].includes(error.code)) {
            const manager = store.current;
            if (manager?.getState()[id] === connection) {
              try {
                await manager.disconnect(id);
              } catch {
                /* Keep the request blocked even if persistence fails. */
              }
              setConnectionError(error.userMessage || 'Reconnect Apple Music in Profile.');
            }
          }
          throw error;
        }
      }
      if (!connection.accessToken || !connection.expiresAt || connection.expiresAt <= Date.now())
        return refreshToken(id);
      return connection.accessToken;
    },
    [refreshToken],
  );
  const handleSetSelectedPlatform = useCallback(async (id) => {
    if (id && !isAvailable(id)) return;
    if (id && !store.current?.getState()[id]?.connected) return;
    selected.current = id;
    setSelected(id);
    await storage.setString(STORAGE_KEYS.SELECTED_PLATFORM, id);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      Object.entries(store.current.getState()).forEach(([id, data]) => {
        if (
          isAvailable(id) &&
          !!data.refreshToken &&
          data.connected &&
          (!data.expiresAt || data.expiresAt <= Date.now())
        )
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
      connectedPlatforms: Object.fromEntries(
        Object.entries(connectedPlatforms).filter(([id]) => isAvailable(id)),
      ),
      selectedPlatform,
      musicPlayer: services[selectedPlatform] || services.device,
      services,
      ready,
      connectionError,
      connectPlatform,
      disconnectPlatform,
      setSelectedPlatform: handleSetSelectedPlatform,
      isPlatformConnected: (id) => isAvailable(id) && !!connectedPlatforms[id]?.connected,
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
