import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import * as domain from '../src/domain/workout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../src/screens/Home/TimerLogic.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/^export /gm, '');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function harness(t, options = {}) {
  let now = 1000;
  let timer;
  let tick;
  let appState;
  let deadline;
  const phases = [];
  const states = [];
  const context = {
    ...React,
    ...domain,
    Date: { now: () => now },
    AppState: {
      addEventListener(type, listener) {
        appState = listener;
        return {
          remove() {
            appState = null;
          },
        };
      },
    },
    setInterval(callback) {
      tick = callback;
      return 1;
    },
    clearInterval() {
      tick = null;
    },
    setTimeout(callback) {
      deadline = callback;
      return 1;
    },
    clearTimeout() {
      deadline = null;
    },
  };
  new Script(`${source}\nglobalThis.hook = useTimerLogic;`).runInNewContext(context);
  function Harness() {
    timer = context.hook({
      routine: { id: 'test', name: 'Test', rounds: 2, workSec: 10, restSec: 5 },
      requiresAudio: () => options.audio !== false,
      onPhaseChange: (...args) => {
        phases.push(args);
        return options.play?.(...args);
      },
      onResumeAudio: options.resume,
      onStateChange: (s) => {
        states.push(s?.status || 'reset');
      },
      onComplete: options.complete,
    });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => {
    await act(async () => root.unmount());
  });
  return {
    get timer() {
      return timer;
    },
    phases,
    states,
    async at(time) {
      now = time;
      await act(async () => tick?.());
    },
    async app(state) {
      await act(async () => appState?.(state));
    },
    async timeout() {
      await act(async () => deadline?.());
    },
  };
}

test('a slow song does not consume the interval or create an arbitrary extra second', async (t) => {
  const load = deferred();
  const h = await harness(t, { play: () => load.promise });
  await act(async () => h.timer.start());
  assert.equal(h.timer.session.audioPending, true);
  await h.at(3500);
  assert.equal(h.timer.session.remainingMs, 10000);
  assert.equal(h.timer.session.elapsedMs, 0);
  await act(async () => load.resolve({ success: true }));
  assert.equal(h.timer.session.audioPending, false);
  await h.at(4000);
  assert.equal(h.timer.session.remainingMs, 9500);
});

test('silent intervals start immediately without a readiness hold', async (t) => {
  const h = await harness(t, { audio: false });
  await act(async () => h.timer.start());
  await h.at(1250);
  assert.equal(h.timer.session.remainingMs, 9750);
});

test('pausing during loading invalidates the pending automatic start', async (t) => {
  const load = deferred();
  const h = await harness(t, { play: () => load.promise });
  await act(async () => h.timer.start());
  await act(async () => h.timer.pause());
  await act(async () => load.resolve({ success: true }));
  assert.equal(h.timer.session.status, 'paused');
  assert.equal(h.timer.session.remainingMs, 10000);
  assert.deepEqual(h.states, ['running', 'paused']);
});

test('a new interval waits for its own audio and stale loads cannot release it', async (t) => {
  const first = deferred();
  const second = deferred();
  const h = await harness(t, {
    play: (phase) => (phase === 'work' ? first.promise : second.promise),
  });
  await act(async () => h.timer.start());
  await act(async () => h.timer.skip(1));
  await act(async () => first.resolve({ success: true }));
  assert.equal(h.timer.session.index, 1);
  assert.equal(h.timer.session.audioPending, true);
  await act(async () => second.resolve({ success: true }));
  assert.equal(h.timer.session.audioPending, false);
  assert.equal(h.timer.session.remainingMs, 5000);
});

test('playback failure pauses the session and successful retry releases it', async (t) => {
  let fail = true;
  const h = await harness(t, {
    play: () => (fail ? { success: false, error: 'Offline' } : { success: true }),
  });
  await act(async () => h.timer.start());
  assert.equal(h.timer.session.status, 'paused');
  assert.equal(h.timer.syncError, 'Offline');
  fail = false;
  await act(async () => h.timer.resume());
  assert.equal(h.timer.session.status, 'running');
  assert.equal(h.timer.session.audioPending, false);
  assert.equal(h.timer.syncError, null);
});

test('a stuck request times out into pause and cannot later restart the session', async (t) => {
  const load = deferred();
  const h = await harness(t, { play: () => load.promise });
  await act(async () => h.timer.start());
  await h.timeout();
  assert.equal(h.timer.session.status, 'paused');
  assert.match(h.timer.syncError, /taking too long/);
  await act(async () => load.resolve({ success: true }));
  assert.equal(h.timer.session.status, 'paused');
});

test('locking or leaving the app pauses playback ownership and returning does not resume', async (t) => {
  const h = await harness(t);
  await act(async () => h.timer.start());
  await h.at(2200);
  await h.app('inactive');
  assert.equal(h.timer.session.status, 'paused');
  assert.equal(h.timer.session.remainingMs, 8800);
  await h.app('active');
  assert.equal(h.timer.session.status, 'paused');
  assert.deepEqual(h.states, ['running', 'paused']);
});

test('resume waits for playback while preserving a partially completed interval', async (t) => {
  const load = deferred();
  const h = await harness(t, { resume: () => load.promise });
  await act(async () => h.timer.start());
  await h.at(2500);
  await act(async () => h.timer.pause());
  await act(async () => h.timer.resume());
  await h.at(5000);
  assert.equal(h.timer.session.remainingMs, 8500);
  await act(async () => load.resolve({ success: true }));
  await h.at(5500);
  assert.equal(h.timer.session.remainingMs, 8000);
});

test('reset while loading cannot resurrect a cleared workout', async (t) => {
  const load = deferred();
  const h = await harness(t, { play: () => load.promise });
  await act(async () => h.timer.start());
  await act(async () => h.timer.reset());
  await act(async () => load.resolve({ success: true }));
  assert.equal(h.timer.session, null);
  assert.deepEqual(h.states, ['running', 'reset']);
});

test('automatic completion and abort each notify the shared playback lifecycle', async (t) => {
  let completions = 0;
  const h = await harness(t, { audio: false, complete: () => completions++ });
  await act(async () => h.timer.start());
  await h.at(26000);
  assert.equal(h.timer.session.status, 'completed');
  assert.equal(h.states.at(-1), 'completed');
  assert.equal(completions, 1);
  await act(async () => h.timer.start());
  await act(async () => h.timer.stop());
  assert.equal(h.states.at(-1), 'aborted');
  assert.equal(completions, 1);
});
