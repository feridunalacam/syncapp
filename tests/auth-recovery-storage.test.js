import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRecoveryStorage } from '../src/lib/authRecoveryStorage.js';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';
const key = 'offline-recovery';
const flow = 'a'.repeat(32);
const slot = `${key}-flow-${flow}-code-verifier`;
const pending = JSON.stringify('synthetic-pkce/recovery');
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(options = {}) {
  const values = new Map();
  const storage = {
    getItem: async (name) => values.get(name) ?? null,
    setItem: async (name, value) => {
      await options.write?.(name, value);
      values.set(name, value);
    },
    removeItem: async (name) => values.delete(name),
  };
  return {
    values,
    storage,
    make: (extra) => createAuthRecoveryStorage({ storage, storageKey: key, ...extra }),
  };
}

test('only encrypted PKCE state survives recreation; session and user slots stay transient', async () => {
  const records = new Map();
  const native = createAuthSessionStorage({
    getItemAsync: async (name) => records.get(name) ?? null,
    setItemAsync: async (name, value) => records.set(name, value),
    deleteItemAsync: async (name) => records.delete(name),
  });
  const recovery = createAuthRecoveryStorage({ storage: native, storageKey: key });
  await recovery.run(async () => {
    await recovery.storage.setItem(slot, pending);
    await recovery.storage.setItem(
      key,
      JSON.stringify({
        access_token: 'SECONDARY-SESSION-MUST-NOT-PERSIST',
        refresh_token: 'SECONDARY-REFRESH',
      }),
    );
    await recovery.storage.setItem(key + '-user', JSON.stringify({ id: 'TRANSIENT-USER' }));
    assert.ok(await recovery.storage.getItem(key));
  });
  assert.ok(
    ![...records.values()].some(
      (value) => value.includes('SECONDARY-') || value.includes('TRANSIENT-USER'),
    ),
  );
  const cold = createAuthRecoveryStorage({ storage: native, storageKey: key });
  assert.equal(await cold.storage.getItem(key), null);
  await cold.run(async () => assert.equal(await cold.hasFlow(flow), true));
});

test('expired recovery verifiers are denied and removed from encrypted backing state', async () => {
  let now = 1000;
  const f = fixture();
  const r = f.make({ now: () => now, maxAgeMs: 1000 });
  await r.run(() => r.storage.setItem(slot, pending));
  now = 2001;
  await r.run(async () => assert.equal(await r.hasFlow(flow), false));
  assert.ok(![...f.values.values()].some((value) => value.includes('synthetic-pkce')));
});

test('explicit invalidation drains an in-flight encrypted write and prevents cold replay', async () => {
  const reached = defer(),
    release = defer();
  let hold = true;
  const f = fixture({
    write: async () => {
      if (hold) {
        reached.resolve();
        await release.promise;
        hold = false;
      }
    },
  });
  const r = f.make();
  const writing = r.run(() => r.storage.setItem(slot, pending));
  const failure = assert.rejects(writing, /cancelled/);
  await reached.promise;
  const cleared = r.invalidate();
  release.resolve();
  await failure;
  await cleared;
  const cold = f.make();
  await cold.run(async () => assert.equal(await cold.hasFlow(flow), false));
  assert.ok(![...f.values.values()].some((value) => value.includes('synthetic-pkce')));
});

test('a durable cancellation epoch fences another coordinator already holding an older lease', async () => {
  const f = fixture();
  const first = f.make(),
    second = f.make();
  const reached = defer(),
    release = defer();
  await first.run(() => first.storage.setItem(slot, pending));
  const held = first.run(async () => {
    assert.equal(await first.hasFlow(flow), true);
    reached.resolve();
    await release.promise;
  });
  const failure = assert.rejects(held, /cancelled/);
  await reached.promise;
  await second.invalidate();
  release.resolve();
  await failure;
});

test('suspending a provider aborts its transport but keeps pending links for cold launch', async () => {
  const f = fixture(),
    r = f.make();
  await r.run(() => r.storage.setItem(slot, pending));
  const reached = defer(),
    release = defer();
  let signal;
  const held = r.run(async () => {
    signal = r.signal;
    reached.resolve();
    await release.promise;
  });
  const failure = assert.rejects(held, /cancelled/);
  await reached.promise;
  r.suspend();
  assert.equal(signal.aborted, true);
  release.resolve();
  await failure;
  const cold = f.make();
  await cold.run(async () => assert.equal(await cold.hasFlow(flow), true));
});

test('corrupt recovery state fails closed without overwriting the recoverable raw record', async () => {
  const f = fixture();
  f.values.set(key + '.pending.v1', '{corrupt-retain-me');
  await assert.rejects(
    f.make().run(() => assert.fail('must not start SDK')),
    /storage is unavailable/,
  );
  assert.equal(f.values.get(key + '.pending.v1'), '{corrupt-retain-me');
});

test('recovery cleanup never removes a main session or main PKCE namespace', async () => {
  const f = fixture();
  f.values.set('main-auth-session', 'SAVED-MAIN-SESSION');
  f.values.set('main-auth-code-verifier', 'MAIN-PKCE');
  const r = f.make();
  await r.run(() => r.storage.setItem(slot, pending));
  await r.invalidate();
  assert.equal(f.values.get('main-auth-session'), 'SAVED-MAIN-SESSION');
  assert.equal(f.values.get('main-auth-code-verifier'), 'MAIN-PKCE');
});

test('an unsupported storage key cannot persist a second identity or arbitrary data', async () => {
  const f = fixture(),
    r = f.make();
  await assert.rejects(
    r.run(() => r.storage.setItem('unrelated-account', 'private')),
    /storage is unavailable/,
  );
  assert.equal(f.values.size, 0);
});
