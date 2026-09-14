import { useMemo } from 'react';
import { Audio } from 'expo-av';
import { CUE_ASSETS, LEGACY_CUE_ASSETS } from '../services/alerts/assets';
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
      ? CUE_ASSETS[uri] || LEGACY_CUE_ASSETS[uri] || LEGACY_CUE_ASSETS['voices://beep_short']
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
