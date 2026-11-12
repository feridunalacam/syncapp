import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { CUE_ASSETS, LEGACY_CUE_ASSETS } from './assets';
import { createCueController } from './controller';
import { buildCuePreview, resolveAlertSound } from '../../domain/alerts';

// Kept for callers that prepare cues when selecting a routine. Effects need no voice engine.
export const prepareWorkoutCues = () => Promise.resolve();
let currentSound = null;
let complete = null;
let fallback = null;
const settle = (result) => {
  clearTimeout(fallback);
  fallback = null;
  const callback = complete;
  complete = null;
  callback?.(result);
};
const output = {
  async stop() {
    settle({ cancelled: true });
    const previous = currentSound;
    currentSound = null;
    await Promise.allSettled([previous?.unloadAsync()]);
  },
  async play(cue, cancelled) {
    const soundConfig = resolveAlertSound(cue.sound);
    const uri = soundConfig?.uri;
    if (!uri || cue.volume === 0) return { completed: true };
    const volume = Math.max(0, Math.min(100, cue.volume ?? 80)) / 100;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    });
    if (cancelled()) return { cancelled: true };
    const asset = CUE_ASSETS[uri] || LEGACY_CUE_ASSETS[uri];
    if (!asset && !/^(file|https?|content|asset):\/\//i.test(uri))
      throw new Error('Choose a sound file or a built-in cue.');
    const { sound } = await Audio.Sound.createAsync(asset || { uri }, {
      shouldPlay: false,
      volume,
      progressUpdateIntervalMillis: 100,
    });
    if (cancelled()) {
      await sound.unloadAsync();
      return { cancelled: true };
    }
    currentSound = sound;
    return new Promise((resolve, reject) => {
      complete = resolve;
      const finish = () => {
        if (currentSound !== sound) return;
        currentSound = null;
        settle({ completed: true });
        sound.unloadAsync().catch(() => {});
      };
      // Custom cues are intentionally bounded; they cannot outlive an entire short workout.
      fallback = setTimeout(
        finish,
        Math.min(15000, Math.max(2000, (soundConfig.duration || 4) * 1000 + 1000)),
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) finish();
        if (status.error && currentSound === sound) {
          currentSound = null;
          clearTimeout(fallback);
          complete = null;
          sound.unloadAsync().catch(() => {});
          reject(new Error('The selected alert could not be played.'));
        }
      });
      sound.playAsync().catch((error) => {
        if (currentSound !== sound) return resolve({ cancelled: true });
        currentSound = null;
        clearTimeout(fallback);
        complete = null;
        sound.unloadAsync().catch(() => {});
        reject(error);
      });
    });
  },
};
const controller = createCueController({ output });
export const playWorkoutCue = (event) => controller.play(event);
export const stopWorkoutCues = () => controller.stop('workout');
export const previewWorkoutCue = (key, config) => controller.preview(buildCuePreview(config, key));
export const stopCuePreview = () => controller.stop('preview');
