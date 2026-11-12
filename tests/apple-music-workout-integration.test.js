import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import * as workoutDomain from '../src/domain/workout.js';
import { normalizeRoutine, buildTimeline } from '../src/domain/routines.js';
import { resolveRoundAudio } from '../src/domain/audio.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(path, replacements, output) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(
    /^import[\s\S]*?from ['"][^'"]+['"];?\n/gm,
    '',
  );
  for (const [from, to] of replacements) source = source.replace(from, to);
  return transformSync(`${source}\n${output}`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
}
const timerCode = compile(
  '../src/screens/Home/TimerLogic.js',
  [['export const useTimerLogic', 'const useTimerLogic']],
  'globalThis.timerHook = useTimerLogic;',
);
const workoutCode = compile(
  '../src/context/WorkoutContext.js',
  [
    ['export const WorkoutProvider', 'const WorkoutProvider'],
    ['export const useWorkout', 'const useWorkout'],
  ],
  'globalThis.Provider = WorkoutProvider; globalThis.readWorkout = useWorkout;',
);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function mount(t, options = {}) {
  const events = [];
  const intervals = new Map();
  const timeouts = new Map();
  const listeners = new Set();
  let timerId = 0;
  let now = 100000;
  const routine = {
    id: 'workout',
    name: 'Companion session',
    rounds: 2,
    workSec: 5,
    restSec: 3,
    countdownBeforeStartDuration: 2,
    roundsData: [
      { workSong: { uri: 'file:///work-one.wav' }, restSong: { uri: 'file:///rest.wav' } },
      { workSong: { uri: 'file:///work-two.wav' } },
    ],
  };
  const scene = { companionActive: options.active ?? true, workout: null, beforePlay: null };
  const audio = {
    localCuesAllowed: true,
    isMusicPlaying: false,
    audioError: null,
    handlePhaseChange: (...args) => {
      events.push(['phase', ...args]);
      return options.pendingPhase?.promise || { success: true };
    },
    pauseMusic: async () => {
      events.push('pause-timed');
      return { success: true };
    },
    resumeMusic: async () => {
      events.push('resume-timed');
      return { success: true };
    },
    stopMusic: async () => {
      events.push('stop-timed');
      if (options.pendingPhase) options.pendingPhase.resolve({ success: true, cancelled: true });
      return { success: true };
    },
    fetchPlayback: async () => {
      events.push('poll-timed');
    },
    playCountdownSound: async () => {
      events.push('cue-countdown');
    },
  };
  const player = {
    isActive: () => scene.companionActive,
    registerBeforePlay(callback) {
      scene.beforePlay = callback;
      return () => {
        scene.beforePlay = null;
      };
    },
  };
  const context = {
    ...React,
    React,
    ...workoutDomain,
    normalizeRoutine,
    buildTimeline,
    resolveRoundAudio,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    AppState: {
      addEventListener(_type, callback) {
        listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
    },
    setInterval(callback) {
      const id = ++timerId;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      const id = ++timerId;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    useAccountData: () => ({ setSyncPaused: () => {} }),
    useRoutineContext: () => ({
      routines: [routine],
      addCompletedRoutine: (log) => events.push(['log', log]),
    }),
    usePlatformContext: () => ({ selectedPlatform: 'device' }),
    useAppleMusicConnection: () => ({ player }),
    useCountdownSoundPlayer: () => ({}),
    useAudioController: (configuration) => {
      scene.audioConfiguration = configuration;
      return audio;
    },
    useWorkoutCues: (_session, allowed) => {
      scene.cuesAllowed = allowed;
      return { alertError: null };
    },
    stopWorkoutCues: async () => {
      events.push('stop-cues');
    },
    stopCuePreview: async () => {
      events.push('stop-preview');
    },
    prepareWorkoutCues: async () => {},
  };
  new Script(timerCode).runInNewContext(context);
  context.useTimerLogic = context.timerHook;
  new Script(workoutCode).runInNewContext(context);
  function Consumer() {
    scene.workout = context.readWorkout();
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(context.Provider, null, React.createElement(Consumer)));
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    scene,
    events,
    audio,
    async action(name) {
      await act(async () => {
        await scene.workout[name]();
      });
    },
    async tick(ms) {
      await act(async () => {
        now += ms;
        [...intervals.values()].forEach((callback) => callback());
      });
    },
    async background() {
      await act(async () => {
        [...listeners].forEach((callback) => callback('background'));
      });
    },
    async handover() {
      await act(async () => {
        scene.companionActive = true; // Core reserves ownership synchronously before beforePlay.
        await scene.beforePlay();
      });
    },
  };
}

test('companion songs survive preparation, work/rest, pause, resume, skip, background and abort', async (t) => {
  const h = await mount(t);
  await h.action('toggle');
  assert.equal(h.scene.workout.currentPhase, 'beforeStart');
  assert.equal(h.scene.workout.isAudioSyncing, false);
  assert.equal(h.scene.cuesAllowed, false);
  await h.tick(2000);
  assert.equal(h.scene.workout.currentPhase, 'work');
  await h.action('toggle');
  assert.equal(h.scene.workout.isPaused, true);
  await h.tick(1000);
  await h.action('toggle');
  await h.action('skipForward');
  assert.equal(h.scene.workout.currentPhase, 'rest');
  await h.action('skipBackward');
  assert.equal(h.scene.workout.currentPhase, 'work');
  await h.background();
  assert.equal(h.scene.workout.isPaused, true);
  await h.action('stop');
  assert.equal(h.scene.workout.session.status, 'aborted');
  assert.deepEqual(
    h.events.filter(
      (event) =>
        ['pause-timed', 'resume-timed', 'stop-timed', 'poll-timed', 'cue-countdown'].includes(
          event,
        ) ||
        (Array.isArray(event) && event[0] === 'phase'),
    ),
    [],
  );
});

test('completing a companion workout records the full session without controlling its queue', async (t) => {
  const h = await mount(t);
  await h.action('toggle');
  await h.tick(2000);
  await h.tick(5000);
  await h.tick(3000);
  await h.tick(5000);
  assert.equal(h.scene.workout.session.status, 'completed');
  assert.equal(h.events.filter((event) => Array.isArray(event) && event[0] === 'log').length, 1);
  assert.equal(h.events.includes('stop-timed'), false);
  assert.equal(
    h.events.some((event) => Array.isArray(event) && event[0] === 'phase'),
    false,
  );
});

test('explicit music handover retires pending timed readiness without pausing the workout', async (t) => {
  const pendingPhase = deferred();
  const h = await mount(t, { active: false, pendingPhase });
  await h.action('toggle');
  assert.equal(h.scene.workout.isAudioSyncing, true);
  await h.handover();
  assert.equal(h.events.filter((event) => event === 'stop-timed').length, 1);
  assert.equal(h.scene.workout.session.status, 'running');
  assert.equal(h.scene.workout.isAudioSyncing, false);
  assert.equal(h.scene.workout.audioError || null, null);
  await h.tick(2000);
  assert.equal(h.scene.workout.currentPhase, 'work');
  await act(async () => h.scene.audioConfiguration.onPlaybackInterrupted('retired native request'));
  assert.equal(h.scene.workout.session.status, 'running');
});

test('a failed timed source still pauses readiness when there is no companion handover', async (t) => {
  const pendingPhase = deferred();
  const h = await mount(t, { active: false, pendingPhase });
  await h.action('toggle');
  await act(async () => pendingPhase.resolve({ success: false, error: 'Source unavailable' }));
  assert.equal(h.scene.workout.isPaused, true);
  assert.equal(h.scene.workout.audioError, 'Source unavailable');
});
