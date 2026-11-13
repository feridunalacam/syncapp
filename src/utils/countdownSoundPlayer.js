import { useMemo } from 'react';
import { Audio } from 'expo-av';
import { CUE_ASSETS, LEGACY_CUE_ASSETS } from '../services/alerts/assets';
class CountdownSoundPlayer {
  constructor() {
    this.sound = null;
    this.revision = 0;
    this.retiringSounds = new Set();
    this.unloadingSounds = new Map();
  }
  unloadSound(sound) {
    if (this.unloadingSounds.has(sound)) return this.unloadingSounds.get(sound);
    this.retiringSounds.add(sound);
    const pending = (async () => {
      const status = await sound.unloadAsync();
      if (status === false || status?.success === false || status?.isLoaded === true)
        throw new Error('Alert audio did not stop. Try again.');
      this.retiringSounds.delete(sound);
    })().finally(() => this.unloadingSounds.delete(sound));
    this.unloadingSounds.set(sound, pending);
    // Completion callbacks may retire a sound without a waiting caller. Failed
    // sounds remain owned by the barrier until a later stop acknowledges them.
    pending.catch(() => {});
    return pending;
  }
  async waitForNativeStops() {
    await Promise.all([...this.retiringSounds].map((sound) => this.unloadSound(sound)));
  }
  async stop() {
    this.revision++;
    const sound = this.sound;
    this.sound = null;
    if (sound) this.retiringSounds.add(sound);
    await this.waitForNativeStops();
  }
  async play(uri) {
    const revision = ++this.revision;
    const previous = this.sound;
    this.sound = null;
    if (previous) this.retiringSounds.add(previous);
    await this.waitForNativeStops();
    if (revision !== this.revision) return;
    const source = uri.startsWith('voices://')
      ? CUE_ASSETS[uri] || LEGACY_CUE_ASSETS[uri] || LEGACY_CUE_ASSETS['voices://beep_short']
      : { uri };
    let sound;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
      if (revision !== this.revision) return;
      ({ sound } = await Audio.Sound.createAsync(source, { shouldPlay: false }));
    } catch (error) {
      if (__DEV__) console.warn('Could not play alert:', error.message);
      return;
    }
    if (revision !== this.revision) {
      await this.unloadSound(sound);
      return;
    }
    try {
      this.sound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish && this.sound === sound) this.stop().catch(() => {});
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
