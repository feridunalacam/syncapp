import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { normalizeRoutine, buildTimeline } from '../src/domain/routines.js';
import { sessionToLog } from '../src/domain/workout.js';
import { resolveRoundAudio } from '../src/domain/audio.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const STORAGE_KEYS = {
  ROUTINES: 'routines',
  COMPLETED_ROUTINES: 'completedRoutines',
  POSTS: 'posts',
};
function loadProvider(name, values) {
  const source = readFileSync(new URL(`../src/context/${name}Context.js`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export /gm, '');
  const code = transformSync(
    `${source}\nglobalThis.Provider = ${name}Provider; globalThis.read = use${name === 'Workout' ? 'Workout' : name + 'Context'};`,
    { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] },
  ).code;
  const context = {
    ...React,
    React,
    STORAGE_KEYS,
    normalizeRoutine,
    buildTimeline,
    sessionToLog,
    resolveRoundAudio,
    ...values,
  };
  new Script(code).runInNewContext(context);
  return context;
}
async function mountRecords(t, name, records, failureKey = null, userId = null) {
  const writes = [];
  let failures = 0;
  let value;
  const context = loadProvider(name, {
    useAccountData: () => ({
      storage: {
        userId,
        async getJSON(key) {
          if (key === failureKey) throw new Error('Device storage unavailable');
          return records[key] ?? null;
        },
        async setJSON(key, data) {
          writes.push([key, data]);
        },
      },
      reportLoadFailure() {
        failures++;
      },
    }),
  });
  function Consumer() {
    value = context.read();
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(context.Provider, null, React.createElement(Consumer)));
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    get value() {
      return value;
    },
    writes,
    get failures() {
      return failures;
    },
  };
}

for (const key of ['routines', 'completedRoutines']) {
  test(`a failed ${key} read cannot hydrate or overwrite either routine record`, async (t) => {
    const h = await mountRecords(
      t,
      'Routine',
      {
        routines: [{ id: 'personal', name: 'My routine' }],
        completedRoutines: [{ id: 'history', actualDurationSec: 12 }],
      },
      key,
    );
    assert.equal(h.value.isLoaded, false);
    assert.equal(h.failures, 1);
    assert.deepEqual(h.writes, []);
  });
}
test('a failed posts read never persists the sample feed over saved content', async (t) => {
  const h = await mountRecords(t, 'Post', {}, 'posts');
  assert.equal(h.failures, 1);
  assert.deepEqual(h.writes, []);
});
test('stored empty and legacy routine lists are retained, with no fabricated history', async (t) => {
  const empty = await mountRecords(t, 'Routine', { routines: [], completedRoutines: [] });
  assert.equal(empty.value.isLoaded, true);
  assert.equal(empty.value.routines.length, 0);
  const legacy = await mountRecords(t, 'Routine', {
    routines: [{ id: 'deneme', name: 'My existing deneme', rounds: 2, workSec: 10, restSec: 0 }],
  });
  assert.equal(legacy.value.routines.length, 1);
  assert.equal(legacy.value.routines[0].id, 'deneme');
  assert.equal(legacy.value.routines[0].name, 'My existing deneme');
  assert.equal(legacy.value.completedRoutines.length, 0);
});
test('new guest defaults are usable timers and sample routines have no fake Spotify sources', async (t) => {
  const routines = await mountRecords(t, 'Routine', {});
  assert.equal(
    routines.value.routines.map((routine) => routine.name).join(','),
    'Interval Starter,Quick Burst,Endurance',
  );
  const account = await mountRecords(t, 'Routine', {}, null, 'account');
  assert.equal(account.value.routines.length, 0);
  const posts = await mountRecords(t, 'Post', {});
  for (const post of posts.value.posts) {
    for (const phase of buildTimeline(post.routine))
      assert.equal(resolveRoundAudio(post.routine, phase.phase, phase.round), null);
  }
});

test('deleting one session preserves other sessions with the same completion timestamp', async (t) => {
  const completedAt = '2026-11-12T10:00:00.000Z';
  const records = [
    { id: 'same-routine', sessionId: 'first-device-session', completedAt },
    { id: 'same-routine', sessionId: 'second-device-session', completedAt },
    { id: 'different-routine', sessionId: 'third-device-session', completedAt },
  ];
  const h = await mountRecords(t, 'Routine', { completedRoutines: records });
  await act(async () =>
    h.value.removeCompletedRoutine('same-routine', completedAt, 'first-device-session'),
  );
  assert.equal(
    h.value.completedRoutines.map((row) => row.sessionId).join(','),
    'second-device-session,third-device-session',
  );
  assert.equal(
    h.writes
      .at(-1)[1]
      .map((row) => row.sessionId)
      .join(','),
    'second-device-session,third-device-session',
  );
});

test('legacy session deletion uses the routine and completion time together', async (t) => {
  const completedAt = '2026-11-12T10:00:00.000Z';
  const records = [
    { id: 'legacy', completedAt },
    { id: 'other-legacy', completedAt },
    { id: 'legacy', completedAt: '2026-11-12T11:00:00.000Z' },
  ];
  const h = await mountRecords(t, 'Routine', { completedRoutines: records });
  await act(async () => h.value.removeCompletedRoutine('legacy', completedAt));
  assert.equal(h.value.completedRoutines.length, 2);
  assert.equal(h.value.completedRoutines[0].id, 'other-legacy');
  assert.equal(h.value.completedRoutines[1].completedAt, '2026-11-12T11:00:00.000Z');
});

async function mountWorkout(t, start) {
  const events = [];
  const routines = [{ id: 'timer', name: 'Timer', rounds: 1, workSec: 10, restSec: 0 }];
  let paused = false;
  let value;
  const timer = {
    session: null,
    reset() {},
    stop() {},
    start() {
      events.push(['start', paused]);
      return start(timer);
    },
  };
  const setSyncPaused = (next) => {
    paused = next;
    events.push(['sync', next]);
  };
  const silent = async () => {};
  const context = loadProvider('Workout', {
    useAccountData: () => ({ setSyncPaused }),
    useRoutineContext: () => ({ routines, addCompletedRoutine() {} }),
    usePlatformContext: () => ({}),
    useAppleMusicConnection: () => ({
      player: { isActive: () => false, registerBeforePlay: () => () => {} },
    }),
    useCountdownSoundPlayer: () => ({ stop: silent }),
    useAudioController: () => ({ handlePhaseChange() {}, stopMusic() {}, fetchPlayback: silent }),
    useTimerLogic: () => timer,
    useWorkoutCues: () => ({}),
    stopWorkoutCues: silent,
    stopCuePreview: silent,
    prepareWorkoutCues: silent,
    playWorkoutCue: silent,
    registerCueMusicSource: () => () => {},
    setTimeout() {},
    clearTimeout() {},
  });
  function Consumer() {
    value = context.read();
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(context.Provider, null, React.createElement(Consumer)));
  });
  t.after(async () => act(async () => root.unmount()));
  events.length = 0;
  return {
    get value() {
      return value;
    },
    get paused() {
      return paused;
    },
    events,
  };
}
test('Start reserves cloud replacement synchronously before the timer starts', async (t) => {
  const h = await mountWorkout(t, (timer) => {
    timer.session = {
      status: 'running',
      routine: normalizeRoutine({ id: 'timer' }),
      timeline: [{ phase: 'work', round: 1, durationSec: 10 }],
      index: 0,
      remainingMs: 10000,
    };
    return timer.session;
  });
  await act(async () => {
    assert.equal(h.value.beginSession(h.value.selectedRoutine), true);
    assert.equal(h.paused, true);
    assert.deepEqual(h.events.slice(0, 2), [
      ['sync', true],
      ['start', true],
    ]);
  });
});
test('stale and failed Start actions do not leave idle cloud replacement paused', async (t) => {
  const h = await mountWorkout(t, () => null);
  await act(async () => {
    assert.equal(h.value.beginSession({ ...h.value.selectedRoutine }), false);
    assert.deepEqual(h.events, []);
    assert.equal(h.value.beginSession(h.value.selectedRoutine), false);
    assert.equal(h.paused, false);
    assert.deepEqual(h.events, [
      ['sync', true],
      ['start', true],
      ['sync', false],
    ]);
  });
});
