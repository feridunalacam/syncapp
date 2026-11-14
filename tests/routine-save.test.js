import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { transformSync } from '@babel/core';
import { createAccountStore } from '../src/lib/accountStore.js';
import { normalizeRoutine, validateRoutine } from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';
import { normalizeRoutineSoundtrack } from '../src/domain/routineSoundtrack.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise(setImmediate);
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function load(path, expose, values) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export /gm, '');
  const context = {
    ...React,
    React,
    normalizeRoutine,
    validateRoutine,
    normalizeAlertConfig,
    normalizeRoutineSoundtrack,
    STORAGE_KEYS: { ROUTINES: 'routines', COMPLETED_ROUTINES: 'completedRoutines' },
    Alert: {
      alert: (title, message) => {
        throw new Error(`${title}: ${message}`);
      },
    },
    ...values,
  };
  const code = transformSync(`${source}\n${expose}`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  new Script(code).runInNewContext(context);
  return context;
}
function account(id) {
  const values = new Map();
  const base = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
    multiRemove: async (keys) => keys.forEach((key) => values.delete(key)),
  };
  const store = createAccountStore(base, id, () => {}, { namespace: `review:1:${id}` });
  const controls = { gate: null, failure: null, writes: 0 };
  const storage = {
    ...store,
    async setJSON(key, value) {
      if (key === 'routines') {
        controls.writes++;
        if (controls.gate) await controls.gate.promise;
        if (controls.failure === 'throw') throw new Error('Storage failed');
        if (controls.failure === 'false') return false;
      }
      return store.setJSON(key, value);
    },
  };
  return { storage, store, controls };
}
async function mount(t, initial, templateRoutine = null) {
  let current = initial;
  let form, routines;
  let saved = 0;
  let focused = true;
  const provider = load(
    'context/RoutineContext.js',
    'globalThis.Provider = RoutineProvider; globalThis.read = useRoutineContext;',
    {
      useAccountData: () => ({ storage: current.storage }),
    },
  );
  const hook = load(
    'screens/Routine/hooks/useRoutineForm.js',
    'globalThis.hook = useRoutineForm;',
    {},
  );
  function Editor() {
    routines = provider.read();
    form = hook.hook({
      templateRoutine,
      addRoutine: routines.addRoutine,
      updateRoutine: routines.updateRoutine,
      saveOwner: routines.saveOwner,
      isCurrent: () => focused,
      onSave: () => saved++,
    });
    return null;
  }
  const tree = () => React.createElement(provider.Provider, null, React.createElement(Editor));
  let root;
  await act(async () => {
    root = create(tree());
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    get form() {
      return form;
    },
    get routines() {
      return routines;
    },
    get saved() {
      return saved;
    },
    async name(name) {
      await act(async () => form.setName(name));
    },
    async switchAccount(next) {
      current = next;
      await act(async () => root.update(tree()));
    },
    async blur() {
      focused = false;
      await act(async () => form.invalidateSave());
    },
    focus() {
      focused = true;
    },
  };
}

test('first Create waits for same-namespace durable acknowledgement before leaving the editor', async (t) => {
  const a = account('first-create');
  const h = await mount(t, a);
  await h.name('First saved routine');
  a.controls.gate = deferred();
  let pending;
  await act(async () => {
    pending = h.form.handleSaveRoutine();
    await settle();
  });
  assert.equal(h.form.saving, true);
  assert.equal(h.saved, 0);
  assert.equal(h.routines.routines.length, 0);
  assert.equal(await a.store.getJSON('routines', null), null);
  await act(async () => {
    a.controls.gate.resolve();
    assert.equal(await pending, true);
  });
  assert.equal(h.saved, 1);
  assert.equal(h.form.saving, false);
  assert.equal(h.routines.routines[0].name, 'First saved routine');
  assert.equal((await a.store.getJSON('routines'))[0].name, 'First saved routine');
  assert.equal(a.controls.writes, 1, 'No routine autosave races the acknowledged write');
});

for (const failure of ['false', 'throw']) {
  test(`a ${failure} persistence failure retains the draft and retry saves once`, async (t) => {
    const a = account(`failure-${failure}`);
    const h = await mount(t, a);
    await h.name('Draft survives');
    a.controls.failure = failure;
    await act(async () => assert.equal(await h.form.handleSaveRoutine(), false));
    assert.equal(h.saved, 0);
    assert.equal(h.form.name, 'Draft survives');
    assert.match(h.form.saveError, /draft.*Try Save again/);
    assert.equal(h.routines.routines.length, 0);
    assert.equal(await a.store.getJSON('routines', null), null);
    a.controls.failure = null;
    await act(async () => assert.equal(await h.form.handleSaveRoutine(), true));
    assert.equal(h.saved, 1);
    assert.equal((await a.store.getJSON('routines')).length, 1);
    assert.equal(h.form.saveError, null);
  });
}

test('failed Update keeps the previous durable routine and the edited draft', async (t) => {
  const a = account('update');
  const original = normalizeRoutine({ id: 'existing', name: 'Original', rounds: 3 });
  await a.store.setJSON('routines', [original]);
  const h = await mount(t, a, original);
  await h.name('Edited draft');
  a.controls.failure = 'false';
  await act(async () => h.form.handleSaveRoutine());
  assert.equal(h.saved, 0);
  assert.equal(h.form.name, 'Edited draft');
  assert.equal(h.routines.routines[0].name, 'Original');
  assert.equal((await a.store.getJSON('routines'))[0].name, 'Original');
});

test('account switch fences pending Save completion, stale callbacks and the old draft', async (t) => {
  const a = account('owner-a');
  const b = account('owner-b');
  const h = await mount(t, a);
  await h.name('Only belongs to A');
  const staleAdd = h.routines.addRoutine;
  a.controls.gate = deferred();
  let pending;
  await act(async () => {
    pending = h.form.handleSaveRoutine();
    await settle();
  });
  await h.switchAccount(b);
  assert.equal(h.form.name, '', 'The previous owner draft cannot be submitted for the new owner');
  await act(async () => {
    a.controls.gate.resolve();
    assert.equal(await pending, false);
  });
  assert.equal(h.saved, 0);
  assert.equal(h.routines.routines.length, 0);
  assert.equal(await b.store.getJSON('routines', null), null);
  assert.equal(b.controls.writes, 0);
  await assert.rejects(staleAdd({ name: 'Stale callback' }), /no longer current/);
  assert.equal((await a.store.getJSON('routines'))[0].name, 'Only belongs to A');
});

test('blur invalidates pending navigation even if the same editor is focused again before acknowledgement', async (t) => {
  const a = account('blur');
  const h = await mount(t, a);
  await h.name('Retained on this account');
  a.controls.gate = deferred();
  let pending;
  await act(async () => {
    pending = h.form.handleSaveRoutine();
    await settle();
  });
  await h.blur();
  h.focus();
  await act(async () => {
    a.controls.gate.resolve();
    assert.equal(await pending, false);
  });
  assert.equal(h.saved, 0);
  assert.equal(h.form.saving, false);
  assert.equal(h.form.name, 'Retained on this account');
  assert.equal((await a.store.getJSON('routines'))[0].name, 'Retained on this account');
});

test('queued routine mutations preserve an acknowledged Save without a later stale autosave', async (t) => {
  const a = account('queue');
  const h = await mount(t, a);
  a.controls.gate = deferred();
  let first, second;
  await act(async () => {
    first = h.routines.addRoutine({ name: 'One' });
    second = h.routines.addRoutine({ name: 'Two' });
    await settle();
  });
  await act(async () => {
    a.controls.gate.resolve();
    await Promise.all([first, second]);
  });
  assert.deepEqual(plain(h.routines.routines.map((row) => row.name)), ['One', 'Two']);
  await act(async () => h.routines.reorderRoutines(1, 0));
  assert.deepEqual(
    (await a.store.getJSON('routines')).map((row) => row.name),
    ['Two', 'One'],
  );
  assert.equal(a.controls.writes, 3);
});
