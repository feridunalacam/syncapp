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
    this.loadVersion = 0;
    this.loads = new Set();
    this.plays = new Set();
    this.retiringSounds = new Set();
    this.retiredSounds = new WeakSet();
    this.unloading = new Map();
    this.pausing = new Map();
    this.silencing = null;
    this.retirementError = null;
    this.pauseFailures = new Set();
    this.pauseError = null;
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
    const clearing = this.clearPrepared();
    const version = this.preparationVersion;
    const entry = { uri, sound: null, promise: null };
    this.prepared = entry;
    entry.promise = (async () => {
      let sound;
      try {
        const cleared = await clearing;
        if (cleared.success === false) {
          if (this.prepared === entry) this.prepared = null;
          return cleared;
        }
        await this.initialize();
        if (version !== this.preparationVersion) return { success: true, cancelled: true };
        ({ sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, volume: 0, positionMillis: 0 },
        ));
        this.retiredSounds.delete(sound);
        if (version !== this.preparationVersion) {
          const stopped = await this._retireSound(sound);
          return stopped.success === false ? stopped : { success: true, cancelled: true };
        }
        entry.sound = sound;
        return { success: true };
      } catch {
        if (this.prepared === entry) this.prepared = null;
        if (sound) await this._retireSound(sound);
        return { success: false };
      }
    })();
    return entry.promise;
  }

  async clearPrepared() {
    this.preparationVersion++;
    const entry = this.prepared;
    this.prepared = null;
    return this._retireSounds([...this.retiringSounds, entry?.sound]);
  }

  _assertAcknowledged(status, operation) {
    if (
      status === false ||
      status?.success === false ||
      (operation === 'unload' && status?.isLoaded === true) ||
      (operation === 'pause' && status?.isPlaying === true)
    )
      throw new Error(status?.error || `Audio ${operation} was not acknowledged. Try again.`);
  }

  _retireSound(sound) {
    if (!sound || this.retiredSounds.has(sound)) return Promise.resolve({ success: true });
    if (this.unloading.has(sound)) return this.unloading.get(sound);
    this.retiringSounds.add(sound);
    const pending = (async () => {
      try {
        this._assertAcknowledged(await sound.unloadAsync(), 'unload');
        this.retiredSounds.add(sound);
        this.retiringSounds.delete(sound);
        this.pauseFailures.delete(sound);
        if (!this.retiringSounds.size) this.retirementError = null;
        if (this.sound === sound) {
          this.sound = null;
          this.currentTrack = null;
          this.isPlaying = false;
        }
        return { success: true };
      } catch (error) {
        this.retirementError = error.message || 'Audio could not be stopped. Try again.';
        return { success: false, error: this.retirementError };
      }
    })();
    this.unloading.set(sound, pending);
    pending.finally(() => this.unloading.delete(sound));
    return pending;
  }

  async _retireSounds(sounds) {
    const results = await Promise.all(
      [...new Set(sounds.filter(Boolean))].map((sound) => this._retireSound(sound)),
    );
    return results.find((result) => result.success === false) || { success: true };
  }

  _pauseSound(sound) {
    if (!sound || this.retiredSounds.has(sound)) return Promise.resolve({ success: true });
    if (this.pausing.has(sound)) return this.pausing.get(sound);
    const pending = (async () => {
      try {
        this._assertAcknowledged(await sound.pauseAsync(), 'pause');
        this.pauseFailures.delete(sound);
        if (this.sound === sound) this.isPlaying = false;
        return { success: true };
      } catch (error) {
        this.pauseFailures.add(sound);
        this.pauseError = error.message || 'Audio could not be paused. Try again.';
        return { success: false, error: this.pauseError };
      }
    })();
    this.pausing.set(sound, pending);
    pending.finally(() => this.pausing.delete(sound));
    return pending;
  }

  // A stop includes older native starts, which may acknowledge after pauseAsync.
  // New starts wait for this barrier; failed retirements remain owned for retry.
  _silence(unload, clearPrepared = false) {
    this.resumeVersion++;
    this.loadVersion++;
    this.wantsPlayback = false;
    const previous = this.silencing;
    const starts = [...this.loads, ...this.plays];
    const prepared = clearPrepared ? this.prepared : null;
    if (clearPrepared) {
      this.preparationVersion++;
      this.prepared = null;
    }
    const pending = Promise.resolve(previous)
      .then(async () => {
        const stopped = unload
          ? await this._retireSounds([this.sound, ...this.retiringSounds, prepared?.sound])
          : await this._pauseSound(this.sound);
        await Promise.all(starts);
        if (stopped.success === false) return stopped;
        if (this.retiringSounds.size)
          return {
            success: false,
            error: this.retirementError || 'Audio cleanup is not acknowledged. Try again.',
          };
        if (this.pauseFailures.size)
          return {
            success: false,
            error: this.pauseError || 'Audio pause is not acknowledged. Try again.',
          };
        return { success: true };
      })
      .catch((error) => ({
        success: false,
        error: error.message || 'Audio could not be stopped. Try again.',
      }));
    this.silencing = pending;
    pending.finally(() => {
      if (this.silencing === pending) this.silencing = null;
    });
    return pending;
  }

  /**
   * Load and play a track
   * @param {string} uri - Audio file URI (file://, http://, etc.)
   * @param {Object} options - Playback options
   * @param {number} options.positionMs - Start position in milliseconds
   * @param {boolean} options.shouldPlay - Auto-play after loading (default: true)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  loadAndPlay(uri, options = {}) {
    const version = ++this.loadVersion;
    this.resumeVersion++;
    this.wantsPlayback = false;
    const barrier = this.silencing;
    const previous = [...this.loads, ...this.plays];
    const isCancelled = () => version !== this.loadVersion || options.isCancelled?.();
    const pending = Promise.resolve(barrier)
      .then(async () => {
        await Promise.all(previous);
        if (isCancelled()) return { success: true, cancelled: true };
        return this._loadAndPlay(uri, options, isCancelled);
      })
      .catch((error) => ({ success: false, error: error.message || 'Audio could not be loaded.' }));
    this.loads.add(pending);
    pending.finally(() => this.loads.delete(pending));
    return pending;
  }

  async _loadAndPlay(uri, options, isCancelled) {
    let sound;
    try {
      await this.initialize();
      if (isCancelled()) return { success: true, cancelled: true };

      const stopped = await this._retireSounds([this.sound, ...this.retiringSounds]);
      if (stopped.success === false) return stopped;
      if (isCancelled()) return { success: true, cancelled: true };

      const initialStatus = {
        shouldPlay: false,
        positionMillis: options.positionMs || 0,
        volume: Math.max(0, Math.min(100, options.volumePercent ?? 100)) / 100,
      };
      const entry = this.prepared;
      // Never wait behind unfinished speculative work. A late preload unloads itself.
      if (entry?.uri === uri && entry.sound) {
        sound = entry.sound;
        this.prepared = null;
        this.preparationVersion++;
        await sound.setStatusAsync(initialStatus);
      } else {
        const cleared = await this.clearPrepared();
        if (cleared.success === false) return cleared;
        if (isCancelled()) return { success: true, cancelled: true };
        ({ sound } = await Audio.Sound.createAsync({ uri }, initialStatus));
        this.retiredSounds.delete(sound);
      }

      if (isCancelled()) {
        const retired = await this._retireSound(sound);
        return retired.success === false ? retired : { success: true, cancelled: true };
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
        const ready = await this.waitForPlayback(sound, await sound.playAsync(), isCancelled);
        if (!ready) {
          const retired = await this._retireSound(sound);
          return retired.success === false ? retired : { success: true, cancelled: true };
        }
        this.isPlaying = true;
      }

      return { success: true };
    } catch (error) {
      const retired = sound ? await this._retireSound(sound) : { success: true };
      console.error('❌ Error loading audio:', error);
      return retired.success === false ? retired : { success: false, error: error.message };
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
  pause() {
    return this._silence(false);
  }

  /**
   * Resume playback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  play(options = {}) {
    const version = ++this.resumeVersion;
    const sound = this.sound;
    const barrier = this.silencing;
    const isCancelled = () =>
      version !== this.resumeVersion || this.sound !== sound || options.isCancelled?.();
    const pending = Promise.resolve(barrier).then(() =>
      this._play(sound, version, options, isCancelled),
    );
    this.plays.add(pending);
    pending.finally(() => this.plays.delete(pending));
    return pending;
  }

  async _play(sound, version, options, isCancelled) {
    try {
      if (isCancelled()) return { success: true, cancelled: true };
      if (!sound) {
        return { success: false, error: 'No track loaded' };
      }
      if (this.retiringSounds.size || this.pauseFailures.size)
        return {
          success: false,
          error: this.retirementError || 'Stop the previous audio before resuming.',
        };

      this.wantsPlayback = true;
      this.isPlaying = false;
      const ready = await this.waitForPlayback(sound, await sound.playAsync(), isCancelled);
      if (!ready) {
        if (this.sound === sound && (version === this.resumeVersion || !this.wantsPlayback)) {
          this.wantsPlayback = false;
          const paused = await this._pauseSound(sound);
          if (paused.success === false) return paused;
        }
        return { success: true, cancelled: true };
      }
      this.isPlaying = true;
      return { success: true };
    } catch (error) {
      if (isCancelled() && (this.sound !== sound || this.wantsPlayback))
        return { success: true, cancelled: true };
      this.wantsPlayback = false;
      const paused = await this._pauseSound(sound);
      console.error('❌ Error playing:', error);
      return paused.success === false ? paused : { success: false, error: error.message };
    }
  }

  /**
   * Stop and unload current sound
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  unload() {
    return this._silence(true);
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
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cleanup() {
    const stopped = await this._silence(true, true);
    if (stopped.success === false) return stopped;
    this.currentTrack = null;
    this.onStatusUpdate = null;
    this.isInitialized = false;
    return stopped;
  }

  /**
   * Check if a track is currently loaded
   * @returns {boolean}
   */
  isLoaded() {
    return this.sound !== null || this.retiringSounds.size > 0;
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
