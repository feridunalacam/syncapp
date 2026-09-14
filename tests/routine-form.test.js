import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { normalizeRoutine, validateRoutine } from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const body = readFileSync(
  new URL('../src/screens/Routine/hooks/useRoutineForm.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const context = {
  ...React,
  normalizeRoutine,
  validateRoutine,
  normalizeAlertConfig,
  Alert: {
    alert(title, message) {
      throw new Error(`${title}: ${message}`);
    },
  },
};
new Script(`${body}\nglobalThis.hook = useRoutineForm;`).runInNewContext(context);

test('editor saves preparation and Work volumes and restores them when reopened', async () => {
  let form;
  let saved;
  let root;
  const template = normalizeRoutine({ id: 'routine', name: 'Workout', rounds: 1 });
  function Harness({ routine }) {
    form = context.hook({
      templateRoutine: routine,
      updateRoutine(value) {
        saved = value;
      },
    });
    return null;
  }
  await act(async () => {
    root = create(React.createElement(Harness, { routine: template }));
  });
  try {
    assert.equal(form.preparationVolume, 50);
    assert.equal(form.workVolume, 100);
    await act(async () => {
      form.setPreparationVolume(30);
      form.setWorkVolume(80);
      form.setCountdownBeforeStartSec(5);
    });
    await act(async () => form.handleSaveRoutine());
    assert.equal(saved.preparationVolume, 30);
    assert.equal(saved.workVolume, 80);
    assert.equal(saved.countdownBeforeStartDuration, 5);
    await act(async () => root.unmount());
    await act(async () => {
      root = create(React.createElement(Harness, { routine: saved }));
    });
    assert.equal(form.preparationVolume, 30);
    assert.equal(form.workVolume, 80);
    assert.equal(form.countdownBeforeStartSec, 5);
  } finally {
    await act(async () => root.unmount());
  }
});
