import { Alert } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import storage, { STORAGE_KEYS } from '../lib/storage';
import spotifyService from '../services/spotify';
import { computeAccessTokenExpiresAt } from '../services/spotify/auth';
import deviceMusicService from '../services/deviceMusicService';

export const PLATFORMS = {
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    color: '#1DB954',
    icon: 'logo-spotify',
  },
  device: {
    id: 'device',
    name: 'Device',
    color: '#6366f1',
    icon: 'musical-notes',
  },
};

const PlatformContext = createContext({
  connectedPlatforms: {},
  selectedPlatform: null,
  musicPlayer: null,
  services: {},
  connectPlatform: () => {},
  disconnectPlatform: () => {},
  setSelectedPlatform: () => {},
  isPlatformConnected: () => false,
  refreshToken: async () => null,
});

const services = {
  spotify: spotifyService,
  device: deviceMusicService,
  // ... add other services here as they are implemented
};

export const PlatformProvider = ({ children }) => {
  // Device platform is always available
  const [connectedPlatforms, setConnectedPlatforms] = useState({
    device: {
      connected: true,
      accessToken: 'device',
      connectedAt: new Date().toISOString(),
    },
  });
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [musicPlayer, setMusicPlayer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [parsedPlatforms, storedSelected] = await Promise.all([
        storage.getJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, null),
        storage.getString(STORAGE_KEYS.SELECTED_PLATFORM),
      ]);
      if (cancelled) return;

      if (parsedPlatforms && typeof parsedPlatforms === 'object') {
        setConnectedPlatforms(parsedPlatforms);
      }
      if (storedSelected) {
        setSelectedPlatform(storedSelected);
        const candidate = services[storedSelected];
        if (candidate && parsedPlatforms?.[storedSelected]?.connected) {
          setMusicPlayer(() => candidate);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Device is always available, other platforms need to be connected
    if (selectedPlatform === 'device') {
      setMusicPlayer(() => services.device);
    } else if (selectedPlatform && services[selectedPlatform] && connectedPlatforms[selectedPlatform]?.connected) {
      setMusicPlayer(() => services[selectedPlatform]);
    } else if (!selectedPlatform) {
      // Default to device if no platform selected
      setMusicPlayer(() => services.device);
    } else {
      setMusicPlayer(null);
    }
  }, [selectedPlatform, connectedPlatforms]);

  const savePlatformData = useCallback(async (platforms, selected) => {
    await storage.setJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, platforms);
    await storage.setString(STORAGE_KEYS.SELECTED_PLATFORM, selected || null);
  }, []);

  const connectPlatform = useCallback(
    (platformId, data = {}) => {
      setConnectedPlatforms((prev) => {
        const existing = prev[platformId] || {};
        const refreshToken =
          data.refreshToken !== undefined ? data.refreshToken : existing.refreshToken || null;
        const expiresAt =
          data.expiresAt ||
          (data.expiresIn ? computeAccessTokenExpiresAt(data.expiresIn) : existing.expiresAt || null);

        const updated = {
          ...prev,
          [platformId]: {
            ...existing,
            connected: true,
            ...data,
            refreshToken,
            expiresAt,
            connectedAt: new Date().toISOString(),
          },
        };
        savePlatformData(updated, selectedPlatform).catch(console.error);
        return updated;
      });
    },
    [selectedPlatform],
  );

  const disconnectPlatform = useCallback(
    (platformId) => {
      setConnectedPlatforms((prev) => {
        const updated = { ...prev };
        delete updated[platformId];
        const newSelected = selectedPlatform === platformId ? null : selectedPlatform;
        if (selectedPlatform === platformId) {
          setSelectedPlatform(null);
        }
        savePlatformData(updated, newSelected).catch(console.error);
        return updated;
      });
    },
    [selectedPlatform],
  );

  const handleSetSelectedPlatform = useCallback(
    (platformId) => {
      if (platformId && connectedPlatforms[platformId]?.connected) {
        setSelectedPlatform(platformId);
        savePlatformData(connectedPlatforms, platformId).catch(console.error);
      } else if (!platformId) {
        setSelectedPlatform(null);
        savePlatformData(connectedPlatforms, null).catch(console.error);
      }
    },
    [connectedPlatforms],
  );

  const isPlatformConnected = useCallback(
    (platformId) => connectedPlatforms[platformId]?.connected === true,
    [connectedPlatforms],
  );

  // Generic token refresh function - works for any platform
  const refreshToken = useCallback(async (platformId = null) => {
    const targetPlatformId = platformId || selectedPlatform;
    if (!targetPlatformId) {
      console.warn('Cannot refresh token: no platform specified');
      return null;
    }

    const platform = connectedPlatforms?.[targetPlatformId];
    if (!platform?.connected || !platform?.refreshToken) {
      console.warn(`Cannot refresh ${targetPlatformId} token: not connected or no refresh token`);
      return null;
    }

    // Get the service for this platform
    const service = services[targetPlatformId];
    if (!service || !service.getAccessToken) {
      console.warn(`Platform ${targetPlatformId} does not support token refresh`);
      return null;
    }

    try {
      const tokenResult = await service.getAccessToken(platform.refreshToken);
      if (tokenResult?.accessToken) {
        const expiresAt = computeAccessTokenExpiresAt(tokenResult.expiresIn);
        // Update the stored access token
        setConnectedPlatforms((prev) => {
          const updated = {
            ...prev,
            [targetPlatformId]: {
              ...prev[targetPlatformId],
              accessToken: tokenResult.accessToken,
              expiresAt,
            },
          };
          savePlatformData(updated, selectedPlatform).catch(console.error);
          return updated;
        });
        return tokenResult.accessToken;
      }
      if (tokenResult?.shouldDisconnect || tokenResult?.errorCode === 'invalid_grant') {
        const platformName = PLATFORMS[targetPlatformId]?.name || targetPlatformId;
        Alert.alert(
          `${platformName} Session Ended`,
          `${platformName} disconnected because the session expired. Please reconnect to continue playback.`,
        );
        disconnectPlatform(targetPlatformId);
      } else if (tokenResult?.error) {
        console.error(`${targetPlatformId} token refresh failed:`, tokenResult.errorCode || tokenResult.error);
      }
      return null;
    } catch (error) {
      console.error(`Error refreshing ${targetPlatformId} token:`, error);
      return null;
    }
  }, [connectedPlatforms, selectedPlatform, disconnectPlatform]);

  // Automatically refresh tokens for all connected platforms periodically & before they expire
  useEffect(() => {
    const refreshIntervals = [];

    Object.keys(connectedPlatforms).forEach((platformId) => {
      const platform = connectedPlatforms[platformId];
      if (!platform?.connected || !platform?.refreshToken) {
        return;
      }

      const maybeRefreshSoon = async () => {
        if (!platform.accessToken) {
          await refreshToken(platformId);
          return;
        }

        if (platform.expiresAt && Date.now() >= platform.expiresAt - 2 * 60 * 1000) {
          await refreshToken(platformId);
        }
      };

      maybeRefreshSoon().catch(console.error);

      const interval = setInterval(() => {
        refreshToken(platformId).catch(console.error);
      }, 45 * 60 * 1000); // refresh every 45 minutes as a safety net

      refreshIntervals.push(interval);
    });

    return () => {
      refreshIntervals.forEach((interval) => clearInterval(interval));
    };
  }, [connectedPlatforms, refreshToken]);

  const value = useMemo(
    () => ({
      PLATFORMS,
      connectedPlatforms,
      selectedPlatform,
      musicPlayer,
      services,
      connectPlatform,
      disconnectPlatform,
      setSelectedPlatform: handleSetSelectedPlatform,
      isPlatformConnected,
      refreshToken,
      // Legacy support - deprecated, use refreshToken instead
      refreshSpotifyToken: () => refreshToken('spotify'),
    }),
    [
      connectedPlatforms,
      selectedPlatform,
      musicPlayer,
      connectPlatform,
      disconnectPlatform,
      handleSetSelectedPlatform,
      isPlatformConnected,
      refreshToken,
    ],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
};

export const usePlatformContext = () => useContext(PlatformContext);


