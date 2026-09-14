import { readSpotifyPages } from './library.js';
import { resolvePlaybackDevice, canControlVolume, canControlDevice } from './devices.js';
import { runVerifiedCommand } from './commands.js';
import { startVerifiedTrack } from './playback.js';
import { transferVerifiedPlayback } from './transfer.js';

const contextPlaybackDevices = new Set();
const playbackDevices = new Map();
const playbackTrackCache = new Map();
import { SPOTIFY_CLIENT_ID } from './config';

const NETWORK_RETRY_ATTEMPTS = 2;
const NETWORK_RETRY_BASE_DELAY_MS = 400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error) => {
  if (!error) {
    return false;
  }
  const message = String(error.message || error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('timed out') ||
    message.includes('certificate')
  );
};

// Spotify API Helper Functions
export const spotifyAPI = {
  async getAccessToken(refreshToken) {
    try {
      // Validate inputs
      if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
        console.error('Token refresh failed: Invalid or missing refresh token');
        return null;
      }

      if (
        !SPOTIFY_CLIENT_ID ||
        typeof SPOTIFY_CLIENT_ID !== 'string' ||
        SPOTIFY_CLIENT_ID.trim() === ''
      ) {
        console.error('Token refresh failed: Invalid or missing client ID');
        return null;
      }

      // Construct the request body
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken.trim());
      params.append('client_id', SPOTIFY_CLIENT_ID.trim());

      // For mobile apps, we don't send client_secret (public client)
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}`, message: errorText || 'Unknown error' };
        }
        console.error('Token refresh failed:', response.status, errorData);

        const errorCode =
          typeof errorData?.error === 'string'
            ? errorData.error
            : errorData?.error?.message || 'unknown_error';
        const errorDescription =
          errorData?.error_description ||
          errorData?.message ||
          errorData?.error?.description ||
          'Unknown error';

        return {
          error: errorDescription,
          errorCode,
          status: response.status,
          shouldDisconnect: response.status === 400 && errorCode === 'invalid_grant',
        };
      }

      const data = await response.json();
      if (!data.access_token) {
        console.error('Token refresh failed: No access token in response');
        return null;
      }
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 3600,
      };
    } catch (error) {
      console.error('Error refreshing token:', error);
      return {
        error: error.message || 'Unknown error',
        status: 0,
      };
    }
  },

  async makeRequest(endpoint, method, accessToken, body = null, refreshCallback = null) {
    try {
      const options = {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, options);

      // Handle non-OK responses
      if (!response.ok) {
        const errorText = await response.text();

        // Some Spotify responses (notably player control endpoints) occasionally
        // return the "no active device" message as plain text instead of JSON.
        // Detect that early so we can return a friendly error before logging.
        if (response.status === 404 && /no active device/i.test(errorText || '')) {
          return {
            success: false,
            error: 'No active Spotify device found. Open Spotify on a device and try again.',
            code: 404,
          };
        }

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}`, message: errorText || 'Unknown error' };
        }

        // Handle 401 Unauthorized - token expired, try to refresh
        if (response.status === 401 && refreshCallback) {
          try {
            const newAccessToken = await refreshCallback();
            if (newAccessToken) {
              // Retry the request with the new token
              const retryOptions = {
                method,
                headers: {
                  Authorization: `Bearer ${newAccessToken}`,
                  'Content-Type': 'application/json',
                },
              };
              if (body) {
                retryOptions.body = JSON.stringify(body);
              }
              const retryResponse = await fetch(
                `https://api.spotify.com/v1${endpoint}`,
                retryOptions,
              );
              if (retryResponse.ok) {
                const contentType = retryResponse.headers.get('content-type');
                const contentLength = retryResponse.headers.get('content-length');
                if (
                  retryResponse.status === 204 ||
                  contentLength === '0' ||
                  !contentType?.includes('application/json')
                ) {
                  return { success: true };
                }
                const text = await retryResponse.text();
                if (!text || text.trim() === '') {
                  return { success: true };
                }
                return JSON.parse(text);
              }
            }
          } catch (refreshError) {
            console.error('Error refreshing token and retrying:', refreshError);
          }
        }

        // Handle 403 "Restriction violated" errors gracefully (no active device, no Premium, etc.)
        if (response.status === 403) {
          const errorMessage =
            errorData.error?.message || errorData.message || 'Restriction violated';
          // Only log if it's not a common restriction (like no active device)
          if (!errorMessage.includes('Restriction violated')) {
            console.warn('Spotify API restriction:', errorMessage);
          }
          return { success: false, error: errorMessage, code: 403 };
        }

        // Gracefully handle "no active device" errors to avoid noisy logs
        if (
          response.status === 404 &&
          (errorData.error?.reason === 'NO_ACTIVE_DEVICE' ||
            /no active device/i.test(errorData.error?.message || '') ||
            /no active device/i.test(errorData.message || '') ||
            (typeof errorData.error === 'string' && /no active device/i.test(errorData.error)))
        ) {
          return {
            success: false,
            error: 'No active Spotify device found. Open Spotify on a device and try again.',
            code: 404,
          };
        }

        // For 401 without refresh callback or other errors, log and throw
        if (response.status === 401) {
          console.error('Spotify API error: Token expired and refresh failed or not available');
        } else {
          console.error('Spotify API error:', response.status, errorData);
        }
        throw new Error(errorData.error?.message || errorData.message || `HTTP ${response.status}`);
      }

      // Check if response has content (some endpoints return 204 No Content)
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');

      // If no content or empty response, return success object
      if (
        response.status === 204 ||
        contentLength === '0' ||
        !contentType?.includes('application/json')
      ) {
        return { success: true };
      }

      // Try to parse JSON, but handle empty responses
      const text = await response.text();
      if (!text || text.trim() === '') {
        return { success: true };
      }

      return JSON.parse(text);
    } catch (error) {
      // Build a normalized message string from every available source so we can
      // reliably detect known benign errors (like "no active device") before logging.
      const parts = [
        typeof error === 'string' ? error : '',
        error?.message,
        error?.stack,
        error?.error,
        error?.error?.message,
        error?.response?.error,
        error?.response?.error?.message,
      ].filter((value) => typeof value === 'string' && value.trim().length > 0);
      const normalizedMessage = parts.join(' | ').toLowerCase();

      const isTokenIssue = normalizedMessage.includes('token expired');
      const isRestriction =
        normalizedMessage.includes('403') || normalizedMessage.includes('restriction');
      const isNoDevice =
        normalizedMessage.includes('no active device') ||
        normalizedMessage.includes('player command failed');

      if (isNoDevice) {
        return {
          success: false,
          error: 'No active Spotify device found. Open Spotify on a device and try again.',
          code: 404,
        };
      }

      if (!isRestriction && !isTokenIssue) {
        console.error('Spotify API request error:', error);
      }
      return { success: false, error: error?.message || 'Unknown error' };
    }
  },

  async play(accessToken, deviceId = null, options = {}) {
    const target = deviceId || (await this.getActiveDevice(accessToken, options.refreshCallback));
    if (!target)
      return { success: false, error: 'Open Spotify on the device you want to use, then resume.' };
    return runVerifiedCommand({
      deviceId: target,
      followDeviceChanges: true,
      skipIfAlreadyApplied: true,
      isCancelled: options.isCancelled,
      send: (activeTarget) =>
        this.makeRequest(
          `/me/player/play?device_id=${encodeURIComponent(activeTarget)}`,
          'PUT',
          accessToken,
          {},
          options.refreshCallback,
        ),
      read: () => this.makeRequest('/me/player', 'GET', accessToken, null, options.refreshCallback),
      matches: (state) => state.is_playing === true && !!state.item,
    });
  },

  async playTrack(accessToken, trackUri, deviceId = null, options = {}) {
    if (!deviceId) return { success: false, error: 'Open Spotify on a playback device first.' };
    try {
      if (!options.preserveTarget) {
        const current = await this.makeRequest(
          '/me/player',
          'GET',
          accessToken,
          null,
          options.refreshCallback,
        );
        if (current?.success === false) return current;
        if (canControlDevice(current?.device)) deviceId = current.device.id;
      }
      const result = await startVerifiedTrack({
        uri: trackUri,
        deviceId,
        positionMs:
          Number.isFinite(options.positionMs) && options.positionMs > 0 ? options.positionMs : 0,
        isCancelled: options.isCancelled,
        preferContext: options.preferContext || contextPlaybackDevices.has(deviceId),
        previousDeviceId: options.previousDeviceId,
        send: (body) =>
          this.makeRequest(
            `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
            'PUT',
            accessToken,
            body,
            options.refreshCallback,
          ),
        read: () =>
          this.makeRequest('/me/player', 'GET', accessToken, null, options.refreshCallback),
        lookup: async (uri) => {
          if (playbackTrackCache.has(uri)) return playbackTrackCache.get(uri);
          const match = /^spotify:track:([A-Za-z0-9]+)$/.exec(uri);
          if (!match) return null;
          const track = await this.makeRequest(
            `/tracks/${match[1]}`,
            'GET',
            accessToken,
            null,
            options.refreshCallback,
          );
          if (track?.album?.uri && track.uri) {
            if (playbackTrackCache.size >= 50) playbackTrackCache.clear();
            playbackTrackCache.set(uri, track);
          }
          return track;
        },
      });
      if (result.strategy === 'album') {
        if (contextPlaybackDevices.size >= 20) contextPlaybackDevices.clear();
        contextPlaybackDevices.add(deviceId);
      }
      return { ...result, deviceId: result.deviceId || deviceId };
    } catch (error) {
      return { success: false, error: error.message || 'Spotify playback could not start.' };
    }
  },

  async pause(accessToken, refreshCallback = null, deviceId = null) {
    const target = deviceId || (await this.getActiveDevice(accessToken, refreshCallback));
    if (!target) return { success: false, error: 'No controllable Spotify device is available.' };
    return runVerifiedCommand({
      deviceId: target,
      followDeviceChanges: true,
      skipIfAlreadyApplied: true,
      send: (activeTarget) =>
        this.makeRequest(
          `/me/player/pause?device_id=${encodeURIComponent(activeTarget)}`,
          'PUT',
          accessToken,
          null,
          refreshCallback,
        ),
      read: () => this.makeRequest('/me/player', 'GET', accessToken, null, refreshCallback),
      matches: (state) => state.is_playing === false,
    });
  },

  async next(accessToken, refreshCallback = null, deviceId = null) {
    const result = await this.makeRequest(
      deviceId ? `/me/player/next?device_id=${encodeURIComponent(deviceId)}` : '/me/player/next',
      'POST',
      accessToken,
      null,
      refreshCallback,
    );
    return result || { success: true };
  },

  async previous(accessToken, refreshCallback = null, deviceId = null) {
    const result = await this.makeRequest(
      deviceId
        ? `/me/player/previous?device_id=${encodeURIComponent(deviceId)}`
        : '/me/player/previous',
      'POST',
      accessToken,
      null,
      refreshCallback,
    );
    return result || { success: true };
  },

  async setShuffle(accessToken, shuffle, deviceId = null) {
    try {
      const endpoint = deviceId
        ? `/me/player/shuffle?state=${shuffle}&device_id=${deviceId}`
        : `/me/player/shuffle?state=${shuffle}`;

      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 204 || response.ok;
    } catch (error) {
      console.error('Error setting shuffle:', error);
      return false;
    }
  },

  async setRepeat(accessToken, repeatMode, deviceId = null) {
    try {
      // repeatMode can be: 'off', 'context' (playlist/album), 'track' (single song)
      const validModes = ['off', 'context', 'track'];
      const mode = validModes.includes(repeatMode) ? repeatMode : 'off';

      const endpoint = deviceId
        ? `/me/player/repeat?state=${mode}&device_id=${deviceId}`
        : `/me/player/repeat?state=${mode}`;

      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 204 || response.ok;
    } catch (error) {
      console.error('Error setting repeat:', error);
      return false;
    }
  },

  async getCurrentPlayback(accessToken, refreshCallback = null, retryAttempt = 0) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // 204 means no active playback
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }

        // Handle 401 Unauthorized - token expired, try to refresh
        if (response.status === 401 && refreshCallback) {
          try {
            const newAccessToken = await refreshCallback();
            if (newAccessToken) {
              // Retry the request with the new token
              const retryResponse = await fetch('https://api.spotify.com/v1/me/player', {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${newAccessToken}`,
                },
              });

              if (retryResponse.status === 204) {
                return null;
              }

              if (retryResponse.ok) {
                const text = await retryResponse.text();
                if (!text || text.trim() === '') {
                  return null;
                }
                return JSON.parse(text);
              }
            }
          } catch (refreshError) {
            console.error('Error refreshing token and retrying playback:', refreshError);
          }
        }

        // Don't log 401 errors as they're handled above, or if refresh isn't available
        if (response.status !== 401) {
          console.error('Spotify playback error:', response.status, errorData);
        }
        return null;
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return null;
      }

      return JSON.parse(text);
    } catch (error) {
      if (isTransientNetworkError(error)) {
        if (retryAttempt < NETWORK_RETRY_ATTEMPTS) {
          const delay = NETWORK_RETRY_BASE_DELAY_MS * (retryAttempt + 1);
          await wait(delay);
          return this.getCurrentPlayback(accessToken, refreshCallback, retryAttempt + 1);
        }
        console.warn(
          'Spotify playback request failed due to a network issue. Will retry on next poll.',
        );
        return null;
      }

      console.error('Error getting current playback:', error);
      return null;
    }
  },

  async getDevices(accessToken, refreshCallback = null) {
    const result = await this.makeRequest(
      '/me/player/devices',
      'GET',
      accessToken,
      null,
      refreshCallback,
    );
    playbackDevices.clear();
    for (const device of result?.devices || [])
      if (device?.id) playbackDevices.set(device.id, device);
    return result;
  },

  async getActiveDevice(accessToken, refreshCallback = null) {
    try {
      const playback = await this.makeRequest(
        '/me/player',
        'GET',
        accessToken,
        null,
        refreshCallback,
      );
      if (playback?.device?.id) {
        playbackDevices.set(playback.device.id, playback.device);
        return canControlDevice(playback.device) ? playback.device.id : null;
      }
      const devicesResult = await this.getDevices(accessToken, refreshCallback);
      return await resolvePlaybackDevice(devicesResult?.devices, async (deviceId) => {
        const result = await this.transferPlayback(accessToken, deviceId, false);
        if (result?.success) await wait(300);
        return result;
      });
    } catch (error) {
      console.error('Error getting active device:', error);
      return null;
    }
  },

  async selectPlaybackDevice(accessToken, deviceId, refreshCallback = null) {
    const devices = await this.getDevices(accessToken, refreshCallback);
    const selected = devices?.devices?.find((device) => device?.id === deviceId);
    if (!canControlDevice(selected))
      return { success: false, error: 'This Spotify device is not available for control.' };
    return transferVerifiedPlayback({
      deviceId,
      read: () => this.makeRequest('/me/player', 'GET', accessToken, null, refreshCallback),
      transfer: (playing) => this.transferPlayback(accessToken, deviceId, playing, refreshCallback),
      restore: (uri, positionMs, previousDeviceId) =>
        this.playTrack(accessToken, uri, deviceId, {
          positionMs,
          refreshCallback,
          preserveTarget: true,
          preferContext: true,
          previousDeviceId,
        }),
    });
  },

  async transferPlayback(accessToken, deviceId, play = false, refreshCallback = null) {
    return this.makeRequest(
      '/me/player',
      'PUT',
      accessToken,
      {
        device_ids: [deviceId],
        play,
      },
      refreshCallback,
    );
  },

  async getUserPlaylists(accessToken, limit = 50) {
    const playlists = await readSpotifyPages(
      `https://api.spotify.com/v1/me/playlists?limit=${Math.min(50, limit)}`,
      accessToken,
    );
    return playlists.filter(Boolean).map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      image: playlist.images?.[0]?.url,
      tracksCount: playlist.items?.total ?? playlist.tracks?.total ?? null,
      uri: playlist.uri,
    }));
  },

  async playPlaylist(accessToken, playlistId, deviceId = null, shuffle = false, options = {}) {
    if (!deviceId) return { success: false, error: 'Open Spotify on a playback device first.' };
    const contextUri = `spotify:playlist:${playlistId}`;
    if (shuffle) await this.setShuffle(accessToken, true, deviceId);
    return runVerifiedCommand({
      deviceId,
      followDeviceChanges: true,
      isCancelled: options.isCancelled,
      send: (activeTarget) =>
        this.makeRequest(
          `/me/player/play?device_id=${encodeURIComponent(activeTarget)}`,
          'PUT',
          accessToken,
          {
            context_uri: contextUri,
            position_ms:
              Number.isFinite(options.positionMs) && options.positionMs > 0
                ? options.positionMs
                : 0,
          },
          options.refreshCallback,
        ),
      read: () => this.makeRequest('/me/player', 'GET', accessToken, null, options.refreshCallback),
      matches: (state) =>
        state.is_playing === true && !!state.item && state.context?.uri === contextUri,
    });
  },

  async setVolume(accessToken, volumePercent, deviceId = null) {
    const device = playbackDevices.get(deviceId);
    if (device && !canControlVolume(device)) return { success: true, skipped: true };
    try {
      const volume = Math.max(0, Math.min(100, volumePercent));
      const endpoint = deviceId
        ? `/me/player/volume?volume_percent=${volume}&device_id=${deviceId}`
        : `/me/player/volume?volume_percent=${volume}`;

      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 204 || response.ok;
    } catch (error) {
      console.error('Error setting volume:', error);
      return false;
    }
  },

  async searchTracks(accessToken, query, limit = 20) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        console.error('Error searching tracks:', response.status);
        return [];
      }

      const data = await response.json();
      return (
        data.tracks?.items?.map((track) => ({
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name || 'Unknown Artist',
          album: track.album?.name || 'Unknown Album',
          image: track.album?.images?.[0]?.url,
          duration: Math.floor(track.duration_ms / 1000),
          uri: track.uri,
        })) || []
      );
    } catch (error) {
      console.error('Error searching tracks:', error);
      return [];
    }
  },

  async searchPlaylists(accessToken, query, limit = 20) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodedQuery}&type=playlist&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        console.error('Error searching playlists:', response.status);
        return [];
      }

      const data = await response.json();
      return (
        data.playlists?.items?.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          image: playlist.images?.[0]?.url,
          tracksCount: playlist.tracks?.total || 0,
          owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown',
        })) || []
      );
    } catch (error) {
      console.error('Error searching playlists:', error);
      return [];
    }
  },

  async search(accessToken, query, types = ['track'], limit = 20) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const typesParam = Array.isArray(types) ? types.join(',') : types;
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodedQuery}&type=${typesParam}&limit=${Math.min(10, limit)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const error = new Error('Spotify search failed');
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      return {
        tracks:
          data.tracks?.items
            ?.filter((track) => track !== null && track !== undefined)
            ?.map((track) => ({
              id: track.id,
              name: track.name,
              artist: track.artists[0]?.name || 'Unknown Artist',
              album: track.album?.name || 'Unknown Album',
              image: track.album?.images?.[0]?.url,
              duration: Math.floor(track.duration_ms / 1000),
              uri: track.uri,
              type: 'track',
            })) || [],
        artists:
          data.artists?.items
            ?.filter((artist) => artist !== null && artist !== undefined)
            ?.map((artist) => ({
              id: artist.id,
              name: artist.name,
              image: artist.images?.[0]?.url,
              followers: artist.followers?.total || 0,
              genres: artist.genres || [],
              uri: artist.uri,
              type: 'artist',
            })) || [],
        albums:
          data.albums?.items
            ?.filter((album) => album !== null && album !== undefined)
            ?.map((album) => ({
              id: album.id,
              name: album.name,
              artist: album.artists[0]?.name || 'Unknown Artist',
              image: album.images?.[0]?.url,
              releaseDate: album.release_date,
              totalTracks: album.total_tracks,
              uri: album.uri,
              type: 'album',
            })) || [],
        playlists:
          data.playlists?.items
            ?.filter((playlist) => playlist !== null && playlist !== undefined)
            ?.map((playlist) => ({
              id: playlist.id,
              name: playlist.name,
              description: playlist.description,
              image: playlist.images?.[0]?.url,
              tracksCount: playlist.tracks?.total || 0,
              owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown',
              uri: playlist.uri,
              type: 'playlist',
            })) || [],
        shows:
          data.shows?.items
            ?.filter((show) => show !== null && show !== undefined)
            ?.map((show) => ({
              id: show.id,
              name: show.name,
              description: show.description,
              image: show.images?.[0]?.url,
              publisher: show.publisher,
              totalEpisodes: show.total_episodes,
              uri: show.uri,
              type: 'show',
            })) || [],
        episodes:
          data.episodes?.items
            ?.filter((episode) => episode !== null && episode !== undefined)
            ?.map((episode) => ({
              id: episode.id,
              name: episode.name,
              description: episode.description,
              image: episode.images?.[0]?.url,
              duration: Math.floor(episode.duration_ms / 1000),
              releaseDate: episode.release_date,
              uri: episode.uri,
              type: 'episode',
            })) || [],
        audiobooks:
          data.audiobooks?.items
            ?.filter((audiobook) => audiobook !== null && audiobook !== undefined)
            ?.map((audiobook) => ({
              id: audiobook.id,
              name: audiobook.name,
              artist: audiobook.authors?.[0]?.name || 'Unknown Author',
              description: audiobook.description,
              image: audiobook.images?.[0]?.url,
              publisher: audiobook.publisher,
              totalChapters: audiobook.total_chapters,
              uri: audiobook.uri,
              type: 'audiobook',
            })) || [],
      };
    } catch (error) {
      throw error;
    }
  },

  async getPlaylistById(accessToken, playlistId, refreshCallback = null) {
    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        // Handle 401 Unauthorized - token expired, try to refresh
        if (response.status === 401 && refreshCallback) {
          try {
            const newAccessToken = await refreshCallback();
            if (newAccessToken) {
              const retryResponse = await fetch(
                `https://api.spotify.com/v1/playlists/${playlistId}`,
                {
                  headers: {
                    Authorization: `Bearer ${newAccessToken}`,
                  },
                },
              );

              if (retryResponse.ok) {
                const playlist = await retryResponse.json();
                return {
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description,
                  image: playlist.images?.[0]?.url,
                  tracksCount: playlist.tracks?.total || 0,
                };
              }
            }
          } catch (refreshError) {
            console.error('Error refreshing token and retrying playlist fetch:', refreshError);
          }
        }
        console.error('Error fetching playlist:', response.status);
        return null;
      }

      const playlist = await response.json();
      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.images?.[0]?.url,
        tracksCount: playlist.tracks?.total || 0,
      };
    } catch (error) {
      console.error('Error getting playlist by ID:', error);
      return null;
    }
  },

  async getPlaylistTracks(accessToken, playlistId) {
    const items = await readSpotifyPages(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50`,
      accessToken,
    );
    return items
      .map((item) => ({ ...item, track: item?.item || item?.track }))
      .filter((item) => item?.track?.uri && !item.is_local && item.track.is_playable !== false)
      .map(({ track }) => ({
        id: track.id || track.uri,
        name: track.name,
        artist: track.artists?.[0]?.name || track.show?.name || 'Spotify',
        image: track.album?.images?.[0]?.url || track.images?.[0]?.url,
        duration: Math.floor((track.duration_ms || 0) / 1000),
        uri: track.uri,
        type: track.type || 'track',
      }));
  },
};
