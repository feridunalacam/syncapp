import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { CUE_ASSETS, LEGACY_CUE_ASSETS } from './assets';
import { createCueController } from './controller';
import { createCueHandoff } from './cueHandoff';
import { buildCuePreview, resolveAlertSound } from '../../domain/alerts';

// Kept for callers that prepare cues when selecting a routine. Effects need no voice engine.
export const prepareWorkoutCues = () => Promise.resolve();
let currentSound = null;
let complete = null;
let fallback = null;
// Ownership can be retired before native unloading finishes. Keep the sound and
// its acknowledgement available to every later handover stop, including failures.
const retiringSounds = new Set();
const unloadingSounds = new Map();
const pendingLoads = new Set();
const waitForCueLoad = (operation, deadline, discardLate = async () => {}) =>
  new Promise((resolve, reject) => {
    let terminal = false;
    let timer;
    const finish = (error, value) => {
      if (terminal) return;
      terminal = true;
      clearTimeout(timer);
      pendingLoads.delete(cancel);
      if (error) reject(error);
      else resolve(value);
    };
    const cancel = () => {
      const error = new Error('Alert loading cancelled.');
      error.cancelled = true;
      finish(error);
    };
    const timeout = () =>
      finish(new Error('The selected alert did not load in time. Try another sound.'));
    pendingLoads.add(cancel);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      timeout();
      return;
    }
    timer = setTimeout(timeout, remaining);
    Promise.resolve()
      .then(() => (terminal ? undefined : operation()))
      .then(
        (value) => {
          if (!terminal && Date.now() >= deadline) timeout();
          if (terminal) {
            Promise.resolve()
              .then(() => discardLate(value))
              .catch(() => {});
          } else finish(null, value);
        },
        (error) => {
          if (!terminal) finish(error);
        },
      );
  });
const unloadSound = (sound) => {
  if (unloadingSounds.has(sound)) return unloadingSounds.get(sound);
  retiringSounds.add(sound);
  const pending = (async () => {
    const status = await sound.unloadAsync();
    if (status === false || status?.success === false || status?.isLoaded === true)
      throw new Error('Alert audio did not stop. Try again.');
    retiringSounds.delete(sound);
  })().finally(() => unloadingSounds.delete(sound));
  unloadingSounds.set(sound, pending);
  pending.catch(() => {});
  return pending;
};
const waitForNativeStops = () => Promise.all([...retiringSounds].map(unloadSound));
const settle = (result) => {
  clearTimeout(fallback);
  fallback = null;
  const callback = complete;
  complete = null;
  callback?.(result);
};
const output = {
  async stop() {
    [...pendingLoads].forEach((cancel) => cancel());
    settle({ cancelled: true });
    const previous = currentSound;
    currentSound = null;
    if (previous) retiringSounds.add(previous);
    await waitForNativeStops();
  },
  async play(cue, cancelled) {
    const soundConfig = resolveAlertSound(cue.sound);
    const uri = soundConfig?.uri;
    if (!uri || cue.volume === 0) return { completed: true };
    const volume = Math.max(0, Math.min(100, cue.volume ?? 80)) / 100;
    // One pre-play budget covers both native awaits. Missing files can leave
    // createAsync pending indefinitely even though no audible sound was created.
    const deadline = Math.min(
      Date.now() + 2000,
      Number.isFinite(cue.expiresAt) ? cue.expiresAt : Infinity,
    );
    const asset = CUE_ASSETS[uri] || LEGACY_CUE_ASSETS[uri];
    if (!asset && !/^(file|https?|content|asset):\/\//i.test(uri))
      throw new Error('Choose a sound file or a built-in cue.');
    let sound;
    try {
      await waitForCueLoad(
        () =>
          Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
            interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
            shouldDuckAndroid: true,
          }),
        deadline,
      );
      if (cancelled()) return { cancelled: true };
      const loaded = await waitForCueLoad(
        () =>
          Audio.Sound.createAsync(asset || { uri }, {
            shouldPlay: false,
            volume,
            progressUpdateIntervalMillis: 100,
          }),
        deadline,
        (late) => (late?.sound ? unloadSound(late.sound) : undefined),
      );
      sound = loaded?.sound;
      if (!sound) throw new Error('The selected alert could not be loaded.');
    } catch (error) {
      if (error.cancelled || cancelled() || (cue.expiresAt != null && Date.now() >= cue.expiresAt))
        return { cancelled: true };
      throw error;
    }
    if (cancelled()) {
      await unloadSound(sound);
      return { cancelled: true };
    }
    currentSound = sound;
    return new Promise((resolve, reject) => {
      complete = resolve;
      const finish = () => {
        if (currentSound !== sound) return;
        currentSound = null;
        settle({ completed: true });
        unloadSound(sound).catch(() => {});
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
          unloadSound(sound).catch(() => {});
          reject(new Error('The selected alert could not be played.'));
        }
      });
      sound.playAsync().catch((error) => {
        if (currentSound !== sound) return resolve({ cancelled: true });
        currentSound = null;
        clearTimeout(fallback);
        complete = null;
        unloadSound(sound).catch(() => {});
        reject(error);
      });
    });
  },
};
const controller = createCueController({ output });
const stopOwner = (owner) => {
  const stopped = controller.stop(owner);
  // A prior suppression stop may already have cleared the controller's owner.
  // Its native stop still belongs to this barrier and must acknowledge silence.
  return Promise.all([stopped, waitForNativeStops()]).then(() => undefined);
};
const musicOwners = new Set();
const handoff = createCueHandoff({
  stopOutput: stopOwner,
  needsMusicHandoff: () => musicOwners.size > 0,
});
export const registerCueMusicSource = (source) => handoff.register(source);
export function acquireMusicCueSilence() {
  const owner = {};
  musicOwners.add(owner);
  handoff.stop('workout').catch(() => {});
  handoff.stop('preview').catch(() => {});
  let released = false;
  return () => {
    if (released) return;
    released = true;
    musicOwners.delete(owner);
  };
}
const audibleCue = (event) => !!resolveAlertSound(event?.sound)?.uri && event?.volume !== 0;
export const playWorkoutCue = (event) => {
  if (!audibleCue(event)) return Promise.resolve({ completed: true });
  return musicOwners.size && !handoff.hasSources()
    ? Promise.resolve({ cancelled: true })
    : handoff.run('workout', event, (cancelled) => controller.play(event, 'workout', cancelled));
};
export const stopWorkoutCues = () => handoff.stop('workout');
export const previewWorkoutCue = (key, config) => {
  const events = buildCuePreview(config, key).filter(audibleCue);
  if (!events.length) return Promise.resolve({ completed: true });
  return musicOwners.size && !handoff.hasSources()
    ? Promise.resolve({ cancelled: true })
    : handoff.run('preview', {}, (cancelled) => controller.preview(events, cancelled));
};
export const stopCuePreview = () => handoff.stop('preview');
