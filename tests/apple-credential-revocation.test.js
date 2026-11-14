import test from 'node:test';
import assert from 'node:assert/strict';
import { observeAppleCredentialRevocation } from '../src/lib/appleCredentialRevocation.js';
const uid = '10101010-1010-4010-8010-101010101010';
const sid = '20202020-2020-4020-8020-202020202020';
const session = (id = uid, sessionId = sid) => ({
  user: { id, identities: [{ provider: 'apple', identity_data: { sub: 'apple-subject' } }] },
  access_token: `fake.${Buffer.from(JSON.stringify({ sub: id, session_id: sessionId })).toString('base64url')}.signature`,
});
function fixture({ state = 0, resolveState } = {}) {
  let current = session(),
    listener,
    removed = 0,
    revocations = 0;
  const pending = [];
  const observer = observeAppleCredentialRevocation({
    apple: {
      AppleAuthenticationCredentialState: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2 },
      addRevokeListener: (fn) => {
        listener = fn;
        return { remove: () => removed++ };
      },
      getCredentialStateAsync: async (sub) => {
        assert.equal(sub, 'apple-subject');
        return resolveState ? resolveState() : state;
      },
    },
    getSession: () => current,
    enqueue: (fn) => {
      pending.push(fn);
    },
    onRevoked: async () => revocations++,
  });
  return {
    observer,
    fire: () => listener(),
    change: (next) => {
      current = next;
    },
    flush: async () => {
      for (const fn of pending.splice(0)) await fn();
    },
    revoked: () => revocations,
    removed: () => removed,
  };
}
test('native revoke event checks current Apple credential and queues local sign-out only for revoked/not-found', async () => {
  for (const state of [0, 1, 2]) {
    const h = fixture({ state });
    await h.fire();
    await h.flush();
    assert.equal(h.revoked(), state === 1 ? 0 : 1);
    h.observer.dispose();
    assert.equal(h.removed(), 1);
  }
});
test('account/session change or unmount fences both in-flight OS lookups and queued sign-out', async () => {
  for (const boundary of ['lookup', 'queue', 'unmount', 'apple-identity']) {
    let release;
    const h = fixture({
      resolveState: () =>
        new Promise((done) => {
          release = done;
        }),
    });
    const lookup = h.fire();
    if (boundary === 'lookup') h.change(session(uid, '30303030-3030-4030-8030-303030303030'));
    release(0);
    await lookup;
    if (boundary === 'queue') h.change(null);
    if (boundary === 'apple-identity')
      h.change({ ...session(), user: { id: uid, identities: [] } });
    if (boundary === 'unmount') h.observer.dispose();
    await h.flush();
    assert.equal(h.revoked(), 0);
  }
});
test('OS lookup failure is not revocation; missing native module remains harmless', async () => {
  const h = fixture({
    resolveState: async () => {
      throw new Error('OS unavailable');
    },
  });
  await h.observer.check();
  await h.flush();
  assert.equal(h.revoked(), 0);
  assert.equal(observeAppleCredentialRevocation({ apple: null }), null);
});
