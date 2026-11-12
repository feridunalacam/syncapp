import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createCueController } from '../src/services/alerts/controller.js';
import { buildCuePreview, resolveAlertSound } from '../src/domain/alerts.js';

const settle = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Execute the actual adapter body with native modules and asset requires replaced.
// Node cannot load React Native packages; no playback logic is copied into the test.
const adapterSource = readFileSync(
  new URL('../src/services/alerts/player.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/^export /gm, '');
const assetSource = readFileSync(
  new URL('../src/services/alerts/assets.js', import.meta.url),
  'utf8',
).replace(/^export /gm, '');
const adapterScript = new Script(
  `${assetSource}\n${adapterSource}\nglobalThis.api = { prepareWorkoutCues, playWorkoutCue, stopWorkoutCues, previewWorkoutCue, stopCuePreview };`,
  { filename: 'native-alert-player.js' },
);

function fakeClock() {
  let current = 0;
  let id = 0;
  const jobs = new Map();
  return {
    jobs,
    now: () => current,
    schedule: (callback, delay) => {
      jobs.set(++id, { callback, at: current + delay });
      return id;
    },
    cancel: (key) => jobs.delete(key),
    async advance(target) {
      while (true) {
        const next = [...jobs]
          .filter(([, job]) => job.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [key, job] = next;
        jobs.delete(key);
        current = job.at;
        job.callback();
        await settle();
      }
      current = target;
      await settle();
    },
  };
}

function harness(options = {}) {
  const time = fakeClock();
  const sounds = [];
  let audioModes = 0;
  const audio = {
    async setAudioModeAsync() {
      audioModes++;
    },
    Sound: {
      async createAsync(source, configuration) {
        await options.load?.(source);
        const sound = {
          source,
          configuration,
          plays: 0,
          unloads: 0,
          callback: null,
          setOnPlaybackStatusUpdate(callback) {
            this.callback = callback;
          },
          async playAsync() {
            this.plays++;
            await options.play?.(source);
          },
          async unloadAsync() {
            this.unloads++;
            await options.unload?.(source);
          },
        };
        sounds.push(sound);
        return { sound };
      },
    },
  };
  const context = {
    Audio: audio,
    InterruptionModeIOS: { MixWithOthers: 0 },
    InterruptionModeAndroid: { DuckOthers: 1 },
    buildCuePreview,
    resolveAlertSound,
    createCueController: (parameters) => createCueController({ ...parameters, ...time }),
    setTimeout: time.schedule,
    clearTimeout: time.cancel,
    require: (asset) => {
      assert.doesNotMatch(asset, /coach-en/);
      return asset;
    },
  };
  adapterScript.runInNewContext(context);
  return {
    api: context.api,
    time,
    sounds,
    get audioModes() {
      return audioModes;
    },
  };
}

const cue = (uri = 'speech://go', additions = {}) => ({
  sound: { uri, duration: 1 },
  volume: 100,
  language: 'en-US',
  ...additions,
});

test('all fourteen saved speech URIs play only original effects in both saved languages', async () => {
  const expected = [
    ...Array.from({ length: 10 }, (_, i) => ['speech://count/' + (i + 1), 'tick.wav']),
    ['speech://go', 'boxing-bell.wav'],
    ['speech://rest', 'gong.wav'],
    ['speech://start', 'boxing-bell.wav'],
    ['speech://complete', 'finish-chime.wav'],
  ];
  for (const language of ['en-US', 'tr-TR']) {
    const h = harness();
    for (const [uri, filename] of expected) {
      const playing = h.api.playWorkoutCue(cue(uri, { language, volume: 35 }));
      await settle();
      const sound = h.sounds.at(-1);
      assert.equal(sound.source, '../../../assets/sounds/cues/' + filename);
      assert.equal(sound.configuration.volume, 0.35);
      assert.equal(sound.plays, 1);
      const wav = readFileSync(new URL('../assets/sounds/cues/' + filename, import.meta.url));
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
      sound.callback({ didJustFinish: true });
      assert.equal((await playing).completed, true);
    }
  }
});

test('cue readiness and zero effects volume never initialize native TTS or create audio', async () => {
  // The actual adapter runs without a Speech object or coach registry in its environment.
  const h = harness();
  await h.api.prepareWorkoutCues();
  assert.equal((await h.api.playWorkoutCue(cue('speech://go', { volume: 0 }))).completed, true);
  assert.equal(h.sounds.length, 0);
  assert.equal(h.audioModes, 0);
  assert.equal(h.time.jobs.size, 0);
});

test('stopping while a saved spoken fallback loads prevents late playback', async () => {
  const load = deferred();
  const h = harness({ load: () => load.promise });
  const playing = h.api.playWorkoutCue(cue('speech://count/3'));
  await settle();
  await h.api.stopWorkoutCues();
  load.resolve();
  assert.equal((await playing).cancelled, true);
  assert.equal(h.sounds[0].plays, 0);
  assert.equal(h.sounds[0].unloads, 1);
  assert.equal(h.time.jobs.size, 0);
});

test('a superseded custom file load cannot disturb the newer original fallback', async () => {
  const loading = deferred();
  const h = harness({
    load: (source) => (source.uri === 'file:///old.wav' ? loading.promise : undefined),
  });
  const old = h.api.playWorkoutCue(cue('file:///old.wav'));
  await settle();
  const next = h.api.playWorkoutCue(cue('speech://rest'));
  await settle();
  const current = h.sounds[0];
  assert.equal(current.source, '../../../assets/sounds/cues/gong.wav');
  assert.equal(current.plays, 1);
  loading.resolve();
  assert.equal((await old).cancelled, true);
  assert.equal(h.sounds[1].plays, 0);
  assert.equal(h.sounds[1].unloads, 1);
  assert.equal(current.unloads, 0);
  current.callback({ didJustFinish: true });
  assert.equal((await next).completed, true);
});

test('stale file completion and errors cannot settle the next file', async () => {
  const h = harness();
  const first = h.api.playWorkoutCue(cue('file:///first.wav'));
  await settle();
  const second = h.api.playWorkoutCue(cue('file:///second.wav'));
  await settle();
  assert.equal((await first).cancelled, true);
  h.sounds[0].callback({ didJustFinish: true });
  h.sounds[0].callback({ error: 'Old decoder failed' });
  assert.equal(h.sounds[1].unloads, 0);
  h.sounds[1].callback({ didJustFinish: true });
  assert.equal((await second).completed, true);
  assert.equal(h.sounds[1].unloads, 1);
});

test('a fallback loaded after its useful deadline is unloaded without playing', async () => {
  const loading = deferred();
  const h = harness({ load: () => loading.promise });
  const playing = h.api.playWorkoutCue(cue('speech://count/3', { expiresAt: 10 }));
  await settle();
  await h.time.advance(20);
  loading.resolve();
  assert.equal((await playing).cancelled, true);
  assert.equal(h.sounds[0].plays, 0);
  assert.equal(h.sounds[0].unloads, 1);
  assert.equal(h.time.jobs.size, 0);
});

test('a missing file completion is bounded and the next cue still plays', async () => {
  const h = harness();
  const first = h.api.playWorkoutCue(cue('speech://count/3'));
  await settle();
  await h.time.advance(2000);
  assert.equal((await first).completed, true);
  assert.equal(h.sounds[0].unloads, 1);
  assert.equal(h.time.jobs.size, 0);
  const next = h.api.playWorkoutCue(cue('speech://rest'));
  await settle();
  h.sounds[1].callback({ didJustFinish: true });
  assert.equal((await next).completed, true);
});

test('file playback failure clears its watchdog and permits retry', async () => {
  let fail = true;
  const h = harness({
    play: () => {
      if (fail) throw new Error('Native decoder failed');
    },
  });
  await assert.rejects(h.api.playWorkoutCue(cue()), /Native decoder failed/);
  assert.equal(h.time.jobs.size, 0);
  fail = false;
  const next = h.api.playWorkoutCue(cue());
  await settle();
  h.sounds[1].callback({ didJustFinish: true });
  assert.equal((await next).completed, true);
});

test('saved legacy cues and current cues keep their original synthesized replacements', async () => {
  const h = harness();
  for (const uri of ['voices://boxing_bell', 'voices://cue_boxing_bell']) {
    const playing = h.api.playWorkoutCue(cue(uri));
    await settle();
    const sound = h.sounds.at(-1);
    assert.equal(sound.source, '../../../assets/sounds/cues/boxing-bell.wav');
    sound.callback({ didJustFinish: true });
    assert.equal((await playing).completed, true);
  }
});

test('unknown speech URIs fail without a TTS or remote audio fallback', async () => {
  const h = harness();
  await assert.rejects(h.api.playWorkoutCue(cue('speech://unknown')), /built-in cue/);
  assert.equal(h.sounds.length, 0);
});
