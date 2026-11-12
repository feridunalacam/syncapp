import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { normalizeRoutine, validateRoutine } from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';
import { resolveRoundAudio } from '../src/domain/audio.js';

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

test('legacy mixed playlists stay visible and playable while a removed round stays silent', async (t) => {
  let form;
  let saved;
  const template = normalizeRoutine({
    id: 'legacy',
    name: 'Mixed legacy music',
    rounds: 3,
    workoutPlaylistId: 'work-fallback',
    restPlaylistId: 'rest-fallback',
    platform: 'spotify',
    roundsData: [
      { workSong: { uri: 'file:///local.mp3', platform: 'device' } },
      { restPlaylistId: 'round-rest', restPlaylistPlatform: 'spotify' },
      {},
    ],
  });
  function Harness({ routine }) {
    form = context.hook({ templateRoutine: routine, updateRoutine: (value) => (saved = value) });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness, { routine: template }));
  });
  t.after(async () => act(async () => root.unmount()));
  assert.equal(form.roundWorkSongs[1].uri, 'file:///local.mp3');
  assert.equal(form.roundWorkPlaylists[2].id, 'work-fallback');
  assert.equal(form.roundRestPlaylists[1].id, 'rest-fallback');
  assert.equal(form.roundRestPlaylists[2].id, 'round-rest');
  await act(async () => form.handleSaveRoutine());
  for (const phase of ['work', 'rest', 'beforeStart']) {
    for (const round of phase === 'beforeStart' ? [0] : [1, 2, 3]) {
      const before = resolveRoundAudio(template, phase, round, 'device');
      const after = resolveRoundAudio(saved, phase, round, 'device');
      assert.equal(after.platform, before.platform);
      assert.equal(after.kind, before.kind);
      assert.equal(
        after.kind === 'track' ? after.source.uri : after.playlistId,
        before.kind === 'track' ? before.source.uri : before.playlistId,
      );
    }
  }
  assert.equal(saved.workoutPlaylistId, 'work-fallback');
  assert.equal(saved.restPlaylistId, 'rest-fallback');
  await act(async () => {
    form.handleRemoveWorkMusic(2);
    form.handleRemoveRestMusic(1);
  });
  await act(async () => form.handleSaveRoutine());
  assert.equal(resolveRoundAudio(saved, 'work', 2), null);
  assert.equal(resolveRoundAudio(saved, 'rest', 1), null);
  assert.equal(resolveRoundAudio(saved, 'work', 3).playlistId, 'work-fallback');
  await act(async () => root.unmount());
  await act(async () => {
    root = create(React.createElement(Harness, { routine: saved }));
  });
  assert.equal(form.roundWorkPlaylists[2], undefined);
  assert.equal(form.roundRestPlaylists[1], undefined);
  await act(async () => form.handleAddRound());
  await act(async () => form.handleSaveRoutine());
  assert.equal(resolveRoundAudio(saved, 'work', 4), null);
});

test('shuffling replaces old round playlists without leaving hidden fallback music', async (t) => {
  let form;
  let saved;
  const template = normalizeRoutine({
    id: 'shuffle',
    name: 'Shuffle',
    rounds: 2,
    roundsData: [{ workPlaylistId: 'old-work', restPlaylistId: 'old-rest' }, {}],
  });
  function Harness() {
    form = context.hook({ templateRoutine: template, updateRoutine: (value) => (saved = value) });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => act(async () => root.unmount()));
  const songs = {
    1: { uri: 'spotify:track:first', platform: 'spotify' },
    2: { uri: 'spotify:track:second', platform: 'spotify' },
  };
  await act(async () => {
    form.handleShuffleForWork({ id: 'new-playlist' }, songs);
    form.handleShuffleForRest({ id: 'new-playlist' }, songs);
  });
  assert.equal(form.roundWorkPlaylists[1], undefined);
  assert.equal(form.roundRestPlaylists[1], undefined);
  await act(async () => {
    form.handleRemoveWorkMusic(1);
    form.handleRemoveRestMusic(1);
  });
  await act(async () => form.handleSaveRoutine());
  assert.equal(resolveRoundAudio(saved, 'work', 1), null);
  assert.equal(resolveRoundAudio(saved, 'rest', 1), null);
  assert.equal(resolveRoundAudio(saved, 'work', 2).source.uri, songs[2].uri);
});
