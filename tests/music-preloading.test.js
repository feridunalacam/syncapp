import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { resolveNextRoundAudio } from '../src/domain/audio.js';

const source = readFileSync(
  new URL('../src/services/audio/ExpoAVPlayer.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\n/gm, '')
  .replace('export default ExpoAVPlayer;', 'globalThis.Player = ExpoAVPlayer;');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settle = () => new Promise(setImmediate);
function harness(wait = () => {}) {
  const sounds = [],
    events = [];
  let initializations = 0;
  const scope = {
    console,
    setTimeout,
    clearTimeout,
    Audio: {
      setAudioModeAsync: async () => {
        initializations++;
      },
      Sound: {
        createAsync: async (input, status) => {
          const sound = {
            uri: input.uri,
            status,
            unloaded: false,
            setOnPlaybackStatusUpdate(callback) {
              this.update = callback;
            },
            async setStatusAsync(next) {
              this.status = next;
              events.push(['status', this.uri]);
            },
            async playAsync() {
              events.push(['play', this.uri]);
              return { isLoaded: true, isPlaying: true };
            },
            async pauseAsync() {},
            async unloadAsync() {
              this.unloaded = true;
              events.push(['unload', this.uri]);
            },
          };
          sounds.push(sound);
          events.push(['load', input.uri]);
          await wait(input.uri, sounds.length);
          return { sound };
        },
      },
    },
  };
  new Script(source).runInNewContext(scope);
  return { player: new scope.Player(), sounds, events, initializations: () => initializations };
}

test('a prepared local track stays silent and is reused without a second native load', async () => {
  const h = harness();
  await h.player.prepareTrack('file:///next.mp3');
  assert.equal(h.sounds[0].status.shouldPlay, false);
  assert.equal(h.sounds[0].status.volume, 0);
  assert.equal(
    h.events.some(([event]) => event === 'play'),
    false,
  );
  assert.equal(
    (await h.player.loadAndPlay('file:///next.mp3', { volumePercent: 35 })).success,
    true,
  );
  assert.equal(h.sounds.length, 1);
  assert.equal(h.sounds[0].status.volume, 0.35);
  assert.equal(h.player.prepared, null);
  assert.deepEqual(
    h.events.map(([event]) => event),
    ['load', 'status', 'play'],
  );
});

test('a replaced slow preload unloads itself and cannot replace the newer next track', async () => {
  const old = deferred();
  const h = harness((uri) => (uri.endsWith('old.mp3') ? old.promise : undefined));
  const pending = h.player.prepareTrack('file:///old.mp3');
  await settle();
  await h.player.prepareTrack('file:///new.mp3');
  old.resolve();
  assert.equal((await pending).cancelled, true);
  assert.equal(h.sounds[0].unloaded, true);
  assert.equal(h.player.prepared.uri, 'file:///new.mp3');
  await h.player.loadAndPlay('file:///new.mp3');
  assert.equal(h.sounds.length, 2);
  assert.deepEqual(
    h.events.filter(([event]) => event === 'play'),
    [['play', 'file:///new.mp3']],
  );
});

test('cleanup cancels an unfinished preload and leaves no extra native sound', async () => {
  const load = deferred();
  const h = harness(() => load.promise);
  const pending = h.player.prepareTrack('file:///next.mp3');
  await settle();
  await h.player.cleanup();
  load.resolve();
  assert.equal((await pending).cancelled, true);
  assert.equal(h.player.prepared, null);
  assert.equal(h.sounds[0].unloaded, true);
});

test('the active load never waits behind speculative preloading that has not completed', async () => {
  const slow = deferred();
  const h = harness((_uri, count) => (count === 1 ? slow.promise : undefined));
  const warming = h.player.prepareTrack('file:///next.mp3');
  await settle();
  let started = false;
  const playing = h.player.loadAndPlay('file:///next.mp3').then((result) => {
    started = true;
    return result;
  });
  await settle();
  assert.equal(started, true);
  slow.resolve();
  await Promise.all([warming, playing]);
  assert.equal(h.sounds[0].unloaded, true);
  assert.equal(h.sounds[1].unloaded, false);
});

test('HTTP music is not speculatively downloaded and initialization survives a phase release', async () => {
  const h = harness();
  assert.equal((await h.player.prepareTrack('https://example.com/stream.mp3')).notSupported, true);
  assert.equal(h.sounds.length, 0);
  await h.player.loadAndPlay('file:///first.mp3');
  await h.player.prepareTrack('file:///next.mp3');
  await h.player.unload();
  await h.player.loadAndPlay('file:///next.mp3');
  assert.equal(h.initializations(), 1);
  assert.equal(h.sounds.length, 2);
});

test('a retired sound cannot publish playback status for the current track', async () => {
  const h = harness();
  const updates = [];
  h.player.setOnStatusUpdate((value) => updates.push(value));
  await h.player.loadAndPlay('file:///old.mp3');
  await h.player.loadAndPlay('file:///new.mp3');
  h.sounds[0].update({ isLoaded: true, isPlaying: false });
  assert.equal(updates.length, 0);
  h.sounds[1].update({ isLoaded: true, isPlaying: true });
  assert.equal(updates[0].item.uri, 'file:///new.mp3');
});

test('look-ahead follows zero-rest, preparation and final-round timeline rules', () => {
  const routine = {
    rounds: 2,
    workSec: 10,
    restSec: 5,
    countdownBeforeStart: true,
    countdownBeforeStartDuration: 3,
    roundsData: [
      { workSong: { uri: 'file:///work.mp3' }, restSong: { uri: 'file:///rest.mp3' } },
      { workSong: { uri: 'file:///final.mp3' } },
    ],
  };
  assert.equal(resolveNextRoundAudio(routine, 'beforeStart', 0).source.uri, 'file:///rest.mp3');
  assert.equal(resolveNextRoundAudio(routine, 'work', 1).source.uri, 'file:///rest.mp3');
  assert.equal(resolveNextRoundAudio(routine, 'rest', 1).source.uri, 'file:///final.mp3');
  assert.equal(resolveNextRoundAudio(routine, 'work', 2), null);
  assert.equal(
    resolveNextRoundAudio({ ...routine, restSec: 0 }, 'work', 1).source.uri,
    'file:///final.mp3',
  );
});
