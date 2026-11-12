import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../src/lib/accountStore.js';
import { createBackupSync } from '../src/lib/backupSync.js';

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
    multiRemove: async (keys) => {
      keys.forEach((key) => values.delete(key));
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = () => new Promise(setImmediate);
const cloudPayload = (id) => ({ version: 1, data: { routines: [{ id }] } });

test('a conflict choice interrupted by a workout becomes actionable again on idle sync', async () => {
  let allowed = true;
  let pauseChoice = true;
  let reads = 0;
  let reloads = 0;
  const states = [];
  const sync = createBackupSync({
    canSync: () => allowed,
    local: {
      snapshot: async () => ({
        payload: cloudPayload('device'),
        meta: { revision: 0, counter: 1, dirty: true },
      }),
      replaceFromCloud: async () => {
        if (pauseChoice) {
          pauseChoice = false;
          allowed = false;
          return false;
        }
        return true;
      },
    },
    remote: {
      read: async () => {
        reads++;
        return { revision: 1, payload: cloudPayload('cloud') };
      },
    },
    onState: (state) => states.push(state),
    onRestore: () => reloads++,
  });
  await sync.sync();
  assert.equal(states.at(-1).status, 'conflict');
  await sync.sync('cloud');
  assert.equal(states.at(-1).status, 'paused');
  assert.equal(reloads, 0);
  allowed = true;
  await sync.sync();
  assert.equal(states.at(-1).status, 'conflict', 'Restore the copy-choice controls after pause');
  assert.equal(reads, 2, 'Do not silently choose or fetch another copy');
  await sync.sync('cloud');
  assert.equal(states.at(-1).status, 'synced');
  assert.equal(reloads, 1);
});

test('stopping while the local snapshot is pending does not start a cloud request', async () => {
  const waiting = deferred();
  let calls = 0;
  const sync = createBackupSync({
    local: { snapshot: () => waiting.promise },
    remote: { read: async () => calls++ },
  });
  const request = sync.sync();
  await settle();
  sync.stop();
  waiting.resolve({ payload: cloudPayload('local'), meta: { revision: 0, dirty: false } });
  await request;
  assert.equal(calls, 0);
});

test('starting a workout during the local snapshot defers even the cloud request', async () => {
  const waiting = deferred();
  let allowed = true;
  let calls = 0;
  const states = [];
  const sync = createBackupSync({
    local: { snapshot: () => waiting.promise },
    canSync: () => allowed,
    remote: { read: async () => calls++ },
    onState: (state) => states.push(state),
  });
  const request = sync.sync();
  await settle();
  allowed = false;
  waiting.resolve({ payload: cloudPayload('local'), meta: { revision: 0, dirty: false } });
  await request;
  assert.equal(calls, 0);
  assert.equal(states.at(-1).status, 'paused');
});

test('starting a workout while a cloud fetch is pending defers restoration until idle', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  const pending = deferred();
  const states = [];
  let workoutActive = false;
  let restored = 0;
  const sync = createBackupSync({
    local,
    canSync: () => !workoutActive,
    remote: {
      read: () => pending.promise,
      write: () => {
        throw new Error('Unexpected upload');
      },
    },
    onState: (state) => states.push(state),
    onRestore: () => restored++,
  });
  const waiting = sync.sync();
  await settle();
  workoutActive = true;
  pending.resolve({ revision: 1, payload: cloudPayload('cloud') });
  await waiting;
  assert.equal(restored, 0);
  assert.equal(await local.getJSON('routines'), null);
  assert.equal(states.at(-1).status, 'paused');
  workoutActive = false;
  await sync.sync();
  assert.equal(restored, 1);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'cloud' }]);
});

test('a cloud conflict committed just before pause reloads once on idle before further work', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'device' }]);
  const committed = deferred();
  const waiting = deferred();
  let allowed = true;
  let pauseFirstCommit = true;
  let reloads = 0;
  let writes = 0;
  let cloud = { revision: 1, payload: cloudPayload('cloud') };
  const events = [];
  const states = [];
  const sync = createBackupSync({
    local: {
      ...local,
      snapshot: () => {
        events.push('snapshot');
        return local.snapshot();
      },
      replaceFromCloud: async (...args) => {
        const applied = await local.replaceFromCloud(...args);
        if (applied && pauseFirstCommit) {
          pauseFirstCommit = false;
          committed.resolve();
          await waiting.promise;
        }
        return applied;
      },
    },
    canSync: () => allowed,
    remote: {
      read: async () => {
        events.push('read');
        return cloud;
      },
      write: async (payload, revision) => {
        events.push('write');
        writes++;
        cloud = { payload, revision: revision + 1 };
        return cloud;
      },
    },
    onRestore: () => {
      reloads++;
      events.push('reload');
    },
    onState: (state) => states.push(state),
  });
  await sync.sync();
  assert.equal(states.at(-1).status, 'conflict');
  const resolving = sync.sync('cloud');
  await committed.promise;
  allowed = false;
  waiting.resolve();
  await resolving;
  assert.equal(states.at(-1).status, 'paused');
  assert.equal(reloads, 0);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'cloud' }]);
  assert.equal((await local.snapshot()).meta.revision, 1);
  await local.setString('profileBio', 'Edit while consumer reload is paused');
  events.length = 0;
  allowed = true;
  await sync.sync();
  assert.equal(events[0], 'reload');
  assert.deepEqual(events, ['reload', 'snapshot', 'read', 'write']);
  assert.equal(reloads, 1);
  assert.equal(writes, 1);
  assert.equal(cloud.payload.data.profileBio, 'Edit while consumer reload is paused');
  assert.equal(states.at(-1).status, 'synced');
  assert.equal((await local.snapshot()).meta.dirty, false);
  await sync.sync();
  assert.equal(reloads, 1, 'A later normal sync must not repeat the pending consumer reload');
});

test('stopping an engine discards a paused committed replacement reload', async () => {
  const applying = deferred();
  let allowed = true;
  let replacements = 0;
  let reads = 0;
  let reloads = 0;
  const sync = createBackupSync({
    local: {
      snapshot: async () => ({
        payload: cloudPayload('device'),
        meta: { revision: 0, dirty: false },
      }),
      replaceFromCloud: () => {
        replacements++;
        return applying.promise;
      },
    },
    remote: {
      read: async () => {
        reads++;
        return { revision: 1, payload: cloudPayload('cloud') };
      },
    },
    canSync: () => allowed,
    onRestore: () => reloads++,
  });
  const request = sync.sync();
  await settle();
  assert.equal(replacements, 1);
  allowed = false;
  applying.resolve(true);
  await request;
  sync.stop();
  allowed = true;
  await sync.sync();
  assert.equal(reloads, 0);
  assert.equal(reads, 1);
});

test('failed post-commit re-journaling retains a complete cloud copy and safely reloads queued edits on idle', async () => {
  const reached = deferred();
  const waiting = deferred();
  let allowed = true;
  let rejectReservation = false;
  let failedReservations = 0;
  const base = memoryStorage();
  const set = base.setItem;
  const remove = base.removeItem;
  base.setItem = async (key, value) => {
    if (key.endsWith('@cloud-restore-pending') && rejectReservation) {
      rejectReservation = false;
      failedReservations++;
      throw new Error('Post-commit journal storage unavailable');
    }
    await set(key, value);
  };
  base.removeItem = async (key) => {
    await remove(key);
    if (key.endsWith('@cloud-restore-pending')) {
      reached.resolve();
      await waiting.promise;
    }
  };
  const local = createAccountStore(base, 'a');
  await local.setJSON('routines', [{ id: 'device' }]);
  await local.setString('profileBio', 'Device bio');
  const before = await local.snapshot();
  let cloud = {
    revision: 1,
    payload: { version: 1, data: { routines: [{ id: 'cloud' }], profileBio: 'Cloud bio' } },
  };
  let reloads = 0;
  let writes = 0;
  const events = [];
  const states = [];
  const sync = createBackupSync({
    local: {
      ...local,
      snapshot: () => {
        events.push('snapshot');
        return local.snapshot();
      },
    },
    canSync: () => allowed,
    remote: {
      read: async () => {
        events.push('read');
        return cloud;
      },
      write: async (payload, revision) => {
        events.push('write');
        writes++;
        cloud = { payload, revision: revision + 1 };
        return cloud;
      },
    },
    onRestore: () => {
      events.push('reload');
      reloads++;
    },
    onState: (state) => states.push(state),
  });
  const restoring = sync.sync('cloud');
  await reached.promise;
  const saving = local.setString('profileBio', 'Edit queued after final journal removal');
  allowed = false;
  rejectReservation = true;
  waiting.resolve();
  await restoring;
  assert.equal(await saving, true);
  assert.equal(failedReservations, 1);
  assert.equal(states.at(-1).status, 'paused');
  assert.equal(reloads, 0);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'cloud' }]);
  assert.equal(await local.getString('profileBio'), 'Edit queued after final journal removal');
  assert.deepEqual((await local.snapshot()).meta, {
    revision: 1,
    counter: before.meta.counter + 2,
    dirty: true,
  });
  allowed = true;
  events.length = 0;
  await sync.sync();
  assert.deepEqual(events, ['reload', 'snapshot', 'read', 'write']);
  assert.equal(reloads, 1);
  assert.equal(writes, 1);
  assert.deepEqual(cloud.payload.data.routines, [{ id: 'cloud' }]);
  assert.equal(cloud.payload.data.profileBio, 'Edit queued after final journal removal');
  assert.equal((await local.snapshot()).meta.dirty, false);
  await sync.sync();
  assert.equal(reloads, 1);
});

test('cloud activation during a paused workout does not fetch or replace account data', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  let calls = 0;
  const sync = createBackupSync({
    local,
    canSync: () => false,
    remote: {
      read: () => {
        calls++;
      },
      write: () => {
        calls++;
      },
    },
  });
  await sync.sync();
  assert.equal(calls, 0);
});

test('new local changes are uploaded with expected revision and marked clean', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'local' }]);
  const writes = [];
  const states = [];
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => null,
      write: async (payload, expected) => {
        writes.push([payload, expected]);
        return { revision: 1 };
      },
    },
    onState: (state) => states.push(state),
  });
  await sync.sync();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][0].data.routines, [{ id: 'local' }]);
  assert.equal(writes[0][1], 0);
  assert.equal((await local.snapshot()).meta.dirty, false);
  assert.equal(states.at(-1).status, 'synced');
});

test('a local edit during upload remains dirty and is uploaded on the following sync', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'first' }]);
  const waiting = deferred();
  const writes = [];
  let cloud = null;
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => cloud,
      write: async (payload, expected) => {
        writes.push({ payload, expected });
        if (writes.length === 1) await waiting.promise;
        cloud = { revision: expected + 1, payload };
        return cloud;
      },
    },
  });
  const firstUpload = sync.sync();
  await settle();
  await local.setJSON('routines', [{ id: 'latest' }]);
  // Repeated callers share the upload instead of racing a second CAS request.
  const overlapping = sync.sync();
  assert.equal(overlapping, firstUpload);
  waiting.resolve();
  await firstUpload;
  assert.equal((await local.snapshot()).meta.dirty, true);
  assert.deepEqual((await local.snapshot()).payload.data.routines, [{ id: 'latest' }]);
  await sync.sync();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].payload.data.routines, [{ id: 'latest' }]);
  assert.equal(writes[1].expected, 1);
  assert.equal((await local.snapshot()).meta.dirty, false);
});

test('CAS conflict never overwrites the changed cloud copy and keeps local edits', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'device' }]);
  const states = [];
  let writes = 0;
  const cloud = { revision: 0, payload: cloudPayload('cloud') };
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => cloud,
      write: async () => {
        writes++;
        throw Object.assign(new Error('CAS changed'), { code: '40001' });
      },
    },
    onState: (state) => states.push(state),
  });
  await assert.rejects(sync.sync(), /CAS changed/);
  assert.equal(states.at(-1).status, 'conflict');
  assert.equal((await local.snapshot()).meta.dirty, true);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'device' }]);
  assert.deepEqual(cloud.payload.data.routines, [{ id: 'cloud' }]);
  await sync.sync();
  assert.equal(writes, 1);
});

test('different dirty device and cloud revisions require an explicit choice', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'device' }]);
  let writes = 0;
  const states = [];
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => ({ revision: 4, payload: cloudPayload('cloud') }),
      write: async (_payload, revision) => {
        writes++;
        assert.equal(revision, 4);
        return { revision: 5 };
      },
    },
    onState: (state) => states.push(state),
  });
  await sync.sync();
  assert.equal(states.at(-1).status, 'conflict');
  assert.equal(writes, 0);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'device' }]);
  await sync.sync('local');
  assert.equal(writes, 1);
  assert.equal((await local.snapshot()).meta.revision, 5);
});

test('cloud fetch completing after stop cannot restore or publish a stale state', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  const waiting = deferred();
  const states = [];
  let restores = 0;
  const sync = createBackupSync({
    local,
    remote: {
      read: () => waiting.promise,
      write: async () => {
        throw new Error('Unexpected write');
      },
    },
    onState: (state) => states.push(state),
    onRestore: () => restores++,
  });
  const request = sync.sync();
  await settle();
  sync.stop();
  const stateCount = states.length;
  waiting.resolve({ revision: 3, payload: cloudPayload('previous-account-cloud') });
  await request;
  assert.equal(await local.getJSON('routines'), null);
  assert.equal(restores, 0);
  assert.equal(states.length, stateCount);
  await sync.sync();
  assert.equal(states.length, stateCount);
});

test('local edits during cloud download prevent cloud replacement', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  const waiting = deferred();
  const states = [];
  let restores = 0;
  const sync = createBackupSync({
    local,
    remote: {
      read: () => waiting.promise,
      write: async () => {
        throw new Error('Unexpected upload');
      },
    },
    onState: (state) => states.push(state),
    onRestore: () => restores++,
  });
  const request = sync.sync();
  await settle();
  await local.setJSON('routines', [{ id: 'new-local-edit' }]);
  waiting.resolve({ revision: 2, payload: cloudPayload('old-cloud-edit') });
  await request;
  assert.equal(restores, 0);
  assert.equal(states.at(-1).status, 'conflict');
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'new-local-edit' }]);
  assert.equal((await local.snapshot()).meta.dirty, true);
});

test('cloud restore on an unchanged device updates local data and reloads consumers once', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  let restores = 0;
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => ({ revision: 3, payload: cloudPayload('cloud') }),
      write: async () => {
        throw new Error('Unexpected upload');
      },
    },
    onRestore: () => restores++,
  });
  await sync.sync();
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'cloud' }]);
  assert.equal((await local.snapshot()).meta.revision, 3);
  assert.equal(restores, 1);
});

test('network failure preserves dirty device data for a retry', async () => {
  const local = createAccountStore(memoryStorage(), 'a');
  await local.setJSON('routines', [{ id: 'offline-edit' }]);
  const states = [];
  const sync = createBackupSync({
    local,
    remote: {
      read: async () => {
        throw new Error('Offline');
      },
      write: async () => {
        throw new Error('Unexpected upload');
      },
    },
    onState: (state) => states.push(state),
  });
  await assert.rejects(sync.sync(), /Offline/);
  assert.equal(states.at(-1).status, 'error');
  assert.equal((await local.snapshot()).meta.dirty, true);
  assert.deepEqual(await local.getJSON('routines'), [{ id: 'offline-edit' }]);
});
