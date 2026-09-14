import { useMemo } from 'react';
import { Audio } from 'expo-av';
import { CUE_ASSETS } from '../services/alerts/assets';
const SOUNDS = {
  beep_short: require('../../assets/sounds/beep_short.mp3'),
  beep_long: require('../../assets/sounds/beep_long.mp3'),
  tone_high: require('../../assets/sounds/beep_short.mp3'),
  tone_low: require('../../assets/sounds/beep_long.mp3'),
  bell: require('../../assets/sounds/bell.mp3'),
  gong: require('../../assets/sounds/gong.mp3'),
  boxing_bell: require('../../assets/sounds/boxing_bell.mp3'),
  whistle: require('../../assets/sounds/whistle.mp3'),
  buzzer: require('../../assets/sounds/buzzer.mp3'),
  air_horn: require('../../assets/sounds/air_horn.mp3'),
  countdown_321: require('../../assets/sounds/countdown_321.mp3'),
  countdown_go: require('../../assets/sounds/voice_go.mp3'),
  countdown_start: require('../../assets/sounds/voice_ready.mp3'),
  success: require('../../assets/sounds/chime.mp3'),
};
class CountdownSoundPlayer {
  constructor() {
    this.sound = null;
    this.revision = 0;
  }
  async stop() {
    this.revision++;
    const sound = this.sound;
    this.sound = null;
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {}
    }
  }
  async play(uri) {
    const revision = ++this.revision;
    const previous = this.sound;
    this.sound = null;
    if (previous) {
      try {
        await previous.unloadAsync();
      } catch {}
    }
    if (revision !== this.revision) return;
    const source = uri.startsWith('voices://')
      ? CUE_ASSETS[uri] || SOUNDS[uri.slice(9)] || SOUNDS.beep_short
      : { uri };
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false });
      if (revision !== this.revision) {
        await sound.unloadAsync();
        return;
      }
      this.sound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish && this.sound === sound) this.stop();
      });
      await sound.playAsync();
    } catch (error) {
      if (__DEV__) console.warn('Could not play alert:', error.message);
    }
  }
  async cleanup() {
    await this.stop();
  }
}
const player = new CountdownSoundPlayer();
export const getCountdownSoundPlayer = () => player;
export const useCountdownSoundPlayer = () =>
  useMemo(
    () => ({
      play: (uri) => player.play(uri),
      stop: () => player.stop(),
      cleanup: () => player.cleanup(),
    }),
    [],
  );
export default CountdownSoundPlayer;
