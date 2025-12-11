import { Audio } from 'expo-av';

/**
 * Countdown Sound Player - Platform Agnostic Sound Player for Countdown Alerts
 * 
 * Supports playing sounds from:
 * - Built-in voices (voices://...)
 * - Device files (file://...)
 * - Remote URLs (https://...)
 * 
 * Built-in sounds use free online CDN resources.
 */

// Free sound effects from Mixkit - verified working URLs
// Note: Mixkit allows hotlinking for their preview sounds
const SOUND_URLS = {
  // Notification sounds
  'beep_short': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  'beep_long': 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
  'tone_high': 'https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3',
  'tone_low': 'https://assets.mixkit.co/active_storage/sfx/2866/2866-preview.mp3',
  
  // Bells & Chimes
  'bell': 'https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3',
  'gong': 'https://assets.mixkit.co/active_storage/sfx/2855/2855-preview.mp3',
  'boxing_bell': 'https://assets.mixkit.co/active_storage/sfx/2218/2218-preview.mp3',
  
  // Alarms & Signals
  'whistle': 'https://assets.mixkit.co/active_storage/sfx/2436/2436-preview.mp3',
  'buzzer': 'https://assets.mixkit.co/active_storage/sfx/2221/2221-preview.mp3',
  'air_horn': 'https://assets.mixkit.co/active_storage/sfx/2215/2215-preview.mp3',
  
  // Countdown & Start
  'countdown_321': 'https://assets.mixkit.co/active_storage/sfx/2871/2871-preview.mp3',
  'countdown_go': 'https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3',
  'countdown_start': 'https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3',
  
  // Success
  'success': 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
};

// Fallback URL if sound not found
const FALLBACK_URL = SOUND_URLS['beep_short'];

class CountdownSoundPlayer {
  constructor() {
    this.sound = null;
    this.isInitialized = false;
    this.preloadedSounds = new Map(); // Cache for preloaded sounds
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('🔊 Failed to initialize audio mode:', error);
    }
  }

  /**
   * Preload sounds for faster playback
   * @param {Array} soundUris - Array of sound URIs to preload
   */
  async preload(soundUris) {
    if (!soundUris || soundUris.length === 0) return;
    
    await this.initialize();
    
    for (const uri of soundUris) {
      if (!uri || this.preloadedSounds.has(uri)) continue;
      
      try {
        let source;
        if (uri.startsWith('voices://')) {
          const soundId = uri.replace('voices://', '');
          const resolvedUrl = SOUND_URLS[soundId] || FALLBACK_URL;
          source = { uri: resolvedUrl };
        } else {
          source = { uri };
        }
        
        // Preload without playing
        const { sound } = await Audio.Sound.createAsync(
          source,
          { shouldPlay: false, volume: 1.0 }
        );
        
        this.preloadedSounds.set(uri, sound);
      } catch (error) {
        console.warn('🔊 Failed to preload sound:', uri, error.message);
      }
    }
  }

  /**
   * Play a countdown sound
   * @param {string} uri - Sound URI (voices://id, file://path, or https://url)
   */
  async play(uri) {
    if (!uri) return;

    await this.initialize();
    
    // Stop any currently playing sound
    await this.stop();

    try {
      // Check if sound is preloaded
      if (this.preloadedSounds.has(uri)) {
        const preloadedSound = this.preloadedSounds.get(uri);
        this.sound = preloadedSound;
        await preloadedSound.setPositionAsync(0); // Reset to start
        await preloadedSound.playAsync();
        
        // Auto-cleanup when finished (but keep in cache)
        preloadedSound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            this.sound = null;
          }
        });
        return;
      }

      // Not preloaded - load and play
      let source;
      let resolvedUrl;

      if (uri.startsWith('voices://')) {
        const soundId = uri.replace('voices://', '');
        resolvedUrl = SOUND_URLS[soundId] || FALLBACK_URL;
        source = { uri: resolvedUrl };
      } else if (uri.startsWith('file://') || uri.startsWith('/')) {
        source = { uri };
        resolvedUrl = uri;
      } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
        source = { uri };
        resolvedUrl = uri;
      } else {
        resolvedUrl = SOUND_URLS[uri] || FALLBACK_URL;
        source = { uri: resolvedUrl };
      }

      const { sound, status } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: true, volume: 1.0 }
      );
      
      if (!status.isLoaded) {
        console.error('🔊 Sound failed to load:', uri);
        return;
      }
      
      this.sound = sound;

      // Auto-unload when finished
      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.didJustFinish) {
          this.cleanup();
        }
      });
    } catch (error) {
      console.error('🔊 Error playing sound:', error.message);
    }
  }

  /**
   * Stop the currently playing sound
   */
  async stop() {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
      } catch (error) {
        // Ignore errors when stopping
      }
      await this.cleanup();
    }
  }

  /**
   * Cleanup sound resources
   */
  async cleanup() {
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (error) {
        // Ignore errors when unloading
      }
      this.sound = null;
    }
  }
}

// Singleton instance
let playerInstance = null;

/**
 * Get the singleton countdown sound player instance
 * @returns {CountdownSoundPlayer}
 */
export const getCountdownSoundPlayer = () => {
  if (!playerInstance) {
    playerInstance = new CountdownSoundPlayer();
  }
  return playerInstance;
};

/**
 * Hook for using countdown sound player in React components
 */
export const useCountdownSoundPlayer = () => {
  const player = getCountdownSoundPlayer();
  
  return {
    play: (uri) => player.play(uri),
    stop: () => player.stop(),
    cleanup: () => player.cleanup(),
    preload: (soundUris) => player.preload(soundUris),
  };
};

export default CountdownSoundPlayer;
