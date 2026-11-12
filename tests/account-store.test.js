import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { createAccountStore, clearAccountStore, sanitizeBackup } from '../src/lib/accountStore.js';

function memoryStorage(initial = {}, hooks = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      await hooks.beforeSet?.(key, value);
      values.set(key, value);
    },
    removeItem: async (key) => {
      await hooks.beforeRemove?.(key);
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
    multiRemove: async (keys) => {
      await hooks.beforeMultiRemove?.(keys);
      keys.forEach((key) => values.delete(key));
    },
  };
}
const scopedKey = (id, key) => `@syncapp/account/${id}/${key}`;
const payload = (data) => ({ version: 1, data });
const settle = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('an old account write completing after a switch cannot write into the next account', async () => {
  const pending = deferred();
  const base = memoryStorage(
    {},
    { beforeSet: (key) => (key === scopedKey('a', 'profileBio') ? pending.promise : undefined) },
  );
  const a = createAccountStore(base, 'a');
  const b = createAccountStore(base, 'b');
  const oldSave = a.setString('profileBio', 'Account A');
  await settle();
  await b.setString('profileBio', 'Account B');
  pending.resolve();
  await oldSave;
  assert.equal(await a.getString('profileBio'), 'Account A');
  assert.equal(await b.getString('profileBio'), 'Account B');
  assert.equal(base.values.has('profileBio'), false);
});

test('queued writes keep snapshot and dirty counter consistent', async () => {
  const base = memoryStorage();
  const account = createAccountStore(base, 'a');
  await Promise.all([
    account.setJSON('routines', [{ id: 'one' }]),
    account.setJSON('routines', [{ id: 'one' }, { id: 'two' }]),
    account.setString('profileBio', 'Latest bio'),
  ]);
  const snapshot = await account.snapshot();
  assert.deepEqual(snapshot.payload.data.routines, [{ id: 'one' }, { id: 'two' }]);
  assert.equal(snapshot.payload.data.profileBio, 'Latest bio');
  assert.equal(snapshot.meta.counter, 3);
  assert.equal(snapshot.meta.dirty, true);
  await account.setString('profileBio', 'Latest bio');
  assert.equal((await account.snapshot()).meta.counter, 3);
});

test('damaged local JSON fails closed while missing and valid null records keep their fallback semantics', async () => {
  for (const userId of [null, 'a']) {
    const key = userId ? scopedKey(userId, 'routines') : 'routines';
    const raw = '[{"id":"recoverable"},';
    const base = memoryStorage({ [key]: raw });
    const before = new Map(base.values);
    const storage = createAccountStore(base, userId);
    await assert.rejects(storage.prepare(), /Saved records could not be read/);
    await assert.rejects(storage.getJSON('routines', []), /Saved records could not be read/);
    assert.deepEqual(base.values, before);
    base.values.set(key, 'null');
    await storage.prepare();
    assert.equal(await storage.getJSON('routines', []), null);
    base.values.delete(key);
    assert.deepEqual(await storage.getJSON('routines', []), []);
  }
});

test('damaged guest or account JSON cannot be reserved, imported or removed', async () => {
  for (const key of ['routines', 'posts', 'profileSocialLinks', scopedKey('a', 'routines')]) {
    const base = memoryStorage({ routines: '[{"id":"guest"}]', [key]: '{recoverable' });
    const before = new Map(base.values);
    await assert.rejects(
      createAccountStore(base, 'a').importGuestData(),
      /Saved records could not be read/,
    );
    assert.deepEqual(base.values, before);
  }
});

test('guest import preserves account edits, merges identities, and imports only once', async () => {
  const base = memoryStorage({
    routines: JSON.stringify([{ id: 'same', name: 'Guest name' }, { id: 'guest-only' }]),
    completedRoutines: JSON.stringify([{ sessionId: 's1', id: 'routine', completedAt: 'today' }]),
    profileBio: 'Guest bio',
    profilePictureUri: 'file:///guest-photo.jpg',
    [scopedKey('a', 'routines')]: JSON.stringify([
      { id: 'same', name: 'Account name' },
      { id: 'account-only' },
    ]),
    [scopedKey('a', 'profileBio')]: 'Account bio',
  });
  const account = createAccountStore(base, 'a');
  assert.equal((await account.guestImportState()).hasGuestData, true);
  await account.importGuestData();
  assert.deepEqual(await account.getJSON('routines'), [
    { id: 'same', name: 'Account name' },
    { id: 'guest-only' },
    { id: 'account-only' },
  ]);
  assert.equal(await account.getString('profileBio'), 'Account bio');
  assert.equal(await account.getString('profilePictureUri'), 'file:///guest-photo.jpg');
  assert.equal((await account.getJSON('completedRoutines')).length, 1);
  assert.equal(base.values.has('routines'), false);
  assert.equal(base.values.has('profilePictureUri'), false);
  assert.equal((await account.guestImportState()).importComplete, true);
  const before = await account.snapshot();
  await account.importGuestData();
  assert.deepEqual(await account.snapshot(), before);
  await assert.rejects(createAccountStore(base, 'b').importGuestData(), /another account/);
});

test('two accounts concurrently importing cannot both claim the same guest records', async () => {
  const base = memoryStorage({ routines: JSON.stringify([{ id: 'private-guest-record' }]) });
  const a = createAccountStore(base, 'a');
  const b = createAccountStore(base, 'b');
  const results = await Promise.allSettled([a.importGuestData(), b.importGuestData()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const copies = await Promise.all([a.getJSON('routines', []), b.getJSON('routines', [])]);
  assert.equal(
    copies.filter((rows) => rows.some((row) => row.id === 'private-guest-record')).length,
    1,
  );
});

test('guest import preserves an intentionally empty existing account profile field', async () => {
  const base = memoryStorage({
    profileBio: 'Old guest bio',
    [scopedKey('a', 'profileBio')]: '',
  });
  const account = createAccountStore(base, 'a');
  await account.importGuestData();
  assert.equal(await account.getString('profileBio'), '');
});

test('guest import waits for an already queued guest save before copying and cleaning up', async () => {
  const waiting = deferred();
  const base = memoryStorage(
    { profileBio: 'Old guest bio' },
    {
      beforeSet: (key) => (key === 'profileBio' ? waiting.promise : undefined),
    },
  );
  const guest = createAccountStore(base, null);
  const account = createAccountStore(base, 'a');
  const saving = guest.setString('profileBio', 'Latest guest bio');
  await settle();
  const importing = account.importGuestData();
  await settle();
  waiting.resolve();
  assert.equal(await saving, true);
  await importing;
  assert.equal(await account.getString('profileBio'), 'Latest guest bio');
  assert.equal(await guest.getString('profileBio'), null);
});

test('a failed guest cleanup is retried without copying over later account edits', async () => {
  let fail = true;
  const base = memoryStorage(
    { routines: JSON.stringify([{ id: 'guest' }]), profileBio: 'Guest bio' },
    {
      beforeMultiRemove: () => {
        if (fail) throw new Error('Storage unavailable');
      },
    },
  );
  const account = createAccountStore(base, 'a');
  await assert.rejects(account.importGuestData(), /Storage unavailable/);
  assert.equal(base.values.get('@syncapp_guest_import_owner'), 'a');
  assert.equal(base.values.has('routines'), true);
  assert.deepEqual(await account.guestImportState(), {
    hasGuestData: true,
    importComplete: false,
  });
  await account.setString('profileBio', 'Updated account bio');
  fail = false;
  await account.importGuestData();
  assert.equal(base.values.has('routines'), false);
  assert.equal(base.values.has('profileBio'), false);
  assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
  assert.equal(await account.getString('profileBio'), 'Updated account bio');
  assert.deepEqual(await account.getJSON('routines'), [{ id: 'guest' }]);
});

test('an interrupted owner commit reserves the import before another account can change any records', async () => {
  let interruptOwner = true;
  const base = memoryStorage(
    { routines: JSON.stringify([{ id: 'guest' }]), profileBio: 'Guest bio' },
    {
      beforeSet: (key) => {
        if (key === '@syncapp_guest_import_owner' && interruptOwner)
          throw new Error('Interrupted owner commit');
      },
    },
  );
  const a = createAccountStore(base, 'a');
  const b = createAccountStore(base, 'b');
  await b.setString('profileBio', 'Existing account B bio');
  await assert.rejects(a.importGuestData(), /Interrupted owner commit/);
  assert.equal(base.values.has('@syncapp_guest_import_owner'), false);
  const beforeOtherClaim = new Map(base.values);
  await assert.rejects(b.importGuestData(), /another account/);
  assert.deepEqual(base.values, beforeOtherClaim, 'Rejected claimant changes no stored value');
  assert.equal(await b.getString('profileBio'), 'Existing account B bio');
  assert.deepEqual(await b.getJSON('routines', []), []);
  assert.deepEqual(await b.guestImportState(), { hasGuestData: false, importComplete: false });
  assert.deepEqual(await a.guestImportState(), { hasGuestData: true, importComplete: false });
  await a.setString('profileBio', 'Later account A edit');
  interruptOwner = false;
  await a.importGuestData();
  assert.equal(await a.getString('profileBio'), 'Later account A edit');
  assert.deepEqual(await a.getJSON('routines'), [{ id: 'guest' }]);
  assert.equal(base.values.has('routines'), false);
  assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
  assert.equal(base.values.get('@syncapp_guest_import_owner'), 'a');
  assert.deepEqual(await a.guestImportState(), { hasGuestData: false, importComplete: true });
});

test('a failed partial copy keeps its durable claim and resumes only for the original account', async () => {
  let interruptCopy = true;
  const base = memoryStorage(
    { routines: '[{"id":"guest","name":"Guest routine"}]', profileBio: 'Guest bio' },
    {
      beforeSet: (key) => {
        if (key === scopedKey('a', 'profileBio') && interruptCopy)
          throw new Error('Interrupted copy');
      },
    },
  );
  const a = createAccountStore(base, 'a');
  const b = createAccountStore(base, 'b');
  await assert.rejects(a.importGuestData(), /Interrupted copy/);
  assert.equal(base.values.get('@syncapp_guest_import_claim'), 'a');
  assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
  assert.equal(base.values.has('@syncapp_guest_import_owner'), false);
  assert.deepEqual(await a.getJSON('routines'), [{ id: 'guest', name: 'Guest routine' }]);
  const beforeOtherClaim = new Map(base.values);
  await assert.rejects(b.importGuestData(), /another account/);
  assert.deepEqual(base.values, beforeOtherClaim);
  assert.deepEqual(await b.getJSON('routines', []), []);
  assert.deepEqual(await a.guestImportState(), { hasGuestData: true, importComplete: false });
  await a.setJSON('routines', [{ id: 'guest', name: 'Later account edit' }]);
  interruptCopy = false;
  await a.importGuestData();
  assert.deepEqual(await a.getJSON('routines'), [{ id: 'guest', name: 'Later account edit' }]);
  assert.equal(await a.getString('profileBio'), 'Guest bio');
  assert.equal(base.values.has('routines'), false);
  assert.equal(base.values.has('@syncapp_guest_import_claim'), false);
});

test('deletion before import commit preserves guest originals across every awaited commit boundary', async () => {
  for (const blockingKey of [
    '@syncapp_guest_import_claim',
    scopedKey('a', 'profileBio'),
    '@syncapp_guest_import_cleanup',
    '@syncapp_guest_import_owner',
  ]) {
    const reached = deferred();
    const waiting = deferred();
    const originals = { routines: '[{"id":"guest"}]', profileBio: 'Guest bio' };
    const base = memoryStorage(originals, {
      beforeSet: (key) => {
        if (key !== blockingKey) return;
        reached.resolve();
        return waiting.promise;
      },
    });
    const importing = createAccountStore(base, 'a').importGuestData();
    await reached.promise;
    const deleting = clearAccountStore(base, 'a');
    waiting.resolve();
    await assert.rejects(importing, /deleted/);
    await deleting;
    for (const [key, raw] of Object.entries(originals)) assert.equal(base.values.get(key), raw);
    assert.equal(base.values.has('@syncapp_guest_import_owner'), false);
    assert.equal(base.values.has('@syncapp_guest_import_claim'), false);
    assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
    assert.equal(
      [...base.values.keys()].some((key) => key.startsWith(scopedKey('a', ''))),
      false,
    );
  }
});

test('deletion after ownership commit removes the imported account copy without reopening guest ownership', async () => {
  const reached = deferred();
  const waiting = deferred();
  const base = memoryStorage(
    { routines: '[{"id":"guest"}]' },
    {
      beforeMultiRemove: (keys) => {
        if (!keys.includes('routines')) return;
        reached.resolve();
        return waiting.promise;
      },
    },
  );
  const importing = createAccountStore(base, 'a').importGuestData();
  await reached.promise;
  assert.equal(base.values.get('@syncapp_guest_import_owner'), 'a');
  const deleting = clearAccountStore(base, 'a');
  waiting.resolve();
  await importing;
  await deleting;
  assert.equal(base.values.has('routines'), false);
  assert.equal(base.values.has(scopedKey('a', 'routines')), false);
  assert.equal(base.values.get('@syncapp_guest_import_owner'), 'a');
});

test('deleting an interrupted import releases its reservation without removing uncleaned guest records', async () => {
  let interruptOwner = true;
  const guestRaw = JSON.stringify([{ id: 'guest' }]);
  const base = memoryStorage(
    { routines: guestRaw },
    {
      beforeSet: (key) => {
        if (key === '@syncapp_guest_import_owner' && interruptOwner)
          throw new Error('Interrupted owner commit');
      },
    },
  );
  const a = createAccountStore(base, 'a');
  await assert.rejects(a.importGuestData(), /Interrupted owner commit/);
  await clearAccountStore(base, 'a');
  assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
  assert.equal(base.values.has('@syncapp_guest_import_claim'), false);
  assert.equal(base.values.get('routines'), guestRaw);
  assert.equal(
    [...base.values.keys()].some((key) => key.startsWith(scopedKey('a', ''))),
    false,
  );
  interruptOwner = false;
  const b = createAccountStore(base, 'b');
  await b.importGuestData();
  assert.deepEqual(await b.getJSON('routines'), [{ id: 'guest' }]);
  assert.equal(base.values.get('@syncapp_guest_import_owner'), 'b');
});

test('an invalid pending cleanup fails closed before an import can replace it or claim ownership', async () => {
  for (const raw of [
    '{invalid',
    JSON.stringify({ userId: 'a', entries: [['other-key', 'value']] }),
  ]) {
    const base = memoryStorage({
      routines: '[{"id":"guest"}]',
      '@syncapp_guest_import_cleanup': raw,
    });
    const before = new Map(base.values);
    await assert.rejects(createAccountStore(base, 'b').importGuestData(), /could not be cleaned/);
    assert.deepEqual(base.values, before);
  }
});

test('retrying guest cleanup preserves new guest edits and a completed import is a no-op', async () => {
  let fail = true;
  const base = memoryStorage(
    { routines: JSON.stringify([{ id: 'imported' }]), profileBio: 'Imported bio' },
    {
      beforeMultiRemove: () => {
        if (fail) throw new Error('Storage unavailable');
      },
    },
  );
  const account = createAccountStore(base, 'a');
  const guest = createAccountStore(base, null);
  await assert.rejects(account.importGuestData(), /Storage unavailable/);
  await guest.setJSON('routines', [{ id: 'new-guest-edit' }]);
  await guest.setString('profileBio', 'New guest bio');
  fail = false;
  await account.importGuestData();
  assert.deepEqual(await guest.getJSON('routines'), [{ id: 'new-guest-edit' }]);
  assert.equal(await guest.getString('profileBio'), 'New guest bio');
  assert.deepEqual(await account.getJSON('routines'), [{ id: 'imported' }]);
  await account.importGuestData();
  assert.deepEqual(await guest.getJSON('routines'), [{ id: 'new-guest-edit' }]);
  assert.equal(await guest.getString('profileBio'), 'New guest bio');
});

test('an unsigned guest cannot claim an import', async () => {
  const account = createAccountStore(memoryStorage({ profileBio: 'Guest bio' }), null);
  await assert.rejects(account.importGuestData(), /Sign in/);
});

test('backups remove nested secrets and device-local references while keeping useful metadata', async () => {
  const base = memoryStorage();
  const account = createAccountStore(base, 'a');
  await account.setJSON('routines', [
    {
      id: 'r1',
      accessToken: 'secret',
      music: {
        refresh_token: 'secret',
        authorization: 'secret',
        password: 'secret',
        uri: 'content://audio/123',
        name: 'Training music',
      },
      rounds: [
        { uri: 'file:///audio.mp3', image: 'ph://photo', webpage: 'https://example.com/music' },
      ],
    },
  ]);
  await account.setJSON('connectedPlatforms', { spotify: { accessToken: 'never-upload' } });
  await account.setString('profilePictureUri', 'file:///avatar.jpg');
  await account.setJSON('posts', [
    { id: 'sample', authorId: 'someone-else' },
    { id: 'mine', authorId: 'current-user' },
  ]);
  const { payload: backup } = await account.snapshot();
  assert.equal(JSON.stringify(backup).includes('secret'), false);
  assert.equal(JSON.stringify(backup).includes('never-upload'), false);
  assert.equal(backup.data.routines[0].music.uri, null);
  assert.equal(backup.data.routines[0].music.name, 'Training music');
  assert.equal(backup.data.routines[0].rounds[0].uri, null);
  assert.equal(backup.data.routines[0].rounds[0].image, null);
  assert.equal(backup.data.routines[0].rounds[0].webpage, 'https://example.com/music');
  assert.equal('profilePictureUri' in backup.data, false);
  assert.equal('connectedPlatforms' in backup.data, false);
  assert.deepEqual(backup.data.posts, [{ id: 'mine', authorId: 'current-user' }]);
  assert.deepEqual(
    sanitizeBackup({ REFRESHTOKEN: 'secret', other: ['blob:device', 'assets-library://local'] }),
    { other: [null, null] },
  );
});

test('marking an uploaded snapshot synced does not clear later local writes', async () => {
  const account = createAccountStore(memoryStorage(), 'a');
  await account.setJSON('routines', [{ id: 'old' }]);
  const upload = await account.snapshot();
  await account.setJSON('routines', [{ id: 'new' }]);
  await account.markSynced(8, upload.meta.counter);
  const latest = await account.snapshot();
  assert.equal(latest.meta.revision, 8);
  assert.equal(latest.meta.dirty, true);
  assert.deepEqual(latest.payload.data.routines, [{ id: 'new' }]);
});

test('cloud restore refuses a stale local counter and leaves edits untouched', async () => {
  const account = createAccountStore(memoryStorage(), 'a');
  const before = await account.snapshot();
  await account.setString('profileBio', 'Local edit while downloading');
  const restored = await account.replaceFromCloud(
    payload({ profileBio: 'Older cloud edit' }),
    6,
    before.meta.counter,
  );
  assert.equal(restored, false);
  assert.equal(await account.getString('profileBio'), 'Local edit while downloading');
});

test('valid restore keeps a recoverable device copy and rejects malformed format', async () => {
  const base = memoryStorage();
  const account = createAccountStore(base, 'a');
  await account.setJSON('routines', [{ id: 'device-copy' }]);
  const before = await account.snapshot();
  assert.equal(
    await account.replaceFromCloud(
      payload({ routines: [{ id: 'cloud-copy' }] }),
      4,
      before.meta.counter,
    ),
    true,
  );
  assert.deepEqual(await account.getJSON('routines'), [{ id: 'cloud-copy' }]);
  const recovery = JSON.parse(base.values.get(scopedKey('a', '@before-cloud-restore')));
  assert.deepEqual(recovery.payload.data.routines, [{ id: 'device-copy' }]);
  const current = await account.snapshot();
  assert.equal(current.meta.revision, 4);
  assert.equal(current.meta.dirty, false);
  await assert.rejects(
    account.replaceFromCloud(payload({ routines: 'invalid' }), 5, current.meta.counter),
    /invalid routines/,
  );
  assert.deepEqual(await account.getJSON('routines'), [{ id: 'cloud-copy' }]);
});

test('a failed cloud replacement rolls back exact local media and preserves a queued edit', async () => {
  const waiting = deferred();
  let fail = true;
  const base = memoryStorage(
    {},
    {
      beforeSet: async (key, raw) => {
        if (key === scopedKey('a', 'profileBio') && raw === 'Cloud bio' && fail) {
          await waiting.promise;
          fail = false;
          throw new Error('Storage unavailable');
        }
      },
    },
  );
  const account = createAccountStore(base, 'a');
  const routines = [{ id: 'device', workSong: { id: 'song', uri: 'file:///local.mp3' } }];
  await account.setJSON('routines', routines);
  await account.setString('profileBio', 'Device bio');
  const before = await account.snapshot();
  const restoring = account.replaceFromCloud(
    payload({ routines: [{ id: 'cloud' }], profileBio: 'Cloud bio' }),
    4,
    before.meta.counter,
  );
  await settle();
  const saving = account.setString('profileBio', 'Edit queued during restore');
  waiting.resolve();
  await assert.rejects(restoring, /Storage unavailable/);
  assert.equal(await saving, true);
  assert.deepEqual(await account.getJSON('routines'), routines);
  assert.equal(await account.getString('profileBio'), 'Edit queued during restore');
  const after = await account.snapshot();
  assert.equal(after.meta.revision, before.meta.revision);
  assert.equal(after.meta.counter, before.meta.counter + 1);
  assert.equal(after.meta.dirty, true);
  assert.equal(base.values.has(scopedKey('a', '@cloud-restore-pending')), false);
  const recovery = JSON.parse(base.values.get(scopedKey('a', '@before-cloud-restore')));
  assert.deepEqual(recovery.payload, before.payload);
});

test('a new adapter recovers an interrupted rollback before reading or uploading mixed data', async () => {
  let restoring = false;
  let rollbackBlocked = false;
  const base = memoryStorage(
    {},
    {
      beforeSet: (key, raw) => {
        if (!restoring) return;
        if (key === scopedKey('a', 'profileBio') && raw === 'Cloud bio') {
          rollbackBlocked = true;
          throw new Error('Cloud write failed');
        }
        if (rollbackBlocked) throw new Error('Recovery temporarily unavailable');
      },
    },
  );
  const account = createAccountStore(base, 'a');
  const routines = [{ id: 'device', workSong: { id: 'song', uri: 'content://local-song' } }];
  await account.setJSON('routines', routines);
  await account.setString('profileBio', 'Device bio');
  const before = await account.snapshot();
  restoring = true;
  await assert.rejects(
    account.replaceFromCloud(
      payload({ routines: [{ id: 'cloud' }], profileBio: 'Cloud bio' }),
      4,
      before.meta.counter,
    ),
    /Recovery temporarily unavailable/,
  );
  assert.equal(base.values.has(scopedKey('a', '@cloud-restore-pending')), true);
  const reopened = createAccountStore(base, 'a');
  await assert.rejects(reopened.snapshot(), /Recovery temporarily unavailable/);
  restoring = false;
  assert.deepEqual(await reopened.snapshot(), before);
  assert.deepEqual(await reopened.getJSON('routines'), routines);
  assert.equal(await reopened.getString('profileBio'), 'Device bio');
  assert.equal(base.values.has(scopedKey('a', '@cloud-restore-pending')), false);
});

test('starting a workout partway through replacement rolls back without changing revision', async () => {
  let allowed = true;
  const base = memoryStorage(
    {},
    {
      beforeSet: (key, raw) => {
        if (key === scopedKey('a', 'routines') && raw === '[{"id":"cloud"}]') allowed = false;
      },
    },
  );
  const account = createAccountStore(base, 'a');
  await account.setJSON('routines', [{ id: 'device' }]);
  await account.setString('profileBio', 'Device bio');
  const before = await account.snapshot();
  assert.equal(
    await account.replaceFromCloud(
      payload({ routines: [{ id: 'cloud' }], profileBio: 'Cloud bio' }),
      4,
      before.meta.counter,
      () => allowed,
    ),
    false,
  );
  assert.deepEqual(await account.snapshot(), before);
  assert.equal(await account.getString('profileBio'), 'Device bio');
  assert.equal(base.values.has(scopedKey('a', '@cloud-restore-pending')), false);
});

test('a workout starting during final journal removal rolls back exact values before a queued edit', async () => {
  const reached = deferred();
  const waiting = deferred();
  let allowed = true;
  const base = memoryStorage(
    {},
    {
      beforeRemove: (key) => {
        if (key !== scopedKey('a', '@cloud-restore-pending')) return;
        reached.resolve();
        return waiting.promise;
      },
    },
  );
  const account = createAccountStore(base, 'a');
  const routines = [{ id: 'device', workSong: { id: 'song', uri: 'file:///device-song.mp3' } }];
  await account.setJSON('routines', routines);
  await account.setString('profileBio', 'Device bio');
  const before = await account.snapshot();
  const restoring = account.replaceFromCloud(
    payload({ routines: [{ id: 'cloud' }], profileBio: 'Cloud bio' }),
    4,
    before.meta.counter,
    () => allowed,
  );
  await reached.promise;
  const saving = account.setString('profileBio', 'Edit queued during final commit');
  allowed = false;
  waiting.resolve();
  assert.equal(await restoring, false);
  assert.equal(await saving, true);
  assert.deepEqual(await account.getJSON('routines'), routines);
  assert.equal(await account.getString('profileBio'), 'Edit queued during final commit');
  const after = await account.snapshot();
  assert.deepEqual(after.meta, {
    ...before.meta,
    counter: before.meta.counter + 1,
    dirty: true,
  });
  assert.equal(base.values.has(scopedKey('a', '@cloud-restore-pending')), false);
});

test('deleting an account local cache keeps other accounts and global preferences', async () => {
  const base = memoryStorage({
    [scopedKey('a', 'routines')]: '[]',
    [scopedKey('a', '@syncmeta')]: '{}',
    [scopedKey('b', 'routines')]: '[1]',
    '@syncapp_theme_preference': 'dark',
    '@syncapp_guest_import_cleanup': JSON.stringify({
      userId: 'a',
      entries: [['profileBio', 'Imported bio']],
    }),
    routines: '[2]',
  });
  await clearAccountStore(base, 'a');
  assert.equal(base.values.has(scopedKey('a', 'routines')), false);
  assert.equal(base.values.has(scopedKey('a', '@syncmeta')), false);
  assert.equal(base.values.get(scopedKey('b', 'routines')), '[1]');
  assert.equal(base.values.get('@syncapp_theme_preference'), 'dark');
  assert.equal(base.values.has('@syncapp_guest_import_cleanup'), false);
  assert.equal(base.values.get('routines'), '[2]');
  await assert.rejects(clearAccountStore(base, null), /account is required/);
});

test('cloud metadata keeps local audio only for matching routine, round and song identities', async () => {
  const account = createAccountStore(memoryStorage(), 'a');
  await account.setJSON('routines', [
    {
      id: 'r1',
      name: 'Device title',
      roundsData: [
        { roundNumber: 1, workSong: { id: 'one', uri: 'file:///one.mp3', platform: 'device' } },
        { roundNumber: 2, workSong: { id: 'two', uri: 'content://two', platform: 'device' } },
      ],
    },
    {
      id: 'r2',
      roundsData: [
        { roundNumber: 1, workSong: { id: 'three', uri: 'file:///three.mp3', platform: 'device' } },
      ],
    },
  ]);
  const before = await account.snapshot();
  const cloud = payload({
    routines: [
      {
        id: 'r2',
        roundsData: [{ roundNumber: 1, workSong: { id: 'three', uri: null, platform: 'device' } }],
      },
      {
        id: 'r1',
        name: 'New cloud title',
        roundsData: [
          { roundNumber: 2, workSec: 90, workSong: { id: 'two', uri: null, platform: 'device' } },
          { roundNumber: 1, workSec: 75, workSong: { id: 'one', uri: null, platform: 'device' } },
        ],
      },
    ],
  });
  await account.replaceFromCloud(cloud, 2, before.meta.counter);
  const restored = await account.getJSON('routines');
  assert.equal(restored[0].roundsData[0].workSong.uri, 'file:///three.mp3');
  assert.equal(restored[1].name, 'New cloud title');
  assert.equal(restored[1].roundsData[0].roundNumber, 2);
  assert.equal(restored[1].roundsData[0].workSec, 90);
  assert.equal(restored[1].roundsData[0].workSong.uri, 'content://two');
  assert.equal(restored[1].roundsData[1].workSong.uri, 'file:///one.mp3');
  // Reattached references remain private to this device on the next upload.
  const nextUpload = await account.snapshot();
  assert.equal(JSON.stringify(nextUpload.payload).includes('file:///'), false);
  assert.equal(JSON.stringify(nextUpload.payload).includes('content://'), false);
});

test('a changed song or missing track identity cannot inherit the previous local file', async () => {
  const account = createAccountStore(memoryStorage(), 'a');
  await account.setJSON('routines', [
    {
      id: 'r1',
      roundsData: [
        { roundNumber: 1, workSong: { id: 'old', uri: 'file:///wrong.mp3', platform: 'device' } },
        { roundNumber: 2, workSong: { id: 'missing-cloud-id', uri: 'file:///also-wrong.mp3' } },
        {
          roundNumber: 3,
          workSong: { id: 'same-id', uri: 'file:///source-changed.mp3', platform: 'device' },
        },
      ],
    },
  ]);
  const before = await account.snapshot();
  await account.replaceFromCloud(
    payload({
      routines: [
        {
          id: 'r1',
          roundsData: [
            { roundNumber: 1, workSong: { id: 'new', uri: null, platform: 'device' } },
            { roundNumber: 2, workSong: { uri: null } },
            { roundNumber: 3, workSong: { id: 'same-id', uri: null, platform: 'spotify' } },
          ],
        },
      ],
    }),
    2,
    before.meta.counter,
  );
  const rounds = (await account.getJSON('routines'))[0].roundsData;
  assert.equal(rounds[0].workSong.uri, null);
  assert.equal(rounds[1].workSong.uri, null);
  assert.equal(rounds[2].workSong.uri, null);
});

test('explicitly removed music stays removed and new-device restores do not invent files', async () => {
  const account = createAccountStore(memoryStorage(), 'a');
  await account.setJSON('routines', [
    { id: 'r1', roundsData: [{ roundNumber: 1, workSong: { id: 'old', uri: 'file:///old.mp3' } }] },
  ]);
  const before = await account.snapshot();
  await account.replaceFromCloud(
    payload({
      routines: [
        { id: 'r1', roundsData: [{ roundNumber: 1, workSong: null }] },
        { id: 'new-routine', roundsData: [{ roundNumber: 1, workSong: { id: 'old', uri: null } }] },
      ],
    }),
    2,
    before.meta.counter,
  );
  const restored = await account.getJSON('routines');
  assert.equal(restored[0].roundsData[0].workSong, null);
  assert.equal(restored[1].roundsData[0].workSong.uri, null);
});

test('account deletion drains its old write without blocking another account and prevents resurrection', async () => {
  const pending = deferred();
  const base = memoryStorage(
    {},
    { beforeSet: (key) => (key === scopedKey('a', 'profileBio') ? pending.promise : undefined) },
  );
  const a = createAccountStore(base, 'a');
  const b = createAccountStore(base, 'b');
  const oldWrite = a.setString('profileBio', 'Old pending data');
  await settle();
  const deletion = clearAccountStore(base, 'a');
  // The tombstone is synchronous, and the second account has an independent queue.
  await b.setString('profileBio', 'Account B remains usable');
  assert.equal(await b.getString('profileBio'), 'Account B remains usable');
  const staleWrite = a.setString('profileBio', 'Resurrected data');
  pending.resolve();
  await Promise.all([oldWrite, deletion]);
  assert.equal(await staleWrite, false);
  assert.equal(await a.getString('profileBio'), null);
  assert.equal(
    [...base.values.keys()].some((key) => key.startsWith('@syncapp/account/a/')),
    false,
  );
  assert.equal(await b.getString('profileBio'), 'Account B remains usable');
});

test('new adapters cannot reopen a deleted user scope and cloud/import callbacks are rejected', async () => {
  const base = memoryStorage({ routines: JSON.stringify([{ id: 'guest' }]) });
  const oldAdapter = createAccountStore(base, 'a');
  await clearAccountStore(base, 'a');
  const remounted = createAccountStore(base, 'a');
  assert.equal(await remounted.setJSON('routines', [{ id: 'resurrected' }]), false);
  await assert.rejects(oldAdapter.replaceFromCloud(payload({ routines: [] }), 2, 0), /deleted/);
  await assert.rejects(oldAdapter.markSynced(2, 0), /deleted/);
  await assert.rejects(remounted.importGuestData(), /deleted/);
  assert.equal(base.values.get('routines'), JSON.stringify([{ id: 'guest' }]));
  assert.equal(
    [...base.values.keys()].some((key) => key.startsWith('@syncapp/account/a/')),
    false,
  );
});

function platformStorageWith(native) {
  // Exercise the actual platform adapter while replacing the unavailable native
  // bridge. Babel only changes module syntax; application operations are intact.
  const source = readFileSync(new URL('../src/lib/platformStorage.js', import.meta.url), 'utf8');
  const compiled = transformSync(source, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (id === 'react-native') return { Platform: { OS: 'ios' } };
      if (id === 'expo-secure-store') return native;
      if (id === './storage')
        return {
          __esModule: true,
          default: { setJSON: async () => true, getJSON: async () => ({}) },
          STORAGE_KEYS: { CONNECTED_PLATFORMS: 'connectedPlatforms' },
        };
      throw new Error(`Unexpected module: ${id}`);
    },
  });
  return exports;
}

test('deleting platform credentials waits for an old native write then rejects late refreshes', async () => {
  const pending = deferred();
  const values = new Map();
  const adapter = platformStorageWith({
    setItemAsync: async (key, value) => {
      await pending.promise;
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    getItemAsync: async (key) => values.get(key) ?? null,
  });
  const oldSave = adapter.savePlatforms(
    { spotify: { accessToken: 'old-token' } },
    { accountId: 'a' },
  );
  await settle();
  const deletion = adapter.clearAccountPlatforms('a');
  const lateSave = adapter.savePlatforms(
    { spotify: { accessToken: 'late-token' } },
    { accountId: 'a' },
  );
  // Attach the rejection handler before completing the queue.
  const rejected = assert.rejects(lateSave, /deleted/);
  pending.resolve();
  await Promise.all([oldSave, deletion, rejected]);
  assert.equal(values.has('syncapp.music.credentials.a'), false);
  await assert.rejects(adapter.loadPlatforms({ accountId: 'a' }), /deleted/);
});

test('one account token queue never blocks another account and explicit invalidation is immediate', async () => {
  const pending = deferred();
  const values = new Map();
  const adapter = platformStorageWith({
    setItemAsync: async (key, value) => {
      if (key.endsWith('.a')) await pending.promise;
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    getItemAsync: async (key) => values.get(key) ?? null,
  });
  const a = adapter.savePlatforms({ spotify: { accessToken: 'a-token' } }, { accountId: 'a' });
  await settle();
  await adapter.savePlatforms({ spotify: { accessToken: 'b-token' } }, { accountId: 'b' });
  assert.equal(
    JSON.parse(values.get('syncapp.music.credentials.b')).spotify.accessToken,
    'b-token',
  );
  adapter.invalidateAccountPlatforms('a');
  const later = assert.rejects(adapter.savePlatforms({}, { accountId: 'a' }), /deleted/);
  pending.resolve();
  await Promise.all([a, later, adapter.clearAccountPlatforms('a')]);
  assert.equal(values.has('syncapp.music.credentials.a'), false);
  assert.equal(values.has('syncapp.music.credentials.b'), true);
});
