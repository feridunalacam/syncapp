import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline,
  getRoutineDuration,
  normalizeRoutine,
  validateRoutine,
} from '../src/domain/routines.js';
import {
  createSession,
  advanceSession,
  pauseSession,
  resumeSession,
  stopSession,
  skipSession,
  sessionToLog,
} from '../src/domain/workout.js';
const routine = {
  id: 'test',
  name: 'Intervals',
  rounds: 2,
  workSec: 10,
  restSec: 5,
  roundsData: [
    { workSec: 10, restSec: 5 },
    { workSec: 20, restSec: 0 },
  ],
};
test('per-round duration and no trailing rest form one plan', () => {
  assert.deepEqual(
    buildTimeline(routine).map((p) => p.durationSec),
    [10, 5, 20],
  );
  assert.equal(getRoutineDuration(routine), 35);
});
test('zero rest is preserved', () => {
  assert.deepEqual(
    buildTimeline({ ...routine, restSec: 0, roundsData: [] }).map((p) => p.phase),
    ['work', 'work'],
  );
});
test('background catch-up crosses multiple phases', () => {
  const s = advanceSession(createSession(routine, 1000), 27000);
  assert.equal(s.index, 2);
  assert.equal(s.remainingMs, 9000);
  assert.equal(s.roundsCompleted, 1);
});
test('pause excludes paused time and preserves fractions', () => {
  let s = pauseSession(createSession(routine, 1000), 2250);
  s = resumeSession(s, 202250);
  s = advanceSession(s, 203000);
  assert.equal(s.elapsedMs, 2000);
  assert.equal(s.remainingMs, 8000);
});
test('completion is capped to plan and emitted only once', () => {
  let s = advanceSession(createSession(routine, 1000), 100000);
  assert.equal(s.elapsedMs, 35000);
  assert.equal(s.endedAt, 36000);
  assert.equal(s.roundsCompleted, 2);
  assert.equal(advanceSession(s, 200000), s);
});
test('idle stop cannot create a history item', () => {
  assert.equal(stopSession(null, 1000), null);
  assert.equal(sessionToLog(null), null);
});
test('aborted session records only actual active time', () => {
  const s = stopSession(createSession(routine, 1000), 6000);
  assert.equal(sessionToLog(s).actualDurationSec, 5);
  assert.equal(sessionToLog(s).roundsCompleted, 0);
});
test('cancelled preparation does not create a workout', () => {
  const s = stopSession(
    createSession({ ...routine, countdownBeforeStartDuration: 10 }, 1000),
    2000,
  );
  assert.equal(sessionToLog(s), null);
});
test('skip while paused preserves paused state', () => {
  let s = pauseSession(createSession(routine, 1000), 2000);
  s = skipSession(s, 1, 4000);
  assert.equal(s.status, 'paused');
  assert.equal(s.index, 1);
  assert.equal(s.elapsedMs, 1000);
});
test('editing a routine cannot mutate an active session', () => {
  const input = structuredClone(routine);
  const s = createSession(input, 0);
  input.roundsData[0].workSec = 999;
  assert.equal(s.routine.roundsData[0].workSec, 10);
});
test('invalid form duration is rejected', () =>
  assert.ok(validateRoutine({ ...routine, workSec: 0 })));
test('legacy data normalization retains additional metadata', () => {
  const r = normalizeRoutine({ ...routine, customField: 'kept' });
  assert.equal(r.customField, 'kept');
  assert.equal(r.roundsData[1].restSec, 0);
});
test('replaying a round does not count that round twice', () => {
  let s = advanceSession(createSession(routine, 0), 10000);
  s = skipSession(s, -1, 10000);
  s = advanceSession(s, 20000);
  assert.equal(s.roundsCompleted, 1);
  s = advanceSession(s, 45000);
  assert.equal(s.roundsCompleted, 2);
});
test('ending a paused session does not add time', () => {
  let s = pauseSession(createSession(routine, 0), 4000);
  s = stopSession(s, 60000);
  assert.equal(sessionToLog(s).actualDurationSec, 4);
});
test('skipping the final round does not claim it was completed', () => {
  let s = advanceSession(createSession(routine, 0), 15000);
  s = skipSession(s, 1, 16000);
  assert.equal(s.status, 'completed');
  assert.equal(sessionToLog(s).roundsCompleted, 1);
  assert.equal(sessionToLog(s).actualDurationSec, 16);
});
