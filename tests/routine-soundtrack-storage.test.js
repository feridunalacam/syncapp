import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createAccountStore } from '../src/lib/accountStore.js';
import { createBackupSync } from '../src/lib/backupSync.js';
import { normalizeRoutine } from '../src/domain/routines.js';

function memoryStorage() {
  const values = new Map();
  return {
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
}
const selected = (id = 'p.saved', shuffle = true) => ({
  platform: 'appleMusic',
  kind: 'playlist',
  id,
  name: 'Saved soundtrack',
  artist: 'Curator',
  image: 'https://example.test/cover.jpg',
  shuffle,
});
const routine = () =>
  normalizeRoutine({
    id: 'routine',
    name: 'Workout',
    rounds: 2,
    workSec: 45,
    restSec: 10,
    soundtrack: selected(),
    workoutPlaylistId: 'legacy-work',
    platform: 'spotify',
    workVolume: 70,
    restVolume: 30,
    audioAlerts: { enabled: true },
    roundsData: [
      { workSec: 60, restSec: 8, workSong: { uri: 'spotify:track:legacy', platform: 'spotify' } },
      { workSec: 30, restSec: 0, restPlaylistId: 'legacy-rest', restPlaylistPlatform: 'spotify' },
    ],
  });

test('real account store snapshot and replacement preserve soundtrack, shuffle and legacy data in version 1', async () => {
  const base = memoryStorage();
  const a = createAccountStore(base, 'a'),
    b = createAccountStore(base, 'b');
  const saved = routine();
  await a.setJSON('routines', [saved]);
  await b.setJSON('routines', [
    { id: 'b-private', soundtrack: selected('p.other-account', false) },
  ]);
  const snapshot = await a.snapshot();
  assert.equal(snapshot.payload.version, 1);
  assert.deepEqual(snapshot.payload.data.routines[0], saved);
  const target = createAccountStore(memoryStorage(), 'a');
  assert.equal(await target.replaceFromCloud(snapshot.payload, 4, 0), true);
  assert.deepEqual((await target.getJSON('routines'))[0], saved);
  assert.equal((await b.getJSON('routines'))[0].soundtrack.id, 'p.other-account');
});

test('real generic backup sync preserves independent soundtrack on upload, restore and subsequent edits', async () => {
  const source = createAccountStore(memoryStorage(), 'a');
  const target = createAccountStore(memoryStorage(), 'a');
  let cloud = null,
    reloads = 0;
  const remote = {
    read: async () => cloud,
    write: async (payload, expected) => {
      assert.equal(expected, cloud?.revision || 0);
      cloud = { revision: expected + 1, payload: JSON.parse(JSON.stringify(payload)) };
      return { revision: cloud.revision };
    },
  };
  const upload = createBackupSync({ local: source, remote });
  const download = createBackupSync({ local: target, remote, onRestore: () => reloads++ });
  const saved = routine();
  await source.setJSON('routines', [saved]);
  await upload.sync();
  await download.sync();
  assert.equal(reloads, 1);
  assert.deepEqual((await target.getJSON('routines'))[0], saved);
  const edited = normalizeRoutine({ ...saved, soundtrack: selected('pl.updated', false) });
  await target.setJSON('routines', [edited]);
  await download.sync();
  await upload.sync();
  assert.deepEqual((await source.getJSON('routines'))[0].soundtrack, edited.soundtrack);
  assert.deepEqual((await source.getJSON('routines'))[0].roundsData, saved.roundsData);
  assert.equal(cloud.payload.version, 1);
  upload.stop();
  download.stop();
});

test('actual Profile local publication JSON copy preserves soundtrack without shared mutable state', () => {
  const source = readFileSync(
    new URL('../src/screens/Profile/ProfileScreen.js', import.meta.url),
    'utf8',
  );
  const publish = source.match(/const publish = \(\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(publish, 'Use the actual existing publication handler');
  const saved = routine();
  let post;
  const scope = {
    routines: [saved],
    routineId: saved.id,
    category: 'Workout',
    caption: 'Copy',
    addPost: (value) => {
      post = value;
    },
    setSheet() {},
    setCaption() {},
    setRoutineId() {},
    Alert: { alert: () => assert.fail('Saved routine should be selectable') },
  };
  new Script(`${publish}\npublish();`).runInNewContext(scope);
  assert.deepEqual(JSON.parse(JSON.stringify(post.routine)), saved);
  post.routine.soundtrack.shuffle = false;
  assert.equal(saved.soundtrack.shuffle, true);
});
