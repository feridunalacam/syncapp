import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createCueController } from '../src/services/alerts/controller.js';
import { buildCuePreview } from '../src/domain/alerts.js';

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
const adapterScript = new Script(
  `${adapterSource}\nglobalThis.api = { prepareWorkoutCues, playWorkoutCue, stopWorkoutCues, previewWorkoutCue, stopCuePreview };`,
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
  const utterances = [];
  const sounds = [];
  let speechStops = 0;
  let voiceRequests = 0;
  const voices = [
    { identifier: 'english-voice', language: 'en-US' },
    { identifier: 'turkish-voice', language: 'tr-TR' },
  ];
  const speech = {
    async getAvailableVoicesAsync() {
      voiceRequests++;
      return options.voices ? options.voices() : voices;
    },
    async stop() {
      speechStops++;
    },
    speak(text, configuration) {
      options.speak?.(text, configuration);
      utterances.push({ text, options: configuration });
    },
  };
  const audio = {
    async setAudioModeAsync() {},
    Sound: {
      async createAsync(source) {
        await options.load?.(source);
        const sound = {
          source,
          plays: 0,
          unloads: 0,
          callback: null,
          setOnPlaybackStatusUpdate(callback) {
            this.callback = callback;
          },
          async playAsync() {
            this.plays++;
          },
          async unloadAsync() {
            this.unloads++;
          },
        };
        sounds.push(sound);
        return { sound };
      },
    },
  };
  const context = {
    Audio: audio,
    Speech: speech,
    InterruptionModeIOS: { MixWithOthers: 0 },
    InterruptionModeAndroid: { DuckOthers: 1 },
    CUE_ASSETS: {},
    buildCuePreview,
    createCueController: (parameters) => createCueController({ ...parameters, ...time }),
    setTimeout: time.schedule,
    clearTimeout: time.cancel,
    require: (asset) => asset,
  };
  adapterScript.runInNewContext(context);
  return {
    api: context.api,
    time,
    utterances,
    sounds,
    get speechStops() {
      return speechStops;
    },
    get voiceRequests() {
      return voiceRequests;
    },
  };
}

const cue = (uri = 'speech://go', additions = {}) => ({
  sound: { uri, duration: 1 },
  volume: 100,
  language: 'en-US',
  ...additions,
});

test('speech waits for native readiness and uses an explicit matching voice', async () => {
  const readiness = deferred();
  const h = harness({ voices: () => readiness.promise });
  const playing = h.api.playWorkoutCue(cue('speech://rest', { language: 'tr-TR' }));
  await settle();
  assert.equal(h.utterances.length, 0);
  readiness.resolve([{ identifier: 'turkish-voice', language: 'tr-TR' }]);
  await settle();
  assert.equal(h.utterances[0].text, 'Dinlen');
  assert.equal(h.utterances[0].options.voice, 'turkish-voice');
  h.utterances[0].options.onStart();
  h.utterances[0].options.onDone();
  assert.equal((await playing).completed, true);
  assert.equal(h.time.jobs.size, 0);
});

test('stop during speech initialization prevents a delayed utterance', async () => {
  const readiness = deferred();
  const h = harness({ voices: () => readiness.promise });
  const playing = h.api.playWorkoutCue(cue());
  await settle();
  await h.api.stopWorkoutCues();
  readiness.resolve([{ identifier: 'english-voice', language: 'en-US' }]);
  assert.equal((await playing).cancelled, true);
  assert.equal(h.utterances.length, 0);
  assert.equal(h.time.jobs.size, 0);
});

test('old speech callbacks cannot stop or complete a newer utterance', async () => {
  const h = harness();
  const first = h.api.playWorkoutCue(cue());
  await settle();
  const firstEvents = h.utterances[0].options;
  const second = h.api.playWorkoutCue(cue('speech://rest'));
  await settle();
  assert.equal((await first).cancelled, true);
  const beforeOldCallbacks = h.speechStops;
  firstEvents.onStart();
  firstEvents.onDone();
  firstEvents.onError(new Error('Late old native error'));
  assert.equal(h.speechStops, beforeOldCallbacks);
  assert.equal(h.time.jobs.size, 1);
  h.utterances[1].options.onStart();
  h.utterances[1].options.onDone();
  assert.equal((await second).completed, true);
});

test('speech that never starts reports a timeout and the next cue can recover', async () => {
  const h = harness();
  const failure = assert.rejects(h.api.playWorkoutCue(cue()), /voice engine did not start/);
  await settle();
  await h.time.advance(5000);
  await failure;
  assert.equal(h.time.jobs.size, 0);
  const next = h.api.playWorkoutCue(cue('speech://rest'));
  await settle();
  h.utterances[1].options.onStart();
  h.utterances[1].options.onDone();
  assert.equal((await next).completed, true);
});

test('speech that starts but never finishes reports incomplete playback', async () => {
  const h = harness();
  const failure = assert.rejects(h.api.playWorkoutCue(cue()), /spoken cue did not finish/);
  await settle();
  h.utterances[0].options.onStart();
  await h.time.advance(5000);
  await failure;
  assert.equal(h.time.jobs.size, 0);
});

test('a speech start after its deadline is cancelled immediately', async () => {
  const h = harness();
  const playing = h.api.playWorkoutCue(cue('speech://count/3', { expiresAt: 10 }));
  await settle();
  await h.time.advance(20);
  h.utterances[0].options.onStart();
  assert.equal((await playing).cancelled, true);
  assert.equal(h.time.jobs.size, 0);
});

test('a superseded sound file load is unloaded without starting or disturbing speech', async () => {
  const loading = deferred();
  const h = harness({ load: () => loading.promise });
  const old = h.api.playWorkoutCue(cue('file:///old.wav'));
  await settle();
  const next = h.api.playWorkoutCue(cue('speech://rest'));
  await settle();
  loading.resolve();
  assert.equal((await old).cancelled, true);
  assert.equal(h.sounds[0].plays, 0);
  assert.equal(h.sounds[0].unloads, 1);
  h.utterances[0].options.onStart();
  h.utterances[0].options.onDone();
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

test('a synchronous speech exception clears its watchdog and permits retry', async () => {
  let fail = true;
  const h = harness({
    speak: () => {
      if (fail) throw new Error('Native unavailable');
    },
  });
  await assert.rejects(h.api.playWorkoutCue(cue()), /Native unavailable/);
  assert.equal(h.time.jobs.size, 0);
  fail = false;
  const retry = h.api.playWorkoutCue(cue());
  await settle();
  h.utterances[0].options.onStart();
  h.utterances[0].options.onDone();
  assert.equal((await retry).completed, true);
});

test('readiness timeout releases the cache so a later request can initialize again', async () => {
  const stuck = deferred();
  let first = true;
  const h = harness({
    voices: () => (first ? stuck.promise : [{ identifier: 'english-voice', language: 'en-US' }]),
  });
  const failure = assert.rejects(h.api.playWorkoutCue(cue()), /voice engine is not ready/);
  await settle();
  await h.time.advance(6000);
  await failure;
  first = false;
  const retry = h.api.playWorkoutCue(cue());
  await settle();
  assert.equal(h.voiceRequests, 2);
  h.utterances[0].options.onStart();
  h.utterances[0].options.onDone();
  assert.equal((await retry).completed, true);
  stuck.resolve([]);
  await settle();
  assert.equal(h.utterances.length, 1);
});
