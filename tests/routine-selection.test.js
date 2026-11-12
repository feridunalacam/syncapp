import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutineSelectionController } from '../src/navigation/routineSelection.js';

function harness({ active = false, selectedId = 'first' } = {}) {
  const state = { active, selectedId, routines: [{ id: 'first' }, { id: 'second' }] };
  const selections = [];
  const confirmations = [];
  let missing = 0;
  let closed = 0;
  const controller = createRoutineSelectionController({
    getState: () => state,
    selectRoutine: (id) => selections.push(id),
    confirmSwitch: (onConfirm) => confirmations.push(onConfirm),
    onMissing: () => missing++,
    onSelected: () => closed++,
  });
  return {
    state,
    controller,
    selections,
    confirmations,
    missing: () => missing,
    closed: () => closed,
  };
}

test('an idle Timer selects a valid incoming routine without starting a session', () => {
  const app = harness();
  app.controller.request('second');
  assert.deepEqual(app.selections, ['second']);
  assert.equal(app.confirmations.length, 0);
  assert.equal(app.closed(), 1);
});

test('incoming navigation waits for confirmation before replacing an active session', () => {
  const app = harness({ active: true });
  app.controller.request('second');
  assert.deepEqual(app.selections, []);
  assert.equal(app.closed(), 0);
  assert.equal(app.confirmations.length, 1);
  app.confirmations[0]();
  app.confirmations[0]();
  assert.deepEqual(app.selections, ['second'], 'A confirmation is consumed only once');
  assert.equal(app.closed(), 1);
});

test('selecting the active routine closes the picker without resetting workout progress', () => {
  const app = harness({ active: true });
  app.controller.request('first');
  assert.deepEqual(app.selections, []);
  assert.equal(app.confirmations.length, 0);
  assert.equal(app.closed(), 1);
});

test('a missing incoming routine cannot end the active session', () => {
  const app = harness({ active: true });
  app.controller.request('deleted');
  assert.deepEqual(app.selections, []);
  assert.equal(app.confirmations.length, 0);
  assert.equal(app.missing(), 1);
});

test('a newer selection retires any earlier confirmation callback', () => {
  const app = harness({ active: true });
  app.controller.request('second');
  app.controller.request('first');
  app.confirmations[0]();
  assert.deepEqual(app.selections, []);
  assert.equal(app.closed(), 1);
});

test('a routine removed while its dialog is open is checked again before selection', () => {
  const app = harness({ active: true });
  app.controller.request('second');
  app.state.routines = [{ id: 'first' }];
  app.confirmations[0]();
  assert.deepEqual(app.selections, []);
  assert.equal(app.missing(), 1);
});

test('an unmounted account ignores its old native confirmation', () => {
  const app = harness({ active: true });
  app.controller.request('second');
  app.controller.dispose();
  app.confirmations[0]();
  app.controller.request('first');
  assert.deepEqual(app.selections, []);
  assert.equal(app.closed(), 0);
});
