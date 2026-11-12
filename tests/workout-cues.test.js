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
