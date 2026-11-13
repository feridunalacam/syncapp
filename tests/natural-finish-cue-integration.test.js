import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import * as workoutDomain from '../src/domain/workout.js';
import { buildTimeline, normalizeRoutine } from '../src/domain/routines.js';
import { planSessionCues } from '../src/domain/alerts.js';
import { resolveRoundAudio } from '../src/domain/audio.js';
import { useAudioController } from '../src/hooks/useAudioController.js';
import { createCueHandoff } from '../src/services/alerts/cueHandoff.js';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ok = { success: true };
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function load(relative, exported, scope) {
  const source = readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default /gm, '')
    .replace(/^export /gm, '');
  const code = transformSync(`(function () { ${source}\nreturn ${exported}; })()`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  return new Script(code).runInNewContext(scope);
}

async function mount(t, { finish = true, countdown = false } = {}) {
  let now = 100000;
  let nextTimer = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const events = [];
  const requests = [];
  const logs = [];
  const controls = { stopBarrier: null };
  let beforePlay = null;
  let outputOwner = null;
  let outputPlaying = false;
  let musicPlaying = false;
  let workout;
  const song = {
    id: 'independent',
    name: 'Independent Apple song',
    uri: 'apple-music:song:independent',
    duration_ms: 180000,
  };
  const clock = {
    now: () => now,
    schedule(callback, delay) {
      const id = ++nextTimer;
      timeouts.set(id, { callback, at: now + delay });
      return id;
    },
    cancel(id) {
      timeouts.delete(id);
    },
  };
  const handoff = createCueHandoff({
    ...clock,
    needsMusicHandoff: () => companion.isActive(),
    async stopOutput(owner) {
      events.push(`cue.stop.request:${owner}`);
      if (outputPlaying && outputOwner === owner) {
        if (controls.stopBarrier) await controls.stopBarrier;
        outputPlaying = false;
        outputOwner = null;
      }
      events.push(`cue.stop.ack:${owner}`);
    },
  });
  const service = {
    getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
    async playTrack() {
      musicPlaying = true;
      events.push('music.start');
      return ok;
    },
    async pause() {
      musicPlaying = false;
      events.push('music.pause.ack');
      return ok;
    },
    async play() {
      assert.equal(outputPlaying, false, 'native cue output must stop before music resumes');
      musicPlaying = true;
      events.push('music.resume');
      return ok;
    },
    async cleanup() {
      musicPlaying = false;
      events.push('music.cleanup');
      return ok;
    },
    setRepeat: async () => ok,
    getCurrentPlayback: async () => ({ item: song, is_playing: musicPlaying, progress_ms: 1000 }),
  };
  const companion = createAppleMusicCompanionController({
    service,
    pollIntervalMs: 100000,
    beforePlay: async () => beforePlay?.(),
  });
  const unregisterApple = handoff.register({ suspendForCue: companion.suspendForCue });
  const player = {
    ...companion,
    registerBeforePlay(callback) {
      beforePlay = callback;
      return () => {
        if (beforePlay === callback) beforePlay = null;
      };
    },
  };
  const playWorkoutCue = (event) => {
    const done = deferred();
    const request = { event, done, played: false, pending: null };
    request.pending = handoff.run('workout', event, async () => {
      assert.equal(musicPlaying, false, 'the selected cue plays alone');
      request.played = true;
      outputOwner = 'workout';
      outputPlaying = true;
      events.push(`cue.play:${event.signalKey || event.number}`);
      return event.kind === 'count' ? { completed: true } : done.promise;
    });
    request.pending.catch(() => {});
    requests.push(request);
    return request.pending;
  };
  const stopWorkoutCues = () => handoff.stop('workout');
  const stopCuePreview = () => handoff.stop('preview');
  const routine = {
    id: 'finish-integration',
    name: 'Natural finish',
    rounds: 1,
    workSec: 4,
    restSec: 0,
    countdownBeforeStartDuration: 0,
    audioAlerts: {
      enabled: true,
      countdown: {
        mode: countdown ? 'beep' : 'off',
        seconds: 3,
        preparation: false,
        work: true,
        rest: false,
      },
      signals: {
        start: null,
        work: null,
        rest: null,
        finish: finish
          ? {
              uri: 'file:///chosen-finish.wav',
              platform: 'device',
              name: 'Chosen finish',
              duration: 0.8,
            }
          : null,
      },
    },
  };
  const routines = [routine];
  const setSyncPaused = () => {};
  const addCompletedRoutine = (log) => logs.push(log);
  const platform = {
    selectedPlatform: 'device',
    connectedPlatforms: { device: { connected: true } },
    services: { device: { pause: async () => ok, cleanup: async () => ok } },
  };
  const countdownSoundPlayer = { stop: async () => ok };
  const scope = {
    ...React,
    React,
    ...workoutDomain,
    normalizeRoutine,
    buildTimeline,
    resolveRoundAudio,
    planSessionCues,
    useAudioController,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    setInterval(callback) {
      const id = ++nextTimer;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout: clock.schedule,
    clearTimeout: clock.cancel,
    useAccountData: () => ({ setSyncPaused }),
    useRoutineContext: () => ({ routines, addCompletedRoutine }),
    usePlatformContext: () => platform,
    useAppleMusicConnection: () => ({ player }),
    useCountdownSoundPlayer: () => countdownSoundPlayer,
    prepareWorkoutCues: async () => {},
    playWorkoutCue,
    stopWorkoutCues,
    stopCuePreview,
    registerCueMusicSource: handoff.register,
  };
  scope.useTimerLogic = load('screens/Home/TimerLogic.js', 'useTimerLogic', scope);
  scope.useWorkoutCues = load('hooks/useWorkoutCues.js', 'useWorkoutCues', scope);
  const { WorkoutProvider, useWorkout } = load(
    'context/WorkoutContext.js',
    '({ WorkoutProvider, useWorkout })',
    scope,
  );
  function Observe() {
    workout = useWorkout();
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(WorkoutProvider, null, React.createElement(Observe)));
  });
  t.after(async () => {
    controls.stopBarrier = null;
    requests.forEach((request) => request.done.resolve({ completed: true }));
    await act(async () => {
      root.unmount();
      unregisterApple();
      await companion.dispose();
      await flush();
    });
  });
  const step = async (operation) => {
    let result;
    await act(async () => {
      result = await operation();
      await flush();
    });
    return result;
  };
  await step(() => companion.playTrack(song));
  events.length = 0;
  return {
    events,
    requests,
    logs,
    controls,
    companion,
    step,
    get workout() {
      return workout;
    },
    get musicPlaying() {
      return musicPlaying;
    },
    get outputPlaying() {
      return outputPlaying;
    },
    async start() {
      return step(() => workout.toggle());
    },
    async tick(ms) {
      now += ms;
      await step(() => [...intervals.values()].forEach((callback) => callback()));
      await step(async () => {
        for (;;) {
          const due = [...timeouts].find(([, value]) => value.at <= now);
          if (!due) break;
          timeouts.delete(due[0]);
          due[1].callback();
          await flush();
        }
      });
    },
  };
}

test('natural completion plays the selected finish cue alone and resumes Apple Music after cue stop ACK', async (t) => {
  const h = await mount(t);
  await h.start();
  await h.tick(4000);
  assert.equal(h.workout.session.status, 'completed');
  assert.equal(h.logs.length, 1);
  assert.equal(h.requests.length, 1);
  const finish = h.requests[0];
  assert.equal(finish.event.signalKey, 'finish');
  assert.equal(finish.event.sound.uri, 'file:///chosen-finish.wav');
  assert.equal(finish.event.resumeMusic, true);
  assert.equal(finish.played, true);
  assert.equal(h.musicPlaying, false);
  const drained = deferred();
  h.controls.stopBarrier = drained.promise;
  await h.step(() => finish.done.resolve({ completed: true }));
  assert.equal(h.outputPlaying, true);
  assert.equal(h.events.includes('music.resume'), false);
  await h.step(() => drained.resolve());
  await h.step(() => finish.pending);
  assert.equal(h.musicPlaying, true);
  assert.ok(h.events.indexOf('music.pause.ack') < h.events.indexOf('cue.play:finish'));
  assert.ok(h.events.lastIndexOf('cue.stop.ack:workout') < h.events.indexOf('music.resume'));
});

test('finish None with countdown off leaves independent Apple Music playing without a pause or cue', async (t) => {
  const h = await mount(t, { finish: false });
  await h.start();
  await h.tick(4000);
  assert.equal(h.workout.session.status, 'completed');
  assert.equal(h.logs.length, 1);
  assert.equal(h.requests.length, 0);
  assert.equal(h.musicPlaying, true);
  assert.equal(h.events.includes('music.pause.ack'), false);
  assert.equal(h.events.includes('music.resume'), false);
});

test('manual Stop during the finish cue cancels late resume even when the timer already completed', async (t) => {
  const h = await mount(t);
  await h.start();
  await h.tick(4000);
  assert.equal(h.workout.session.status, 'completed');
  const finish = h.requests[0];
  assert.equal(finish.played, true);
  await h.step(() => h.workout.stop());
  assert.equal(h.workout.session.status, 'completed');
  await h.step(() => finish.done.resolve({ completed: true }));
  await h.step(() => finish.pending);
  assert.equal(h.outputPlaying, false);
  assert.equal(h.musicPlaying, false);
  assert.equal(h.events.includes('music.resume'), false);
  assert.equal(h.logs.length, 1);
});

test('natural completion with finish None releases the final countdown-held burst and resumes Apple Music', async (t) => {
  const h = await mount(t, { finish: false, countdown: true });
  await h.start();
  for (const expected of [3, 2, 1]) {
    await h.tick(1000);
    assert.equal(h.requests.at(-1).event.number, expected);
    await h.step(() => h.requests.at(-1).pending);
    assert.equal(h.workout.session.status, 'running');
    assert.equal(h.musicPlaying, false, 'the countdown burst holds music between numbers');
    assert.equal(h.events.includes('music.resume'), false);
  }
  await h.tick(1000);
  assert.equal(h.workout.session.status, 'completed');
  assert.deepEqual(
    h.requests.map((request) => request.event.number),
    [3, 2, 1],
  );
  assert.equal(h.events.filter((event) => event === 'music.pause.ack').length, 1);
  assert.equal(h.events.filter((event) => event === 'music.resume').length, 1);
  assert.equal(h.musicPlaying, true);
});
