import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const body = readFileSync(new URL('../src/services/audio/ExpoAVPlayer.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default ExpoAVPlayer;', 'globalThis.Player = ExpoAVPlayer;');
const script = new Script(body);

function harness(load, playbackStatuses = []) {
  const events = [];
  const sound = {
    setOnPlaybackStatusUpdate() {},
    async playAsync() {
      events.push('play');
      return playbackStatuses.shift();
    },
    async getStatusAsync() {
      return playbackStatuses.shift();
    },
    async unloadAsync() {
      events.push('unload');
    },
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Audio: {
      async setAudioModeAsync() {},
      Sound: {
        async createAsync(source, status) {
          events.push({ uri: source.uri, ...status });
          await load?.();
          return { sound };
        },
      },
    },
  };
  script.runInNewContext(context);
  return { player: new context.Player(), events };
}

test('local preparation music loads at half volume before it can play', async () => {
  const { player, events } = harness();
  await player.loadAndPlay('file:///song.wav', { volumePercent: 50 });
  assert.equal(events[0].volume, 0.5);
  assert.equal(events[0].shouldPlay, false);
  assert.equal(events[1], 'play');
});

test('cancelling a slow music load unloads it without an audible burst', async () => {
  let finishLoad;
  const pending = new Promise((resolve) => {
    finishLoad = resolve;
  });
  const { player, events } = harness(() => pending);
  let cancelled = false;
  const result = player.loadAndPlay('https://example.com/song.mp3', {
    volumePercent: 50,
    isCancelled: () => cancelled,
  });
  await new Promise(setImmediate);
  cancelled = true;
  finishLoad();
  assert.equal((await result).cancelled, true);
  assert.equal(events.includes('play'), false);
  assert.equal(events.at(-1), 'unload');
  assert.equal(player.sound, null);
});

test('zero music volume is preserved while the track still advances', async () => {
  const { player, events } = harness();
  await player.loadAndPlay('file:///song.wav', { volumePercent: 0 });
  assert.equal(events[0].volume, 0);
  assert.equal(events[1], 'play');
});

test('web audio is ready only after native buffering ends', async () => {
  const { player } = harness(null, [
    { isLoaded: true, isPlaying: false, isBuffering: true },
    { isLoaded: true, isPlaying: true, isBuffering: false },
  ]);
  let ready = false;
  const result = player.loadAndPlay('https://example.com/song.mp3').then((r) => {
    ready = true;
    return r;
  });
  await new Promise(setImmediate);
  assert.equal(ready, false);
  assert.equal((await result).success, true);
});

test('pause during buffering cancels playback and unloads the sound', async () => {
  const { player, events } = harness(null, [
    { isLoaded: true, isPlaying: false, isBuffering: true },
    { isLoaded: true, isPlaying: false, isBuffering: true },
  ]);
  let cancelled = false;
  const result = player.loadAndPlay('https://example.com/song.mp3', {
    isCancelled: () => cancelled,
  });
  await new Promise(setImmediate);
  cancelled = true;
  assert.equal((await result).cancelled, true);
  assert.equal(events.at(-1), 'unload');
  assert.equal(player.sound, null);
});
