import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const body = readFileSync(new URL('../src/services/audio/ExpoAVPlayer.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default ExpoAVPlayer;', 'globalThis.Player = ExpoAVPlayer;');
const script = new Script(body);

function harness(load, playbackStatuses = [], overrides = {}) {
  const events = [];
  const sound = {
    setOnPlaybackStatusUpdate() {},
    async playAsync() {
      events.push('play');
      return playbackStatuses.shift();
    },
    async pauseAsync() {
      events.push('pause');
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
    ...overrides,
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

test('resuming web audio waits for native buffering to finish before reporting readiness', async () => {
  const { player } = harness(null, [
    { isLoaded: true, isPlaying: true, isBuffering: false },
    { isLoaded: true, isPlaying: false, isBuffering: true },
    { isLoaded: true, isPlaying: true, isBuffering: false },
  ]);
  await player.loadAndPlay('https://example.org/audio.mp3');
  await player.pause();
  let ready = false;
  const resumed = player.play().then((result) => {
    ready = true;
    return result;
  });
  await new Promise(setImmediate);
  assert.equal(ready, false);
  assert.equal(player.isCurrentlyPlaying(), false);
  assert.equal((await resumed).success, true);
  assert.equal(player.isCurrentlyPlaying(), true);
});

test('pausing a buffering resume retires it without losing the loaded track', async () => {
  const { player } = harness(null, [
    { isLoaded: true, isPlaying: true, isBuffering: false },
    { isLoaded: true, isPlaying: false, isBuffering: true },
  ]);
  await player.loadAndPlay('file:///audio.mp3');
  const sound = player.sound;
  await player.pause();
  const resumed = player.play();
  await new Promise(setImmediate);
  await player.pause();
  assert.equal((await resumed).cancelled, true);
  assert.equal(player.sound, sound);
  assert.equal(player.isCurrentlyPlaying(), false);
});

test('a failed native resume stays paused and reports failure instead of success', async () => {
  const { player } = harness(null, [
    { isLoaded: true, isPlaying: true, isBuffering: false },
    { isLoaded: false, error: 'Source is unavailable' },
  ]);
  await player.loadAndPlay('file:///audio.mp3');
  await player.pause();
  assert.equal((await player.play()).success, false);
  assert.equal(player.isCurrentlyPlaying(), false);
});

test('pausing an empty player is idempotent so a failed load can be retried', async () => {
  const { player } = harness();
  assert.equal((await player.pause()).success, true);
});

test('a resume that never finishes buffering fails within the readiness deadline', async () => {
  let now = 0;
  const { player } = harness(
    null,
    [
      { isLoaded: true, isPlaying: true, isBuffering: false },
      { isLoaded: true, isPlaying: false, isBuffering: true },
      { isLoaded: true, isPlaying: false, isBuffering: true },
    ],
    {
      Date: { now: () => now },
      setTimeout(resolve) {
        now += 9000;
        resolve();
      },
    },
  );
  await player.loadAndPlay('https://example.org/audio.mp3');
  await player.pause();
  const result = await player.play();
  assert.equal(result.success, false);
  assert.match(result.error, /buffering/);
  assert.equal(player.isCurrentlyPlaying(), false);
});

test('a late native resume is paused again when the user has already paused', async () => {
  const { player, events } = harness();
  await player.loadAndPlay('file:///audio.mp3');
  let finish;
  player.sound.playAsync = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = player.play();
  await new Promise(setImmediate);
  await player.pause();
  const pauses = events.filter((event) => event === 'pause').length;
  finish({ isLoaded: true, isPlaying: true, isBuffering: false });
  assert.equal((await pending).cancelled, true);
  assert.equal(events.filter((event) => event === 'pause').length, pauses + 1);
  assert.equal(player.isCurrentlyPlaying(), false);
});

test('an obsolete resume cannot pause a newer successful resume on the same sound', async () => {
  const { player, events } = harness();
  await player.loadAndPlay('file:///audio.mp3');
  let finish;
  let calls = 0;
  player.sound.playAsync = () =>
    ++calls === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ isLoaded: true, isPlaying: true, isBuffering: false });
  const old = player.play();
  await new Promise(setImmediate);
  assert.equal((await player.play()).success, true);
  const pauses = events.filter((event) => event === 'pause').length;
  finish({ isLoaded: true, isPlaying: true, isBuffering: false });
  assert.equal((await old).cancelled, true);
  assert.equal(events.filter((event) => event === 'pause').length, pauses);
  assert.equal(player.isCurrentlyPlaying(), true);
});
