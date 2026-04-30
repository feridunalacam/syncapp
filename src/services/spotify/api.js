import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from './config';

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
      
      if (!SPOTIFY_CLIENT_ID || typeof SPOTIFY_CLIENT_ID !== 'string' || SPOTIFY_CLIENT_ID.trim() === '') {
        console.error('Token refresh failed: Invalid or missing client ID');
        return null;
      }
      
      // Construct the request body
      // For PKCE flow (mobile apps), Spotify requires redirect_uri in refresh token requests
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken.trim());
      params.append('client_id', SPOTIFY_CLIENT_ID.trim());
      params.append('redirect_uri', SPOTIFY_REDIRECT_URI);
      
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
        console.error('Token refresh failed: No access token in response', data);
        return null;
      }
      return {
        accessToken: data.access_token,
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
          'Authorization': `Bearer ${accessToken}`,
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
                  'Authorization': `Bearer ${newAccessToken}`,
                  'Content-Type': 'application/json',
                },
              };
              if (body) {
                retryOptions.body = JSON.stringify(body);
              }
              const retryResponse = await fetch(`https://api.spotify.com/v1${endpoint}`, retryOptions);
              if (retryResponse.ok) {
                const contentType = retryResponse.headers.get('content-type');
                const contentLength = retryResponse.headers.get('content-length');
                if (retryResponse.status === 204 || contentLength === '0' || !contentType?.includes('application/json')) {
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
          const errorMessage = errorData.error?.message || errorData.message || 'Restriction violated';
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
      if (response.status === 204 || contentLength === '0' || !contentType?.includes('application/json')) {
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

  async play(accessToken, deviceId = null) {
    try {
      const endpoint = deviceId ? `/me/player/play?device_id=${deviceId}` : '/me/player/play';
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (response.status === 204) {
        return { success: true };
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }
        
        if (response.status === 403) {
          return { success: false, error: 'No active device or Premium required', code: 403 };
        }
        
        if (response.status === 404) {
          return { success: false, error: 'No active device found. Please open Spotify app first.', code: 404 };
        }
        
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}`, code: response.status };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error playing:', error);
      return { success: false, error: error.message };
    }
  },

  async playTrack(accessToken, trackUri, deviceId = null, options = {}) {
    try {
      if (!deviceId) {
        return { success: false, error: 'Device ID is required to play track' };
      }

      const endpoint = `/me/player/play?device_id=${deviceId}`;
      const positionMs = typeof options.positionMs === 'number' && options.positionMs > 0 ? options.positionMs : 0;
      
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: [trackUri],
          position_ms: positionMs,
        }),
      });
      
      if (response.status === 204) {
        return { success: true };
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }
        
        if (response.status === 404) {
          return { success: false, error: 'No active device found. Please open Spotify app first.', code: 404 };
        }
        
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}`, code: response.status };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error playing track:', error);
      return { success: false, error: error.message };
    }
  },

  async pause(accessToken, refreshCallback = null, deviceId = null) {
    const endpoint = deviceId 
      ? `/me/player/pause?device_id=${deviceId}` 
      : '/me/player/pause';
    const result = await this.makeRequest(endpoint, 'PUT', accessToken, null, refreshCallback);
    if (result && result.success === false && result.code === 403) {
      return { success: false, error: 'No active device or Premium required' };
    }
    return result || { success: true };
  },

  async next(accessToken, refreshCallback = null) {
    const result = await this.makeRequest('/me/player/next', 'POST', accessToken, null, refreshCallback);
    if (result && result.success === false && result.code === 403) {
      return { success: false, error: 'No active device or Premium required' };
    }
    return result || { success: true };
  },

  async previous(accessToken, refreshCallback = null) {
    const result = await this.makeRequest('/me/player/previous', 'POST', accessToken, null, refreshCallback);
    if (result && result.success === false && result.code === 403) {
      return { success: false, error: 'No active device or Premium required' };
    }
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
          'Authorization': `Bearer ${accessToken}`,
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
          'Authorization': `Bearer ${accessToken}`,
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
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
              const retryResponse = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${newAccessToken}`,
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
        console.warn('Spotify playback request failed due to a network issue. Will retry on next poll.');
        return null;
      }

      console.error('Error getting current playback:', error);
      return null;
    }
  },

  async getDevices(accessToken, refreshCallback = null) {
    return this.makeRequest('/me/player/devices', 'GET', accessToken, null, refreshCallback);
  },

  async getActiveDevice(accessToken, refreshCallback = null) {
    try {
      const devicesResult = await this.getDevices(accessToken, refreshCallback);
      if (devicesResult && devicesResult.devices && Array.isArray(devicesResult.devices) && devicesResult.devices.length > 0) {
        // Find the first active device
        const activeDevice = devicesResult.devices.find(device => device.is_active);
        if (activeDevice) {
          return activeDevice.id;
        }
        
        // If no active device, find the first available (unrestricted) device
        const firstAvailableDevice = devicesResult.devices.find(device => !device.is_restricted);
        if (firstAvailableDevice) {
          // Attempt to transfer playback to this device to make it active
          console.log(`No active device found. Attempting to activate device: ${firstAvailableDevice.name}`);
          const transferResult = await this.transferPlayback(accessToken, firstAvailableDevice.id, false); // Don't start playing yet
          if (transferResult.success) {
            // Wait a moment for the transfer to complete
            await new Promise(resolve => setTimeout(resolve, 300));
            return firstAvailableDevice.id;
          }
        }

        // As a last resort, return the first device in the list
        return devicesResult.devices[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error getting active device:', error);
      return null;
    }
  },

  async transferPlayback(accessToken, deviceId, play = false) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: play, // Start playing immediately after transfer
        }),
      });

      if (response.status === 204) {
        return { success: true };
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}`, code: response.status };
      }

      return { success: true };
    } catch (error) {
      console.error('Error transferring playback:', error);
      return { success: false, error: error.message };
    }
  },

  async getUserPlaylists(accessToken, limit = 50, refreshCallback = null) {
    try {
      const playlists = [];
      let url = `https://api.spotify.com/v1/me/playlists?limit=${limit}`;
      let currentAccessToken = accessToken;
      
      while (url) {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${currentAccessToken}`,
          },
        });
        
        if (!response.ok) {
          // Handle 401 Unauthorized - token expired, try to refresh
          if (response.status === 401 && refreshCallback) {
            try {
              const newAccessToken = await refreshCallback();
              if (newAccessToken) {
                // Update token and retry the request
                currentAccessToken = newAccessToken;
                const retryResponse = await fetch(url, {
                  headers: {
                    'Authorization': `Bearer ${newAccessToken}`,
                  },
                });
                
                if (retryResponse.ok) {
                  const data = await retryResponse.json();
                  playlists.push(...data.items);
                  url = data.next;
                  continue; // Successfully retried, continue with pagination
                } else if (retryResponse.status === 401) {
                  // Refresh didn't work, token is still invalid
                  console.error('Error fetching playlists: Token refresh failed - new token is still invalid');
                  break;
                } else {
                  // Retry failed with a different error
                  console.error('Error fetching playlists after token refresh:', retryResponse.status);
                  break;
                }
              } else {
                // Refresh callback returned null
                console.error('Error fetching playlists: Token refresh failed - no new token received');
                break;
              }
            } catch (refreshError) {
              console.error('Error refreshing token and retrying playlists:', refreshError);
              break;
            }
          } else {
            // If refresh failed or not available, log and break
            if (response.status === 401) {
              if (refreshCallback) {
                console.error('Error fetching playlists: Token expired but refresh callback failed');
              } else {
                console.error('Error fetching playlists: Token expired and no refresh callback available');
              }
            } else {
              console.error('Error fetching playlists:', response.status);
            }
            break;
          }
        }
        
        const data = await response.json();
        playlists.push(...data.items);
        url = data.next; // Spotify provides next URL for pagination
      }
      
      return playlists.map(playlist => {
        // Spotify API returns tracks as an object with href, total, etc.
        // Sometimes tracks.total might be null or undefined, so we need to handle that
        const tracksCount = playlist.tracks?.total !== null && playlist.tracks?.total !== undefined 
          ? playlist.tracks.total 
          : 0;
        
        return {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          image: playlist.images?.[0]?.url,
          tracksCount: tracksCount,
        };
      });
    } catch (error) {
      console.error('Error getting user playlists:', error);
      return [];
    }
  },

  async playPlaylist(accessToken, playlistId, deviceId = null, shuffle = false, options = {}) {
    try {
      if (!deviceId) {
        return { success: false, error: 'Device ID is required to play playlist' };
      }

      const contextUri = `spotify:playlist:${playlistId}`;
      const endpoint = `/me/player/play?device_id=${deviceId}`;
      const positionMs = typeof options.positionMs === 'number' && options.positionMs > 0 ? options.positionMs : 0;
      const requestBody = {
        context_uri: contextUri,
        position_ms: positionMs,
      };

      if (shuffle) {
        // Set shuffle first before playing
        await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=${deviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      }
      
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (response.status === 204) {
        return { success: true };
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }
        
        if (response.status === 404) {
          return { success: false, error: 'No active device found. Please open Spotify app first.', code: 404 };
        }
        
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}`, code: response.status };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error playing playlist:', error);
      return { success: false, error: error.message };
    }
  },

  async setVolume(accessToken, volumePercent, deviceId = null) {
    try {
      const volume = Math.max(0, Math.min(100, volumePercent));
      const endpoint = deviceId
        ? `/me/player/volume?volume_percent=${volume}&device_id=${deviceId}`
        : `/me/player/volume?volume_percent=${volume}`;
      
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        console.error('Error searching tracks:', response.status);
        return [];
      }
      
      const data = await response.json();
      return data.tracks?.items?.map(track => ({
        id: track.id,
        name: track.name,
        artist: track.artists[0]?.name || 'Unknown Artist',
        album: track.album?.name || 'Unknown Album',
        image: track.album?.images?.[0]?.url,
        duration: Math.floor(track.duration_ms / 1000),
        uri: track.uri,
      })) || [];
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
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        console.error('Error searching playlists:', response.status);
        return [];
      }
      
      const data = await response.json();
      return data.playlists?.items?.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.images?.[0]?.url,
        tracksCount: playlist.tracks?.total || 0,
        owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown',
      })) || [];
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
        `https://api.spotify.com/v1/search?q=${encodedQuery}&type=${typesParam}&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        console.error('Error searching:', response.status);
        return { tracks: [], artists: [], albums: [], playlists: [], shows: [], episodes: [], audiobooks: [] };
      }
      
      const data = await response.json();
      
      return {
        tracks: data.tracks?.items?.filter(track => track !== null && track !== undefined)?.map(track => ({
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name || 'Unknown Artist',
          album: track.album?.name || 'Unknown Album',
          image: track.album?.images?.[0]?.url,
          duration: Math.floor(track.duration_ms / 1000),
          uri: track.uri,
          type: 'track',
        })) || [],
        artists: data.artists?.items?.filter(artist => artist !== null && artist !== undefined)?.map(artist => ({
          id: artist.id,
          name: artist.name,
          image: artist.images?.[0]?.url,
          followers: artist.followers?.total || 0,
          genres: artist.genres || [],
          uri: artist.uri,
          type: 'artist',
        })) || [],
        albums: data.albums?.items?.filter(album => album !== null && album !== undefined)?.map(album => ({
          id: album.id,
          name: album.name,
          artist: album.artists[0]?.name || 'Unknown Artist',
          image: album.images?.[0]?.url,
          releaseDate: album.release_date,
          totalTracks: album.total_tracks,
          uri: album.uri,
          type: 'album',
        })) || [],
        playlists: data.playlists?.items?.filter(playlist => playlist !== null && playlist !== undefined)?.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          image: playlist.images?.[0]?.url,
          tracksCount: playlist.tracks?.total || 0,
          owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown',
          uri: playlist.uri,
          type: 'playlist',
        })) || [],
        shows: data.shows?.items?.filter(show => show !== null && show !== undefined)?.map(show => ({
          id: show.id,
          name: show.name,
          description: show.description,
          image: show.images?.[0]?.url,
          publisher: show.publisher,
          totalEpisodes: show.total_episodes,
          uri: show.uri,
          type: 'show',
        })) || [],
        episodes: data.episodes?.items?.filter(episode => episode !== null && episode !== undefined)?.map(episode => ({
          id: episode.id,
          name: episode.name,
          description: episode.description,
          image: episode.images?.[0]?.url,
          duration: Math.floor(episode.duration_ms / 1000),
          releaseDate: episode.release_date,
          uri: episode.uri,
          type: 'episode',
        })) || [],
        audiobooks: data.audiobooks?.items?.filter(audiobook => audiobook !== null && audiobook !== undefined)?.map(audiobook => ({
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
      console.error('Error searching:', error);
      return { tracks: [], artists: [], albums: [], playlists: [], shows: [], episodes: [], audiobooks: [] };
    }
  },

  async getPlaylistById(accessToken, playlistId, refreshCallback = null) {
    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        // Handle 401 Unauthorized - token expired, try to refresh
        if (response.status === 401 && refreshCallback) {
          try {
            const newAccessToken = await refreshCallback();
            if (newAccessToken) {
              const retryResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
                headers: {
                  'Authorization': `Bearer ${newAccessToken}`,
                },
              });
              
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
    try {
      const tracks = [];
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
      
      while (url) {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (!response.ok) {
          console.error('Error fetching playlist tracks:', response.status);
          break;
        }
        
        const data = await response.json();
        const playlistTracks = data.items
          .filter(item => item.track)
          .map(item => ({
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists[0]?.name || 'Unknown Artist',
            album: item.track.album?.name || 'Unknown Album',
            image: item.track.album?.images?.[0]?.url,
            duration: Math.floor(item.track.duration_ms / 1000),
            uri: item.track.uri,
          }));
        
        tracks.push(...playlistTracks);
        url = data.next;
      }
      
      return tracks;
    } catch (error) {
      console.error('Error getting playlist tracks:', error);
      return [];
    }
  },
};

