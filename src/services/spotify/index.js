import { spotifyAPI } from './api';
import { createCommandQueue } from './queue.js';
import { SPOTIFY_AVAILABLE } from './config';
import { SPOTIFY_UNAVAILABLE_MESSAGE } from './availability';

const createService = (api) => ({
  // Called before an outer workout queue schedules pause/source handover.
  cancelPending: () => enqueue.cancelPending(),
  // Authentication
  getAccessToken: (refreshToken) => api.getAccessToken(refreshToken),

  // Playback Controls
  play: (accessToken, deviceId, uris, positionMs) => {
    if (Array.isArray(uris) && uris.length > 0) {
      return api.playTrack(accessToken, uris[0], deviceId, { positionMs });
    }
    return api.play(accessToken, deviceId, uris && !Array.isArray(uris) ? uris : {});
  },
  playTrack: (accessToken, trackUri, deviceId, options) =>
    api.playTrack(accessToken, trackUri, deviceId, options),
  pause: (accessToken, refreshCallback, deviceId = null) =>
    api.pause(accessToken, refreshCallback, deviceId),
  next: (accessToken, refreshCallback, deviceId) =>
    api.next(accessToken, refreshCallback, deviceId),
  previous: (accessToken, refreshCallback, deviceId) =>
    api.previous(accessToken, refreshCallback, deviceId),
  setShuffle: (accessToken, shuffle, deviceId) => api.setShuffle(accessToken, shuffle, deviceId),
  setRepeat: (accessToken, repeatMode, deviceId) =>
    api.setRepeat(accessToken, repeatMode, deviceId),
  setVolume: (accessToken, volumePercent, deviceId) =>
    api.setVolume(accessToken, volumePercent, deviceId),
  playPlaylist: (accessToken, playlistId, deviceId, shuffle, options) =>
    api.playPlaylist(accessToken, playlistId, deviceId, shuffle, options),

  // Player State
  getCurrentPlayback: (accessToken, refreshCallback, readOptions) =>
    api.getCurrentPlayback(accessToken, refreshCallback, 0, readOptions),
  getDevices: (accessToken, refreshCallback) => api.getDevices(accessToken, refreshCallback),
  getActiveDevice: (accessToken, refreshCallback, readOptions) =>
    api.getActiveDevice(accessToken, refreshCallback, readOptions),
  transferPlayback: (accessToken, deviceId, play) =>
    api.transferPlayback(accessToken, deviceId, play),

  selectPlaybackDevice: (token, deviceId, refresh) =>
    api.selectPlaybackDevice(token, deviceId, refresh),

  // Content
  search: (accessToken, query, types, limit, refreshCallback) =>
    api.search(accessToken, query, types, limit, refreshCallback),
  searchTracks: (accessToken, query, limit) => api.searchTracks(accessToken, query, limit),
  getUserPlaylists: (accessToken, limit, refreshCallback) =>
    api.getUserPlaylists(accessToken, limit, refreshCallback),
  getPlaylistTracks: (accessToken, playlistId) => api.getPlaylistTracks(accessToken, playlistId),
});
const spotifyService = createService(spotifyAPI);

// The workout, picker and profile share one mutation stream. Reads stay independent.
const enqueue = createCommandQueue();
// Guard every entry point, including reads and token refreshes. Saved local
// credentials and routine assignments are retained without contacting Spotify.
if (!SPOTIFY_AVAILABLE) {
  for (const method of Object.keys(spotifyService)) {
    spotifyService[method] = async () => ({
      success: false,
      code: 'SPOTIFY_UNAVAILABLE',
      error: SPOTIFY_UNAVAILABLE_MESSAGE,
    });
  }
}
for (const method of [
  'play',
  'playTrack',
  'playPlaylist',
  'pause',
  'next',
  'previous',
  'setShuffle',
  'setRepeat',
  'setVolume',
  'transferPlayback',
  'selectPlaybackDevice',
]) {
  const operation = spotifyService[method];
  spotifyService[method] = (...args) =>
    enqueue(
      (signal) => {
        if (!SPOTIFY_AVAILABLE) return operation(...args);
        // Each command has its own transport scope. Concurrent metadata reads do
        // not inherit (or overwrite) the command's cancellation signal.
        const api = Object.assign(Object.create(spotifyAPI), { requestSignal: signal });
        return createService(api)[method](...args);
      },
      { interrupt: method === 'pause' },
    );
}
export default spotifyService;
