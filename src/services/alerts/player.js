import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import { CUE_ASSETS, LEGACY_CUE_ASSETS } from './assets';
import { COACH_CUES } from './coachVoice';
import { createCueController } from './controller';
import { buildCuePreview } from '../../domain/alerts';

const words = {
  'en-US': {
    go: 'Go',
    rest: 'Rest',
    start: 'Start',
    complete: 'Workout complete',
    numbers: [
      'Zero',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
    ],
  },
  'tr-TR': {
    go: 'Başla',
    rest: 'Dinlen',
    start: 'Başla',
    complete: 'Antrenman tamamlandı',
    numbers: ['Sıfır', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz', 'On'],
  },
};
let availableVoices;
const prepareSpeech = () => {
  if (!availableVoices) {
    let timeout;
    availableVoices = Promise.race([
      Speech.getAvailableVoicesAsync(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('The voice engine is not ready. Try again or use beeps.')),
          6000,
        );
      }),
    ])
      .catch((error) => {
        availableVoices = null;
        throw error;
      })
      .finally(() => clearTimeout(timeout));
  }
  return availableVoices;
};
export const prepareWorkoutCues = () => prepareSpeech();
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
    await Promise.allSettled([Speech.stop(), previous?.unloadAsync()]);
  },
  async play(cue, cancelled) {
    const uri = cue.sound?.uri;
    if (!uri || cue.volume === 0) return { completed: true };
    const coachCue = cue.language !== 'tr-TR' ? COACH_CUES[uri] : null;
    const volume = Math.max(0, Math.min(100, cue.volume ?? 80)) / 100;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    });
    if (cancelled()) return { cancelled: true };
    if (uri.startsWith('speech://') && !coachCue) {
      const language = words[cue.language] ? cue.language : 'en-US';
      const voices = await prepareSpeech();
      if (cancelled()) return { cancelled: true };
      const preferred =
        voices.find((voice) => voice.language?.replace('_', '-') === language) ||
        voices.find((voice) => voice.language?.slice(0, 2) === language.slice(0, 2));
      if (!preferred)
        throw new Error(
          'This voice language is not installed. Choose another language or use beeps.',
        );
      const token = uri.slice('speech://'.length);
      const text = token.startsWith('count/')
        ? words[language].numbers[Number(token.slice(6))]
        : words[language][token];
      if (!text) throw new Error('This spoken cue is not available.');
      return new Promise((resolve, reject) => {
        complete = resolve;
        let started = false;
        const fail = (error) => {
          if (complete !== resolve) return;
          clearTimeout(fallback);
          fallback = null;
          complete = null;
          reject(error);
        };
        // A missing native completion callback cannot leave Preview stuck indefinitely.
        fallback = setTimeout(() => {
          if (complete !== resolve) return;
          fail(
            new Error(
              started
                ? 'The spoken cue did not finish. Try again or use beeps.'
                : 'The voice engine did not start. Try again or use beeps.',
            ),
          );
          Speech.stop().catch(() => {});
        }, 5000);
        const options = {
          language,
          voice: preferred.identifier,
          volume,
          rate: 1.05,
          pitch: 1,
          useApplicationAudioSession: true,
          onStart: () => {
            // Native events from an old utterance must never stop the new one.
            if (complete !== resolve) return;
            if (cancelled()) {
              settle({ cancelled: true });
              Speech.stop().catch(() => {});
            } else started = true;
          },
          onDone: () => {
            if (complete === resolve) settle({ completed: true });
          },
          onStopped: () => {
            if (complete === resolve) settle({ cancelled: true });
          },
          onError: fail,
        };
        try {
          Speech.speak(text, options);
        } catch (error) {
          fail(error);
        }
      });
    }
    const asset = coachCue?.asset || CUE_ASSETS[uri] || LEGACY_CUE_ASSETS[uri];
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
        Math.min(
          15000,
          Math.max(2000, (coachCue?.duration || cue.sound.duration || 4) * 1000 + 1000),
        ),
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
