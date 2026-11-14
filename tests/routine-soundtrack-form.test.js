import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { normalizeRoutine, validateRoutine } from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';
import { normalizeRoutineSoundtrack } from '../src/domain/routineSoundtrack.js';
import { resolveRoundAudio } from '../src/domain/audio.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(
  new URL('../src/screens/Routine/hooks/useRoutineForm.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const scope = {
  ...React,
  normalizeRoutine,
  validateRoutine,
  normalizeAlertConfig,
  normalizeRoutineSoundtrack,
  Alert: {
    alert: (title, message) => {
      throw new Error(`${title}: ${message}`);
    },
  },
};
new Script(`${source}\nglobalThis.hook = useRoutineForm;`).runInNewContext(scope);
const selection = (id = 'p.saved', extra = {}) => ({
  platform: 'appleMusic',
  kind: 'playlist',
  id,
  name: 'Saved music',
  artist: 'Curator',
  image: 'https://example.test/cover.jpg',
  shuffle: true,
  ...extra,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
async function mount(t, routine) {
  let form, root;
  const saved = [];
  function Harness({ routine }) {
    form = scope.hook({
      templateRoutine: routine,
      addRoutine: (value) => saved.push(value),
      updateRoutine: (value) => saved.push(value),
    });
    return null;
  }
  await act(async () => {
    root = create(React.createElement(Harness, { routine }));
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    get form() {
      return form;
    },
    saved,
    async load(next) {
      await act(async () => root.update(React.createElement(Harness, { routine: next })));
    },
  };
}

test('new routine soundtrack selection and shuffle save and reopen independently of round assignments', async (t) => {
  const h = await mount(t);
  assert.equal(h.form.soundtrack, null);
  await act(async () => {
    h.form.setName('New workout');
    h.form.setSoundtrack(selection('pl.catalog', { accessToken: 'never-save' }));
  });
  await act(async () => h.form.setSoundtrackShuffle(false));
  await act(async () => h.form.handleSaveRoutine());
  const saved = { ...h.saved[0], id: 'new' };
  assert.equal(saved.soundtrack.id, 'pl.catalog');
  assert.equal(saved.soundtrack.shuffle, false);
  assert.equal(JSON.stringify(saved).includes('never-save'), false);
  assert.equal(resolveRoundAudio(saved, 'work', 1), null);
  await h.load(saved);
  assert.deepEqual(plain(h.form.soundtrack), saved.soundtrack);
});

test('editing soundtrack preserves legacy timed music, per-round timings and Advanced settings', async (t) => {
  const original = normalizeRoutine({
    id: 'edit',
    name: 'Advanced',
    rounds: 2,
    workSec: 50,
    restSec: 12,
    workoutPlaylistId: 'legacy-list',
    restPlaylistId: 'legacy-rest',
    platform: 'spotify',
    preparationVolume: 30,
    workVolume: 75,
    restVolume: 45,
    countdownBeforeStartDuration: 8,
    endWorkSound: { uri: 'voices://gong' },
    audioAlerts: { enabled: false },
    roundsData: [
      { workSec: 35, restSec: 7, workSong: { uri: 'file:///owned.wav', platform: 'device' } },
      { workSec: 65, restSec: 0, workPlaylistId: 'explicit', workPlaylistPlatform: 'spotify' },
    ],
  });
  const h = await mount(t, original);
  assert.equal(h.form.soundtrack, null);
  await act(async () => h.form.setSoundtrack(selection()));
  await act(async () => h.form.handleSaveRoutine());
  const saved = h.saved[0];
  assert.equal(saved.soundtrack.id, 'p.saved');
  assert.equal(saved.workoutPlaylistId, original.workoutPlaylistId);
  assert.deepEqual(
    saved.roundsData.map(({ workSec, restSec }) => [workSec, restSec]),
    [
      [35, 7],
      [65, 0],
    ],
  );
  for (const [phase, round] of [
    ['work', 1],
    ['work', 2],
    ['rest', 1],
  ]) {
    const before = resolveRoundAudio(original, phase, round);
    const after = resolveRoundAudio(saved, phase, round);
    assert.equal(after.source.uri || after.playlistId, before.source.uri || before.playlistId);
  }
  for (const field of [
    'preparationVolume',
    'workVolume',
    'restVolume',
    'countdownBeforeStartDuration',
  ])
    assert.equal(saved[field], original[field]);
  assert.deepEqual(plain(saved.endWorkSound), original.endWorkSound);
  assert.deepEqual(plain(saved.audioAlerts), normalizeAlertConfig(original.audioAlerts));
});

test('explicit remove and invalid selections persist null while round edits cannot alter soundtrack', async (t) => {
  const h = await mount(
    t,
    normalizeRoutine({ id: 'clear', name: 'Clear', soundtrack: selection() }),
  );
  await act(async () => h.form.handleClearAll());
  assert.equal(h.form.soundtrack.id, 'p.saved', 'Legacy per-round clear is independent');
  await act(async () => h.form.removeSoundtrack());
  await act(async () => h.form.handleSaveRoutine());
  assert.equal(h.saved[0].soundtrack, null);
  await act(async () => h.form.setSoundtrack({ platform: 'device', kind: 'track', id: 'private' }));
  assert.equal(h.form.soundtrack, null);
  await act(async () => h.form.setSoundtrack(selection('i.library', { kind: 'track' })));
  await act(async () => h.form.setSoundtrackShuffle(true));
  assert.equal(h.form.soundtrack.shuffle, false);
});

test('routine switches, ID-less templates and return to new form do not leak soundtrack state', async (t) => {
  const first = normalizeRoutine({ id: 'first', name: 'First', soundtrack: selection('p.first') });
  const h = await mount(t, first);
  await act(async () => h.form.setSoundtrack(selection('p.unsaved')));
  await h.load({ ...first });
  assert.equal(h.form.soundtrack.id, 'p.unsaved', 'Same saved identity preserves unsaved edits');
  await h.load(normalizeRoutine({ id: 'second', name: 'Second' }));
  assert.equal(h.form.soundtrack, null);
  await h.load({ name: 'Template one', soundtrack: selection('p.template-one') });
  assert.equal(h.form.soundtrack.id, 'p.template-one');
  await h.load({ name: 'Template two', soundtrack: selection('p.template-two') });
  assert.equal(h.form.soundtrack.id, 'p.template-two');
  assert.equal(h.form.name, 'Template two (Copy)');
  await h.load(null);
  assert.equal(h.form.soundtrack, null);
  assert.equal(h.form.name, '');
});
