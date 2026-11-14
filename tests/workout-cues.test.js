import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAlertPreset, planSessionCues } from '../src/domain/alerts.js';
import { createSession, advanceSession } from '../src/domain/workout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../src/hooks/useWorkoutCues.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default function', 'function');
async function mount(t, initial, allowed) {
  const events = [];
  let stops = 0;
  const context = {
    ...React,
    planSessionCues,
    playWorkoutCue: async (event) => {
      events.push(event);
    },
    stopWorkoutCues: async () => {
      stops++;
    },
  };
  new Script(`${source}\nglobalThis.hook = useWorkoutCues;`).runInNewContext(context);
  function Harness({ session, allowed }) {
    context.hook(session, allowed);
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness, { session: initial, allowed }));
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    events,
    get stops() {
      return stops;
    },
    async update(session, allowed) {
      await act(async () => root.update(React.createElement(Harness, { session, allowed })));
    },
  };
}
for (const language of ['en-US', 'tr-TR']) {
  test(`Spotify playback ownership suppresses ${language} preparation, phase and finish cues`, async (t) => {
    const audioAlerts = { ...createAlertPreset('hiit'), language };
    const start = Date.now();
    const session = createSession(
      {
        id: 'spotify',
        rounds: 2,
        workSec: 5,
        restSec: 3,
        countdownBeforeStartDuration: 3,
        audioAlerts,
      },
      start,
    );
    const h = await mount(t, session, false);
    for (const elapsed of [1000, 2000, 3000, 5000, 8000, 9000, 11000, 13000, 16000])
      await h.update(advanceSession(session, start + elapsed), false);
    assert.equal(h.events.length, 0);
    assert.equal(h.stops, 1, 'suppression must not send a native stop on every timer tick');
  });
}
test('mixed-source cue playback resumes only when local playback is allowed again', async (t) => {
  const start = Date.now();
  const session = createSession(
    { id: 'mixed', rounds: 2, workSec: 5, restSec: 3, audioAlerts: createAlertPreset('beeps') },
    start,
  );
  const h = await mount(t, session, true);
  assert.equal(h.events[0].signalKey, 'start');
  await h.update(advanceSession(session, start + 5000), false);
  await h.update(advanceSession(session, start + 7000), false);
  assert.equal(h.events.length, 1);
  await h.update(advanceSession(session, start + 8100), true);
  assert.equal(h.events.length, 2);
  assert.equal(h.events[1].signalKey, 'work');
  assert.equal(
    h.events.some((event) => event.signalKey === 'rest'),
    false,
  );
});

test('Advanced ten-second countdown and selected transition sound remain per routine', async (t) => {
  const start = Date.now();
  const session = createSession(
    {
      id: 'custom-alerts',
      rounds: 2,
      workSec: 12,
      restSec: 4,
      audioAlerts: {
        enabled: true,
        volume: 35,
        countdown: { mode: 'beep', seconds: 10, preparation: false, work: true, rest: false },
        signals: {
          start: null,
          rest: { uri: 'file:///chosen-rest.wav', duration: 1.4 },
          work: null,
          finish: null,
        },
      },
    },
    start,
  );
  const h = await mount(t, session, true);
  for (let elapsed = 2000; elapsed <= 12000; elapsed += 1000)
    await h.update(advanceSession(session, start + elapsed), true);
  assert.deepEqual(
    h.events.filter((event) => event.kind === 'count').map((event) => event.number),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  );
  const transition = h.events.filter((event) => event.kind === 'signal');
  assert.equal(transition.length, 1);
  assert.equal(transition[0].sound.uri, 'file:///chosen-rest.wav');
  assert.equal(transition[0].volume, 35);
  await h.update(advanceSession(session, start + 13000), true);
  assert.equal(h.events.length, 11, 'disabled Rest countdown emits nothing');
});

test('None signals and disabled countdown produce no cue request', async (t) => {
  const start = Date.now();
  const session = createSession(
    {
      id: 'no-alerts',
      rounds: 1,
      workSec: 5,
      audioAlerts: {
        enabled: true,
        countdown: { mode: 'off' },
        signals: { start: null, rest: null, work: null, finish: null },
      },
    },
    start,
  );
  const h = await mount(t, session, true);
  for (const elapsed of [1000, 2000, 3000, 4000, 5000])
    await h.update(advanceSession(session, start + elapsed), true);
  assert.equal(h.events.length, 0);
});

test('a selected natural finish cue permits independent music to continue afterward', async (t) => {
  const start = Date.now();
  const session = createSession(
    {
      id: 'finish-alert',
      rounds: 1,
      workSec: 3,
      audioAlerts: {
        enabled: true,
        countdown: { mode: 'off' },
        signals: {
          start: null,
          rest: null,
          work: null,
          finish: { uri: 'file:///selected-finish.wav', duration: 0.8 },
        },
      },
    },
    start,
  );
  const h = await mount(t, session, true);
  await h.update(advanceSession(session, start + 3000), true);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].signalKey, 'finish');
  assert.equal(h.events[0].sound.uri, 'file:///selected-finish.wav');
  assert.equal(h.events[0].resumeMusic, true);
});
