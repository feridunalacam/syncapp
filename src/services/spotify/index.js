import { spotifyAPI } from './api';

const spotifyService = {
  // Authentication
  getAccessToken: (refreshToken) => spotifyAPI.getAccessToken(refreshToken),

  // Playback Controls
  play: (accessToken, deviceId, uris, positionMs) => {
    if (uris && uris.length > 0) {
      return spotifyAPI.playTrack(accessToken, uris[0], deviceId, { positionMs });
    }
    return spotifyAPI.play(accessToken, deviceId);
  },
  playTrack: (accessToken, trackUri, deviceId, options) => spotifyAPI.playTrack(accessToken, trackUri, deviceId, options),
  pause: (accessToken, refreshCallback, deviceId = null) => spotifyAPI.pause(accessToken, refreshCallback, deviceId),
  next: (accessToken, refreshCallback) => spotifyAPI.next(accessToken, refreshCallback),
  previous: (accessToken, refreshCallback) => spotifyAPI.previous(accessToken, refreshCallback),
  setShuffle: (accessToken, shuffle, deviceId) => spotifyAPI.setShuffle(accessToken, shuffle, deviceId),
  setRepeat: (accessToken, repeatMode, deviceId) => spotifyAPI.setRepeat(accessToken, repeatMode, deviceId),
  setVolume: (accessToken, volumePercent, deviceId) => spotifyAPI.setVolume(accessToken, volumePercent, deviceId),
  playPlaylist: (accessToken, playlistId, deviceId, shuffle) => spotifyAPI.playPlaylist(accessToken, playlistId, deviceId, shuffle),

  // Player State
  getCurrentPlayback: (accessToken, refreshCallback) => spotifyAPI.getCurrentPlayback(accessToken, refreshCallback),
  getDevices: (accessToken, refreshCallback) => spotifyAPI.getDevices(accessToken, refreshCallback),
  getActiveDevice: (accessToken, refreshCallback) => spotifyAPI.getActiveDevice(accessToken, refreshCallback),
  transferPlayback: (accessToken, deviceId, play) => spotifyAPI.transferPlayback(accessToken, deviceId, play),

  // Content
  search: (accessToken, query, types, limit, refreshCallback) => spotifyAPI.search(accessToken, query, types, limit, refreshCallback),
  searchTracks: (accessToken, query, limit) => spotifyAPI.searchTracks(accessToken, query, limit),
  getUserPlaylists: (accessToken, limit, refreshCallback) => spotifyAPI.getUserPlaylists(accessToken, limit, refreshCallback),
  getPlaylistTracks: (accessToken, playlistId) => spotifyAPI.getPlaylistTracks(accessToken, playlistId),

};

export default spotifyService;
