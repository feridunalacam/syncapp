import { Audio } from 'expo-av';

/**
 * ExpoAVPlayer - Reusable Expo AV Audio Player
 * 
 * Platform-agnostic audio player using Expo AV.
 * Can be used by any service that needs to play audio files:
 * - Device local files
 * - Downloaded browser audio
 * - Streamed content
 * - etc.
 */
class ExpoAVPlayer {
  constructor() {
    this.sound = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.onStatusUpdate = null;
    this.isInitialized = false;
  }

  /**
   * Initialize audio mode
   * Should be called before first playback
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Error initializing ExpoAVPlayer:', error);
      throw error;
    }
  }

  /**
   * Load and play a track
   * @param {string} uri - Audio file URI (file://, http://, etc.)
   * @param {Object} options - Playback options
   * @param {number} options.positionMs - Start position in milliseconds
   * @param {boolean} options.shouldPlay - Auto-play after loading (default: true)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async loadAndPlay(uri, options = {}) {
    try {
      await this.initialize();

      // Stop current playback if any
      if (this.sound) {
        await this.unload();
      }

      // Load and play new track
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { 
          shouldPlay: options.shouldPlay !== false,
          positionMillis: options.positionMs || 0,
        }
      );

      this.sound = sound;
      this.currentTrack = {
        uri,
        name: options.name || 'Audio Track',
        artist: options.artist || 'Unknown Artist',
        album: options.album || 'Unknown Album',
        image: options.image || null,
      };
      this.isPlaying = options.shouldPlay !== false;

      // Set up status update listener
      sound.setOnPlaybackStatusUpdate((status) => {
        this._handleStatusUpdate(status);
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Error loading audio:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set track metadata (useful when info is available after loading)
   * @param {Object} metadata - Track metadata
   */
  setTrackMetadata(metadata) {
    this.currentTrack = {
      ...this.currentTrack,
      ...metadata,
    };
  }

  /**
   * Pause playback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async pause() {
    try {
      if (!this.sound) {
        return { success: false, error: 'No track loaded' };
      }

      await this.sound.pauseAsync();
      this.isPlaying = false;
      return { success: true };
    } catch (error) {
      console.error('❌ Error pausing:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume playback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async play() {
    try {
      if (!this.sound) {
        return { success: false, error: 'No track loaded' };
      }

      await this.sound.playAsync();
      this.isPlaying = true;
      return { success: true };
    } catch (error) {
      console.error('❌ Error playing:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop and unload current sound
   * @returns {Promise<void>}
   */
  async unload() {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
        this.isPlaying = false;
      }
    } catch (error) {
      console.error('❌ Error unloading:', error);
    }
  }

  /**
   * Get current playback status
   * @returns {Promise<Object|null>} Normalized playback status or null
   */
  async getStatus() {
    try {
      if (!this.sound) {
        return null;
      }

      const status = await this.sound.getStatusAsync();
      
      if (status.isLoaded) {
        return {
          item: {
            name: this.currentTrack?.name || 'Audio Track',
            artist: this.currentTrack?.artist || 'Unknown Artist',
            album: this.currentTrack?.album || 'Unknown Album',
            duration_ms: status.durationMillis || 0,
            album: {
              name: this.currentTrack?.album || 'Unknown Album',
              images: this.currentTrack?.image ? [{ url: this.currentTrack.image }] : [],
            },
          },
          progress_ms: status.positionMillis || 0,
          is_playing: status.isPlaying,
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting status:', error);
      return null;
    }
  }

  /**
   * Seek to position
   * @param {number} positionMs - Position in milliseconds
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async seekTo(positionMs) {
    try {
      if (!this.sound) {
        return { success: false, error: 'No track loaded' };
      }

      await this.sound.setPositionAsync(positionMs);
      return { success: true };
    } catch (error) {
      console.error('❌ Error seeking:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set volume (accepts percentage 0-100)
   * @param {number} volumePercent - Volume level (0 to 100)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setVolume(volumePercent) {
    try {
      if (!this.sound) {
        return { success: false, error: 'No track loaded' };
      }

      const normalizedVolume = Math.max(0, Math.min(100, volumePercent)) / 100;
      await this.sound.setVolumeAsync(normalizedVolume);
      return { success: true };
    } catch (error) {
      console.error('❌ Error setting volume:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set status update callback
   * @param {Function} callback - Callback function(status)
   */
  setOnStatusUpdate(callback) {
    this.onStatusUpdate = callback;
  }

  /**
   * Internal status update handler
   * @private
   */
  _handleStatusUpdate(status) {
    if (status.isLoaded) {
      this.isPlaying = status.isPlaying;
      
      if (this.onStatusUpdate) {
        this.onStatusUpdate({
          item: {
            name: this.currentTrack?.name || 'Audio Track',
            artist: this.currentTrack?.artist || 'Unknown Artist',
            album: this.currentTrack?.album || 'Unknown Album',
            duration_ms: status.durationMillis || 0,
          },
          progress_ms: status.positionMillis || 0,
          is_playing: status.isPlaying,
        });
      }
    }
  }

  /**
   * Cleanup and release resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.unload();
    this.currentTrack = null;
    this.onStatusUpdate = null;
    this.isInitialized = false;
  }

  /**
   * Check if a track is currently loaded
   * @returns {boolean}
   */
  isLoaded() {
    return this.sound !== null;
  }

  /**
   * Check if currently playing
   * @returns {boolean}
   */
  isCurrentlyPlaying() {
    return this.isPlaying;
  }

  /**
   * Get current track info
   * @returns {Object|null}
   */
  getCurrentTrack() {
    return this.currentTrack;
  }
}

export default ExpoAVPlayer;

