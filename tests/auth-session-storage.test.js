import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';

function secureStore() {
  const data = new Map();
  let failWrite = null;
  const writes = [];
  return {
    data,
    writes,
    failNextWrite(predicate) {
      failWrite = predicate;
    },
    async getItemAsync(key) {
      return data.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (failWrite?.(key, value)) {
        failWrite = null;
        throw new Error('Secure storage is unavailable');
      }
      // Native storage passes text through UTF-8. In particular, lone UTF-16
      // surrogates cannot survive this boundary as they do in a plain JS Map.
      const encoded = Buffer.from(value, 'utf8');
      if (encoded.length > 2048) throw new Error('Native value exceeds 2KB');
      writes.push({ key, bytes: encoded.length });
      data.set(key, encoded.toString('utf8'));
    },
    async deleteItemAsync(key) {
      data.delete(key);
    },
  };
}

function savedManifest(store) {
  for (const [key, raw] of store.data) {
    try {
      const value = JSON.parse(raw);
      if (Array.isArray(value.chunks)) return { key, value, raw };
      if (typeof value.prefix === 'string' && Number.isInteger(value.count) && value.count >= 0) {
        return {
          key,
          value: {
            ...value,
            chunks: Array.from({ length: value.count }, (_, index) => `${value.prefix}.${index}`),
          },
          raw,
        };
      }
    } catch {
      /* A chunk is not necessarily a complete JSON value. */
    }
  }
  throw new Error('No committed manifest');
}

test('large Unicode sessions round-trip exactly through native UTF-8 storage', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  const prefix = '{"user":{"bio":"';
  const session = JSON.stringify({
    user: { bio: `${'a'.repeat(399 - prefix.length)}😀${'İstanbul 🏃🏽‍♀️ 東京'.repeat(160)}` },
    access_token: 'jwt'.repeat(1100),
  });
  assert.equal(session.indexOf('😀'), 399, 'Exercise an emoji spanning the former chunk boundary');
  await storage.setItem('sb-project-auth-token', session);
  assert.ok(
    (await storage.getItem('sb-project-auth-token')) === session,
    'Stored session must preserve every Unicode code point',
  );
  assert.ok(savedManifest(native).value.chunks.length > 1);
  assert.ok(native.writes.every(({ bytes }) => bytes <= 2048));
});

test('a roughly 40k-character Unicode session keeps its manifest within native limits', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  const session = JSON.stringify({
    access_token: 'jwt',
    user: { bio: '😀東京İstanbul'.repeat(3500) },
  });
  assert.ok(session.length >= 40000);
  await storage.setItem('sb-project-auth-token', session);
  assert.ok(
    (await storage.getItem('sb-project-auth-token')) === session,
    'Large sessions must round-trip without data loss',
  );
  const saved = savedManifest(native);
  assert.ok(
    saved.value.chunks.length > 50,
    'Exercise enough chunks to exceed an array manifest’s native size limit',
  );
  assert.ok(Buffer.byteLength(saved.raw, 'utf8') <= 2048);
  assert.ok(native.writes.every(({ bytes }) => bytes <= 2048));
});

test('failed chunk writes keep the previous session and clean partial new chunks', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  await storage.setItem('session', 'previous-session');
  const previous = new Map(native.data);
  let attempts = 0;
  native.failNextWrite(() => ++attempts === 2);
  await assert.rejects(storage.setItem('session', 'new-session'.repeat(160)), /unavailable/);
  assert.equal(await storage.getItem('session'), 'previous-session');
  assert.deepEqual(native.data, previous);
  // The serial queue must recover after an unsuccessful native operation.
  await storage.setItem('session', 'next-successful-session');
  assert.equal(await storage.getItem('session'), 'next-successful-session');
});

test('a failed manifest commit never replaces the previously committed session', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  await storage.setItem('session', 'old-session'.repeat(90));
  const old = savedManifest(native);
  const previous = new Map(native.data);
  native.failNextWrite((key) => key === old.key);
  await assert.rejects(
    storage.setItem('session', 'replacement-session'.repeat(100)),
    /unavailable/,
  );
  assert.equal(native.data.get(old.key), old.raw);
  assert.equal(await storage.getItem('session'), 'old-session'.repeat(90));
  assert.deepEqual(native.data, previous);
});

test('sign-out removes both the committed manifest and all current session chunks', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  await storage.setItem('session', 'sensitive-session'.repeat(200));
  assert.ok(native.data.size > 2);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(native.data.size, 0);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
});

test('overwriting a session retires old chunks without affecting another auth key', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  await storage.setItem('session', 'first-session'.repeat(180));
  const oldChunks = savedManifest(native).value.chunks;
  await storage.setItem('pkce-verifier', 'verifier');
  await storage.setItem('session', 'replacement');
  assert.ok(oldChunks.every((key) => !native.data.has(key)));
  assert.equal(await storage.getItem('session'), 'replacement');
  assert.equal(await storage.getItem('pkce-verifier'), 'verifier');
  await storage.removeItem('session');
  assert.equal(await storage.getItem('pkce-verifier'), 'verifier');
});

test('missing native chunks fail closed instead of returning a partial token', async () => {
  const native = secureStore();
  const storage = createAuthSessionStorage(native);
  await storage.setItem('session', 'token'.repeat(200));
  native.data.delete(savedManifest(native).value.chunks[0]);
  assert.equal(await storage.getItem('session'), null);
});
