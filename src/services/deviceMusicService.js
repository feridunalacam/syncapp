import ExpoAVPlayer from './audio/ExpoAVPlayer';

/**
 * Device Music Service
 * 
 * Built-in music player for device-local audio files.
 * Uses ExpoAVPlayer (shared Expo AV logic) for playback.
 */
class DeviceMusicPlayer {
  constructor() {
    this.player = new ExpoAVPlayer();
  }

  // Play a track from device
  async playTrack(accessToken, trackUri, deviceId = null, options = {}) {
    try {
      // Prepare track metadata for player
      const trackOptions = {
        positionMs: options.positionMs || 0,
        shouldPlay: true,
        name: options.name || 'Device Track',
        artist: options.artist || 'Unknown Artist',
        album: options.album || 'Unknown Album',
        image: options.image || null,
      };

      const result = await this.player.loadAndPlay(trackUri, trackOptions);
      return result;
    } catch (error) {
      console.error('Error playing device track:', error);
      return { success: false, error: error.message };
    }
  }

  // Device playlists are not supported (we'd need to maintain a queue of
  // tracks). Callers should fall back to per-round / per-track sources
  // instead of treating this as a transient failure.
  async playPlaylist(/* accessToken, playlistId, deviceId, shuffle */) {
    return {
      success: false,
      notSupported: true,
      error: 'Device playlist playback is not supported. Pick individual tracks per round.',
    };
  }

  // Pause playback
  async pause(accessToken, refreshCallback = null) {
    return await this.player.pause();
  }

  // Resume playback
  async play(accessToken, deviceId = null) {
    return await this.player.play();
  }

  // Get current playback status
  async getCurrentPlayback(accessToken, refreshCallback = null) {
    return await this.player.getStatus();
  }

  // Set track metadata (called when track info is available)
  setTrackMetadata(trackInfo) {
    this.player.setTrackMetadata(trackInfo);
  }

  // Set status update callback
  setOnStatusUpdate(callback) {
    this.player.setOnStatusUpdate(callback);
  }

  // Set volume (0-100)
  async setVolume(volumePercent) {
    return await this.player.setVolume(volumePercent);
  }

  // Cleanup
  async cleanup() {
    await this.player.cleanup();
  }
}

// Singleton instance
const deviceMusicPlayer = new DeviceMusicPlayer();

const deviceMusicService = {
  // Device doesn't need token refresh
  getAccessToken: () => Promise.resolve({ accessToken: 'device', expiresIn: 3600 }),

  // Playback Controls
  play: (accessToken, deviceId, uris, positionMs) => {
    if (uris && uris.length > 0) {
      return deviceMusicPlayer.playTrack(accessToken, uris[0], deviceId, { positionMs });
    }
    return deviceMusicPlayer.play(accessToken, deviceId);
  },
  
  playTrack: (accessToken, trackUri, deviceId, options) => 
    deviceMusicPlayer.playTrack(accessToken, trackUri, deviceId, options),
  
  pause: (accessToken, refreshCallback) => 
    deviceMusicPlayer.pause(accessToken, refreshCallback),
  
  playPlaylist: (accessToken, playlistId, deviceId, shuffle) => 
    deviceMusicPlayer.playPlaylist(accessToken, playlistId, deviceId, shuffle),

  // Player State
  getCurrentPlayback: (accessToken, refreshCallback) => 
    deviceMusicPlayer.getCurrentPlayback(accessToken, refreshCallback),
  
  getDevices: () => Promise.resolve({ devices: [{ id: 'device', name: 'This Device', is_active: true, is_restricted: false }] }),
  
  getActiveDevice: () => Promise.resolve('device'),
  
  transferPlayback: () => Promise.resolve({ success: true }),

  // Set track metadata helper
  setTrackMetadata: (trackInfo) => deviceMusicPlayer.setTrackMetadata(trackInfo),

  // Volume control (0-100)
  setVolume: (accessToken, volumePercent) => deviceMusicPlayer.setVolume(volumePercent),

  // Cleanup
  cleanup: () => deviceMusicPlayer.cleanup(),
};

export default deviceMusicService;

