import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createCueController } from '../src/services/alerts/controller.js';
import { createCueHandoff } from '../src/services/alerts/cueHandoff.js';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';
import { buildCuePreview, resolveAlertSound } from '../src/domain/alerts.js';

const settle = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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
  `${assetSource}\n${adapterSource}\nglobalThis.api = { prepareWorkoutCues, playWorkoutCue, stopWorkoutCues, previewWorkoutCue, stopCuePreview, acquireMusicCueSilence, registerCueMusicSource };`,
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
  const loads = [];
  let audioModes = 0;
  const audio = {
    async setAudioModeAsync() {
      audioModes++;
      await options.mode?.();
    },
    Sound: {
      async createAsync(source, configuration) {
        loads.push(source);
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
            return await options.unload?.(source);
          },
        };
        sounds.push(sound);
        return { sound };
      },
    },
  };
  const context = {
    Date: class extends Date {
      static now() {
        return time.now();
      }
    },
    Audio: audio,
    InterruptionModeIOS: { MixWithOthers: 0 },
    InterruptionModeAndroid: { DuckOthers: 1 },
    buildCuePreview,
    resolveAlertSound,
    createCueController: (parameters) => createCueController({ ...parameters, ...time }),
    createCueHandoff: (parameters) => createCueHandoff({ ...parameters, ...time }),
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
    loads,
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

async function musicHarness(t, options = {}) {
  const h = harness(options);
  const events = [];
  let playing = false;
  const track = {
    id: 'independent',
    uri: 'apple-music:song:independent',
    name: 'Independent song',
    duration_ms: 60000,
  };
  const service = {
    getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
    playTrack: async () => {
      playing = true;
      return { success: true };
    },
    pause: async () => {
      playing = false;
      events.push('music.pause');
      return { success: true };
    },
    play: async () => {
      playing = true;
      events.push('music.resume');
      return { success: true };
    },
    cleanup: async () => {
      playing = false;
      events.push('music.clear');
      return { success: true };
    },
    setRepeat: async () => ({ success: true }),
    getCurrentPlayback: async () => ({ item: track, is_playing: playing, progress_ms: 1000 }),
  };
  const controller = createAppleMusicCompanionController({
    service,
    pollIntervalMs: 100000,
    beforePlay: () => Promise.all([h.api.stopWorkoutCues(), h.api.stopCuePreview()]),
  });
  const release = h.api.acquireMusicCueSilence();
  const unregister = h.api.registerCueMusicSource({ suspendForCue: controller.suspendForCue });
  await controller.playTrack(track);
  await settle();
  events.length = 0;
  t.after(async () => {
    controller.cancelCueResume();
    unregister();
    await Promise.allSettled([h.api.stopWorkoutCues(), h.api.stopCuePreview()]);
    await controller.dispose();
    release();
  });
  return {
    ...h,
    controller,
    unregister,
    events,
    get musicPlaying() {
      return playing;
    },
    resumes: () => events.filter((event) => event === 'music.resume').length,
    request(event = cue('file:///missing-custom.wav')) {
      const pending = h.api.playWorkoutCue(event);
      pending.catch(() => {});
      return pending;
    },
  };
}

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
  await settle(); // Cancellation is prompt; the late silent load still retires separately.
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
  await settle();
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
  await settle(); // The cancelled request settles before its late native load retires.
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

for (const owner of ['workout', 'preview']) {
  test(`music suppression and both stop callers await the same ${owner} native unload`, async () => {
    const unloaded = deferred();
    const h = harness({ unload: () => unloaded.promise });
    const playing =
      owner === 'workout'
        ? h.api.playWorkoutCue(cue())
        : h.api.previewWorkoutCue('start', { enabled: true, countdown: { mode: 'off' } });
    await settle();
    if (owner === 'preview') await h.time.advance(0);
    assert.equal(h.sounds[0].plays, 1);
    const release = h.api.acquireMusicCueSilence();
    let workoutStopped = false,
      previewStopped = false,
      musicStarted = false;
    const workoutStop = h.api.stopWorkoutCues().then(() => {
      workoutStopped = true;
    });
    const previewStop = h.api.stopCuePreview().then(() => {
      previewStopped = true;
    });
    const handover = Promise.all([workoutStop, previewStop]).then(() => {
      musicStarted = true;
    });
    await settle();
    assert.equal(h.sounds[0].unloads, 1, 'all callers share the native stop');
    assert.equal(workoutStopped, false);
    assert.equal(previewStopped, false);
    assert.equal(musicStarted, false);
    assert.equal((await playing).cancelled, true, 'cue cancellation itself stays prompt');
    assert.equal((await h.api.playWorkoutCue(cue())).cancelled, true);
    unloaded.resolve();
    await handover;
    assert.equal(workoutStopped, true);
    assert.equal(previewStopped, true);
    assert.equal(musicStarted, true);
    release();
    assert.equal(h.time.jobs.size, 0);
  });

  test(`a failed ${owner} unload rejects music handover and remains recoverable`, async () => {
    const unloaded = deferred();
    let fail = true;
    const h = harness({ unload: () => (fail ? unloaded.promise : undefined) });
    const playing =
      owner === 'workout'
        ? h.api.playWorkoutCue(cue())
        : h.api.previewWorkoutCue('start', { enabled: true, countdown: { mode: 'off' } });
    await settle();
    if (owner === 'preview') await h.time.advance(0);
    const release = h.api.acquireMusicCueSilence();
    let musicStarted = false;
    const handover = Promise.all([h.api.stopWorkoutCues(), h.api.stopCuePreview()]).then(() => {
      musicStarted = true;
    });
    const rejected = assert.rejects(handover, /Native unload failed/);
    unloaded.reject(new Error('Native unload failed'));
    await rejected;
    assert.equal(musicStarted, false);
    assert.equal((await playing).cancelled, true);
    await assert.rejects(h.api.stopWorkoutCues(), /Native unload failed/);
    fail = false;
    await Promise.all([h.api.stopWorkoutCues(), h.api.stopCuePreview()]);
    assert.equal(
      h.sounds[0].unloads,
      3,
      'a failed native sound is retained for acknowledged retry',
    );
    release();
    const retry = h.api.playWorkoutCue(cue());
    await settle();
    h.sounds.at(-1).callback({ didJustFinish: true });
    assert.equal((await retry).completed, true);
    assert.equal(h.time.jobs.size, 0);
  });
}

test('stopping preview still cannot stop an active workout cue', async () => {
  const h = harness();
  const playing = h.api.playWorkoutCue(cue());
  await settle();
  await h.api.stopCuePreview();
  assert.equal(h.sounds[0].unloads, 0);
  h.sounds[0].callback({ didJustFinish: true });
  assert.equal((await playing).completed, true);
});

test('a configured custom cue waits for music pause and native cue unload before music resumes', async () => {
  const paused = deferred();
  const unloaded = deferred();
  const events = [];
  const h = harness({
    play: () => events.push('cue-play'),
    unload: async () => {
      await unloaded.promise;
      events.push('cue-unloaded');
    },
  });
  const unregister = h.api.registerCueMusicSource({
    suspendForCue: async () => {
      events.push('pause-request');
      await paused.promise;
      events.push('music-paused');
      return { resume: async () => events.push('music-resumed') };
    },
  });
  const release = h.api.acquireMusicCueSilence();
  const playing = h.api.previewWorkoutCue('start', {
    enabled: true,
    volume: 35,
    countdown: { mode: 'off' },
    signals: { start: { uri: 'file:///selected-custom.wav', duration: 2.5 } },
  });
  await settle();
  assert.equal(h.sounds.length, 0);
  paused.resolve();
  await settle();
  await h.time.advance(0);
  assert.equal(h.sounds[0].source.uri, 'file:///selected-custom.wav');
  assert.equal(h.sounds[0].configuration.volume, 0.35);
  assert.equal(h.sounds[0].plays, 1);
  h.sounds[0].callback({ didJustFinish: true });
  await settle();
  assert.equal(events.includes('music-resumed'), false);
  unloaded.resolve();
  assert.equal((await playing).completed, true);
  await settle();
  assert.deepEqual(events, [
    'pause-request',
    'music-paused',
    'cue-play',
    'cue-unloaded',
    'music-resumed',
  ]);
  release();
  unregister();
});

test('disabled, None and zero-volume alerts never pause music', async () => {
  const h = harness();
  let pauses = 0;
  const unregister = h.api.registerCueMusicSource({
    suspendForCue: async () => {
      pauses++;
      return { resume: async () => {} };
    },
  });
  await h.api.previewWorkoutCue('start', { enabled: false });
  await h.api.previewWorkoutCue('start', {
    enabled: true,
    countdown: { mode: 'off' },
    signals: { start: null },
  });
  await h.api.previewWorkoutCue('rest', { enabled: true, volume: 0 });
  await h.api.playWorkoutCue(cue('voices://cue_gong', { volume: 0 }));
  await h.api.playWorkoutCue({ sound: null });
  assert.equal(pauses, 0);
  assert.equal(h.sounds.length, 0);
  assert.equal(h.audioModes, 0);
  unregister();
});

test('a still-loaded native stop result cannot release music until a checked retry succeeds', async () => {
  let status = { isLoaded: true };
  let resumed = 0;
  const h = harness({ unload: () => status });
  const unregister = h.api.registerCueMusicSource({
    suspendForCue: async () => ({
      resume: async () => {
        resumed++;
      },
    }),
  });
  const playing = h.api.playWorkoutCue(cue());
  await settle();
  const rejected = assert.rejects(playing, /did not stop/);
  h.sounds[0].callback({ didJustFinish: true });
  await rejected;
  assert.equal(resumed, 0);
  status = { isLoaded: false };
  await h.api.stopWorkoutCues();
  await settle();
  assert.equal(resumed, 0, 'a failed stop cancels automatic resume even after recovery');
  assert.ok(h.sounds[0].unloads >= 2);
  unregister();
});

for (const stage of ['mode', 'load']) {
  test(`real Apple music resumes by the two-second budget when native ${stage} never settles`, async (t) => {
    const waiting = deferred();
    const h = await musicHarness(t, { [stage]: () => waiting.promise });
    const playing = h.request();
    let settledAt = null;
    playing.then(
      () => {
        settledAt = h.time.now();
      },
      () => {
        settledAt = h.time.now();
      },
    );
    await settle();
    assert.equal(h.musicPlaying, false);
    await h.time.advance(1999);
    assert.equal(settledAt, null);
    await h.time.advance(2000);
    await assert.rejects(playing, /did not load in time/);
    await settle();
    assert.equal(settledAt, 2000);
    assert.equal(h.musicPlaying, true);
    assert.equal(h.resumes(), 1);
    assert.equal(h.sounds.length, 0);
    assert.equal(h.loads.length, stage === 'mode' ? 0 : 1);
    assert.equal(h.time.jobs.size, 0);
    waiting.resolve();
    await settle();
    await settle();
    assert.equal(
      h.loads.length,
      stage === 'mode' ? 0 : 1,
      'mode completing after timeout cannot begin a native load',
    );
    assert.ok(h.sounds.every((sound) => sound.plays === 0 && sound.unloads === 1));
    assert.equal(h.resumes(), 1, 'late native completion cannot restore music a second time');
  });
}

test('native mode taking 1500ms leaves only 500ms of the same total preplay budget', async (t) => {
  const mode = deferred();
  const loading = deferred();
  const h = await musicHarness(t, { mode: () => mode.promise, load: () => loading.promise });
  const playing = h.request();
  await settle();
  await h.time.advance(1500);
  assert.equal(h.loads.length, 0);
  mode.resolve();
  await settle();
  assert.equal(h.loads.length, 1);
  let settled = false;
  playing.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await h.time.advance(1999);
  assert.equal(settled, false);
  await h.time.advance(2000);
  await assert.rejects(playing, /did not load in time/);
  assert.equal(h.musicPlaying, true);
  assert.equal(h.resumes(), 1);
});

test('an event deadline of 600ms cancels a hanging load and restores real Apple music early', async (t) => {
  const loading = deferred();
  const h = await musicHarness(t, { load: () => loading.promise });
  const playing = h.request(cue('file:///missing.wav', { kind: 'signal', expiresAt: 600 }));
  await settle();
  await h.time.advance(599);
  assert.equal(h.musicPlaying, false);
  await h.time.advance(600);
  assert.equal((await playing).cancelled, true);
  await settle();
  assert.equal(h.musicPlaying, true);
  assert.equal(h.resumes(), 1);
  assert.equal(h.sounds.length, 0);
  assert.equal(h.time.jobs.size, 0);
});

for (const boundary of ['timeout', 'supersede']) {
  test(`a custom load completing after ${boundary} retires only its own silent sound beside a newer cue`, async (t) => {
    const loading = deferred();
    const h = await musicHarness(t, {
      load: (source) => (source.uri === 'file:///old.wav' ? loading.promise : undefined),
    });
    const old = h.request(cue('file:///old.wav'));
    await settle();
    if (boundary === 'timeout') {
      await h.time.advance(2000);
      await assert.rejects(old, /did not load in time/);
      assert.equal(h.musicPlaying, true);
    }
    const next = h.request(cue('speech://rest'));
    await settle();
    if (boundary === 'supersede') assert.equal((await old).cancelled, true);
    const current = h.sounds.find(
      (sound) => sound.source === '../../../assets/sounds/cues/gong.wav',
    );
    assert.ok(current);
    assert.equal(current.plays, 1);
    const jobs = h.time.jobs.size;
    const resumes = h.resumes();
    loading.resolve();
    await settle();
    await settle();
    const late = h.sounds.find((sound) => sound.source.uri === 'file:///old.wav');
    assert.equal(late.configuration.shouldPlay, false);
    assert.equal(late.plays, 0);
    assert.equal(late.unloads, 1);
    assert.equal(current.unloads, 0);
    assert.equal(h.time.jobs.size, jobs, 'late disposal cannot clear the newer cue watchdog');
    assert.equal(
      h.resumes(),
      resumes,
      'late disposal cannot settle the current cue or resume its music',
    );
    current.callback({ didJustFinish: true });
    assert.equal((await next).completed, true);
    await settle();
    assert.equal(h.musicPlaying, true);
    assert.equal(h.resumes(), resumes + 1);
  });
}

test('a native load rejecting after timeout is handled without disturbing the newer cue', async (t) => {
  const loading = deferred();
  const h = await musicHarness(t, {
    load: (source) => (source.uri === 'file:///old.wav' ? loading.promise : undefined),
  });
  const old = h.request(cue('file:///old.wav'));
  await settle();
  await h.time.advance(2000);
  await assert.rejects(old, /did not load in time/);
  const next = h.request(cue('speech://rest'));
  await settle();
  const current = h.sounds[0];
  loading.reject(new Error('Late missing-file rejection'));
  await settle();
  await settle();
  assert.equal(current.plays, 1);
  assert.equal(current.unloads, 0);
  assert.equal(h.resumes(), 1);
  current.callback({ didJustFinish: true });
  assert.equal((await next).completed, true);
  await settle();
  assert.equal(h.resumes(), 2);
});

test('a failed late unload stays owned, blocks the next cue and needs explicit recovery without automatic resume', async (t) => {
  const loading = deferred();
  let fail = true;
  const h = await musicHarness(t, {
    load: (source) => (source.uri === 'file:///old.wav' ? loading.promise : undefined),
    unload: (source) => {
      if (source.uri === 'file:///old.wav' && fail) throw new Error('Late native unload failed');
    },
  });
  const old = h.request(cue('file:///old.wav'));
  await settle();
  await h.time.advance(2000);
  await assert.rejects(old, /did not load in time/);
  loading.resolve();
  await settle();
  await settle();
  const late = h.sounds[0];
  assert.equal(late.plays, 0);
  assert.equal(late.unloads, 1);
  await h.time.advance(9000);
  assert.equal(late.unloads, 1, 'there is no timer-based cleanup retry');
  const blocked = h.request(cue('speech://rest'));
  await assert.rejects(blocked, /Late native unload failed/);
  await settle();
  assert.equal(h.sounds.length, 1, 'no new cue loads over an uncertain native sound');
  assert.equal(h.resumes(), 1);
  assert.equal(h.musicPlaying, false);
  fail = false;
  await h.api.stopWorkoutCues();
  await settle();
  assert.ok(late.unloads >= 3);
  assert.equal(h.resumes(), 1, 'acknowledged recovery does not restart a failed cue burst');
  await h.controller.resume();
  assert.equal(h.musicPlaying, true);
});

for (const boundary of ['manual pause', 'clear', 'background', 'dispose and unregister']) {
  test(`${boundary} promptly cancels pending native mode/load and prevents late playback or resume`, async (t) => {
    for (const stage of ['mode', 'load']) {
      const waiting = deferred();
      const h = await musicHarness(t, { [stage]: () => waiting.promise });
      const playing = h.request();
      await settle();
      assert.equal(h.musicPlaying, false);
      if (boundary === 'manual pause') await h.controller.pause();
      else if (boundary === 'clear') await h.controller.clear();
      else if (boundary === 'background') h.controller.setAppActive(false);
      else {
        h.unregister();
        await h.controller.dispose();
      }
      await h.api.stopWorkoutCues();
      assert.equal((await playing).cancelled, true);
      assert.equal(h.time.now(), 0, 'explicit cancellation does not wait for the loading timeout');
      waiting.resolve();
      await settle();
      await settle();
      assert.equal(
        h.loads.length,
        stage === 'mode' ? 0 : 1,
        'late mode acknowledgement cannot begin a native load',
      );
      assert.ok(h.sounds.every((sound) => sound.plays === 0 && sound.unloads === 1));
      assert.equal(h.resumes(), 0);
      assert.equal(h.musicPlaying, false);
      assert.equal(h.time.jobs.size, 0);
    }
  });
}
