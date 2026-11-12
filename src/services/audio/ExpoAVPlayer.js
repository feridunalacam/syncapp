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
    this.prepared = null;
    this.preparationVersion = 0;
    this.initializing = null;
    this.resumeVersion = 0;
    this.wantsPlayback = false;
  }

  /**
   * Initialize audio mode
   * Should be called before first playback
   */
  async initialize() {
    if (this.isInitialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      this.isInitialized = true;
    })().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  // Only one silent, local next track is held. Remote streams keep their normal loading path.
  prepareTrack(uri) {
    if (!/^(file|content):\/\//i.test(uri || ''))
      return Promise.resolve({ success: false, notSupported: true });
    if (this.prepared?.uri === uri) return this.prepared.promise;
    this.clearPrepared();
    const version = this.preparationVersion;
    const entry = { uri, sound: null, promise: null };
    this.prepared = entry;
    entry.promise = (async () => {
      try {
        await this.initialize();
        if (version !== this.preparationVersion) return { success: true, cancelled: true };
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, volume: 0, positionMillis: 0 },
        );
        if (version !== this.preparationVersion) {
          await sound.unloadAsync();
          return { success: true, cancelled: true };
        }
        entry.sound = sound;
        return { success: true };
      } catch {
        if (this.prepared === entry) this.prepared = null;
        return { success: false };
      }
    })();
    return entry.promise;
  }

  async clearPrepared() {
    this.preparationVersion++;
    const entry = this.prepared;
    this.prepared = null;
    if (entry?.sound) await entry.sound.unloadAsync().catch(() => {});
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
    this.resumeVersion++;
    try {
      await this.initialize();

      // Stop current playback if any
      if (this.sound) {
        await this.unload();
      }

      const initialStatus = {
        shouldPlay: false,
        positionMillis: options.positionMs || 0,
        volume: Math.max(0, Math.min(100, options.volumePercent ?? 100)) / 100,
      };
      const entry = this.prepared;
      let sound;
      // Never wait behind unfinished speculative work. A late preload unloads itself.
      if (entry?.uri === uri && entry.sound) {
        sound = entry.sound;
        this.prepared = null;
        this.preparationVersion++;
        try {
          await sound.setStatusAsync(initialStatus);
        } catch (error) {
          await sound.unloadAsync().catch(() => {});
          throw error;
        }
      } else {
        await this.clearPrepared();
        ({ sound } = await Audio.Sound.createAsync({ uri }, initialStatus));
      }

      if (options.isCancelled?.()) {
        await sound.unloadAsync();
        return { success: true, cancelled: true };
      }

      this.sound = sound;
      this.wantsPlayback = options.shouldPlay !== false;
      this.currentTrack = {
        uri,
        name: options.name || 'Audio Track',
        artist: options.artist || 'Unknown Artist',
        album: options.album || 'Unknown Album',
        image: options.image || null,
      };
      this.isPlaying = false;

      // Set up status update listener
      sound.setOnPlaybackStatusUpdate((status) => {
        if (this.sound === sound) this._handleStatusUpdate(status);
      });

      if (options.shouldPlay !== false) {
        const ready = await this.waitForPlayback(
          sound,
          await sound.playAsync(),
          options.isCancelled,
        );
        if (!ready) {
          await this.unload();
          return { success: true, cancelled: true };
        }
        this.isPlaying = true;
      }

      return { success: true };
    } catch (error) {
      await this.unload();
      console.error('❌ Error loading audio:', error);
      return { success: false, error: error.message };
    }
  }

  // Native playAsync may acknowledge a start or resume before buffering ends.
  async waitForPlayback(sound, status, isCancelled) {
    const deadline = Date.now() + 8000;
    while (status?.isLoaded && (!status.isPlaying || status.isBuffering)) {
      if (isCancelled?.()) return false;
      if (Date.now() >= deadline)
        throw new Error('Audio is still buffering. Check the source and resume.');
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (isCancelled?.()) return false;
      status = await sound.getStatusAsync();
    }
    if (isCancelled?.()) return false;
    if (status?.isLoaded === false) throw new Error(status.error || 'Audio could not be loaded.');
    return true;
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
    this.resumeVersion++;
    this.wantsPlayback = false;
    try {
      if (!this.sound) {
        this.isPlaying = false;
        return { success: true };
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
  async play(options = {}) {
    const version = ++this.resumeVersion;
    const sound = this.sound;
    const isCancelled = () =>
      version !== this.resumeVersion || this.sound !== sound || options.isCancelled?.();
    try {
      if (options.isCancelled?.()) return { success: true, cancelled: true };
      if (!sound) {
        return { success: false, error: 'No track loaded' };
      }

      this.wantsPlayback = true;
      this.isPlaying = false;
      const ready = await this.waitForPlayback(sound, await sound.playAsync(), isCancelled);
      if (!ready) {
        if (this.sound === sound && (version === this.resumeVersion || !this.wantsPlayback)) {
          this.wantsPlayback = false;
          await sound.pauseAsync();
          this.isPlaying = false;
        }
        return { success: true, cancelled: true };
      }
      this.isPlaying = true;
      return { success: true };
    } catch (error) {
      if (isCancelled()) return { success: true, cancelled: true };
      this.wantsPlayback = false;
      this.isPlaying = false;
      await sound?.pauseAsync().catch(() => {});
      console.error('❌ Error playing:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop and unload current sound
   * @returns {Promise<void>}
   */
  async unload() {
    this.resumeVersion++;
    this.wantsPlayback = false;
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
            uri: this.currentTrack?.uri,
            name: this.currentTrack?.name || 'Audio Track',
            artist: this.currentTrack?.artist || 'Unknown Artist',
            duration_ms: status.durationMillis || 0,
            album: {
              name: this.currentTrack?.album || 'Unknown Album',
              images: this.currentTrack?.image ? [{ url: this.currentTrack.image }] : [],
            },
          },
          progress_ms: status.positionMillis || 0,
          is_playing: status.isPlaying && !status.isBuffering,
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
      this.isPlaying = status.isPlaying && !status.isBuffering;

      if (this.onStatusUpdate) {
        this.onStatusUpdate({
          item: {
            uri: this.currentTrack?.uri,
            name: this.currentTrack?.name || 'Audio Track',
            artist: this.currentTrack?.artist || 'Unknown Artist',
            duration_ms: status.durationMillis || 0,
          },
          progress_ms: status.positionMillis || 0,
          is_playing: status.isPlaying && !status.isBuffering,
        });
      }
    }
  }

  /**
   * Cleanup and release resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.clearPrepared();
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
