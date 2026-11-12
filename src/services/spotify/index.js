import { spotifyAPI } from './api';
import { createCommandQueue } from './queue.js';
import { SPOTIFY_AVAILABLE } from './config';
import { SPOTIFY_UNAVAILABLE_MESSAGE } from './availability';

const spotifyService = {
  // Authentication
  getAccessToken: (refreshToken) => spotifyAPI.getAccessToken(refreshToken),

  // Playback Controls
  play: (accessToken, deviceId, uris, positionMs) => {
    if (Array.isArray(uris) && uris.length > 0) {
      return spotifyAPI.playTrack(accessToken, uris[0], deviceId, { positionMs });
    }
    return spotifyAPI.play(accessToken, deviceId, uris && !Array.isArray(uris) ? uris : {});
  },
  playTrack: (accessToken, trackUri, deviceId, options) =>
    spotifyAPI.playTrack(accessToken, trackUri, deviceId, options),
  pause: (accessToken, refreshCallback, deviceId = null) =>
    spotifyAPI.pause(accessToken, refreshCallback, deviceId),
  next: (accessToken, refreshCallback, deviceId) =>
    spotifyAPI.next(accessToken, refreshCallback, deviceId),
  previous: (accessToken, refreshCallback, deviceId) =>
    spotifyAPI.previous(accessToken, refreshCallback, deviceId),
  setShuffle: (accessToken, shuffle, deviceId) =>
    spotifyAPI.setShuffle(accessToken, shuffle, deviceId),
  setRepeat: (accessToken, repeatMode, deviceId) =>
    spotifyAPI.setRepeat(accessToken, repeatMode, deviceId),
  setVolume: (accessToken, volumePercent, deviceId) =>
    spotifyAPI.setVolume(accessToken, volumePercent, deviceId),
  playPlaylist: (accessToken, playlistId, deviceId, shuffle, options) =>
    spotifyAPI.playPlaylist(accessToken, playlistId, deviceId, shuffle, options),

  // Player State
  getCurrentPlayback: (accessToken, refreshCallback) =>
    spotifyAPI.getCurrentPlayback(accessToken, refreshCallback),
  getDevices: (accessToken, refreshCallback) => spotifyAPI.getDevices(accessToken, refreshCallback),
  getActiveDevice: (accessToken, refreshCallback) =>
    spotifyAPI.getActiveDevice(accessToken, refreshCallback),
  transferPlayback: (accessToken, deviceId, play) =>
    spotifyAPI.transferPlayback(accessToken, deviceId, play),

  selectPlaybackDevice: (token, deviceId, refresh) =>
    spotifyAPI.selectPlaybackDevice(token, deviceId, refresh),

  // Content
  search: (accessToken, query, types, limit, refreshCallback) =>
    spotifyAPI.search(accessToken, query, types, limit, refreshCallback),
  searchTracks: (accessToken, query, limit) => spotifyAPI.searchTracks(accessToken, query, limit),
  getUserPlaylists: (accessToken, limit, refreshCallback) =>
    spotifyAPI.getUserPlaylists(accessToken, limit, refreshCallback),
  getPlaylistTracks: (accessToken, playlistId) =>
    spotifyAPI.getPlaylistTracks(accessToken, playlistId),
};

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
  spotifyService[method] = (...args) => enqueue(() => operation(...args));
}
export default spotifyService;
