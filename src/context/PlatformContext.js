import { Alert } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spotifyAPI } from '../utils/spotifyAPI';
import spotifyService from '../services/spotifyService';
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

const TOKEN_REFRESH_BUFFER_SECONDS = 60; // Refresh 1 minute before expiry
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

const computeExpiresAt = (expiresInSeconds) => {
  const ttl =
    typeof expiresInSeconds === 'number' && expiresInSeconds > TOKEN_REFRESH_BUFFER_SECONDS
      ? expiresInSeconds
      : DEFAULT_TOKEN_TTL_SECONDS;
  return Date.now() + (ttl - TOKEN_REFRESH_BUFFER_SECONDS) * 1000;
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
    const loadPlatformData = async () => {
      try {
        const storedPlatforms = await AsyncStorage.getItem('connectedPlatforms');
        const storedSelected = await AsyncStorage.getItem('selectedPlatform');

        let parsedPlatforms = {};
        if (storedPlatforms) {
          parsedPlatforms = JSON.parse(storedPlatforms);
          setConnectedPlatforms(parsedPlatforms);
        }
        if (storedSelected) {
          setSelectedPlatform(storedSelected);
          if (services[storedSelected] && parsedPlatforms[storedSelected]?.connected) {
            setMusicPlayer(() => services[storedSelected]);
          }
        }
      } catch (error) {
        console.error('Error loading platform data:', error);
      }
    };

    loadPlatformData();
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

  // Memoize savePlatformData to avoid recreating on every render
  const savePlatformData = useCallback(async (platforms, selected) => {
    try {
      await AsyncStorage.setItem('connectedPlatforms', JSON.stringify(platforms));
      if (selected) {
        await AsyncStorage.setItem('selectedPlatform', selected);
      } else {
        await AsyncStorage.removeItem('selectedPlatform');
      }
    } catch (error) {
      console.error('Error saving platform data:', error);
    }
  }, []);

  const connectPlatform = useCallback(
    (platformId, data = {}) => {
      setConnectedPlatforms((prev) => {
        const existing = prev[platformId] || {};
        const refreshToken =
          data.refreshToken !== undefined ? data.refreshToken : existing.refreshToken || null;
        const expiresAt =
          data.expiresAt ||
          (data.expiresIn ? computeExpiresAt(data.expiresIn) : existing.expiresAt || null);

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
        const expiresAt = computeExpiresAt(tokenResult.expiresIn);
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


