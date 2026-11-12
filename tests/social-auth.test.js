import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialAuth } from '../src/lib/socialAuth.js';
import { createAuthOperationQueue } from '../src/lib/authOperations.js';
import { AUTH_REDIRECT, parseAuthLink } from '../src/lib/authLinks.js';

const origin = 'https://fixture.supabase.co';
const flowId = 'a'.repeat(32);
const callback = `${AUTH_REDIRECT}?code=synthetic-code&sb_flow_id=${flowId}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function harness(options = {}) {
  let identity = null;
  const calls = [],
    busy = [];
  const authorizationURL = (provider) => {
    const url = new URL(`${origin}/auth/v1/authorize`);
    url.searchParams.set('provider', provider);
    url.searchParams.set('redirect_to', `${AUTH_REDIRECT}?sb_flow_id=${flowId}`);
    return url.href;
  };
  const controller = createSocialAuth({
    client: {
      auth: {
        signInWithOAuth: async (request) => {
          calls.push(['oauth', request]);
          return { data: { url: options.url || authorizationURL(request.provider) }, error: null };
        },
        signInWithIdToken: async (request) => {
          calls.push(['id-token', request]);
          return { data: { session: { user: { id: 'native-user' } } }, error: null };
        },
      },
    },
    enqueue: createAuthOperationQueue(),
    exchangeCode: async (parsed) => {
      calls.push(['exchange', parsed]);
      identity = 'signed-in';
      return { session: { user: { id: 'browser-user' } } };
    },
    ensureProvider: options.ensureProvider || (async () => {}),
    openSession: options.openSession || (async () => ({ type: 'success', url: callback })),
    signInNativeApple: options.native,
    signInWithIdToken:
      options.signInWithIdToken === null
        ? undefined
        : options.signInWithIdToken ||
          (async (request) => {
            calls.push(['id-token', request]);
            return { data: { session: { user: { id: 'native-user' } } }, error: null };
          }),
    getIdentity: () => identity,
    onBusy: (value) => busy.push(value),
    authorizationOrigin: origin,
  });
  return {
    controller,
    calls,
    busy,
    changeIdentity: (value) => {
      identity = value;
    },
  };
}

test('Google uses PKCE through the configured Supabase origin and exchanges the matching callback once', async () => {
  const h = harness();
  const result = await h.controller.signIn('google');
  assert.equal(result.session.user.id, 'browser-user');
  assert.equal(h.calls[0][1].options.redirectTo, AUTH_REDIRECT);
  assert.equal(h.calls[0][1].options.skipBrowserRedirect, true);
  assert.equal(h.calls[0][1].options.queryParams.prompt, 'select_account');
  assert.equal(h.calls[1][1].flowId, flowId);
  assert.deepEqual(h.busy, ['google', null]);
});

test('native Apple sends the ID token and raw nonce directly to Supabase without opening a browser', async () => {
  const h = harness({
    native: async () => ({ token: 'synthetic-token', nonce: 'synthetic-raw-nonce' }),
  });
  assert.equal((await h.controller.signIn('apple')).session.user.id, 'native-user');
  assert.deepEqual(h.calls, [
    ['id-token', { provider: 'apple', token: 'synthetic-token', nonce: 'synthetic-raw-nonce' }],
  ]);
});

test('Apple falls back to OAuth only when the installed native bridge is unavailable', async () => {
  const h = harness({ native: async () => null });
  await h.controller.signIn('apple');
  assert.equal(h.calls[0][0], 'oauth');
  assert.equal(h.calls[0][1].provider, 'apple');
});

test('native Apple cannot bypass the configured session-lock boundary', async () => {
  const h = harness({
    native: async () => ({ token: 'synthetic-token', nonce: 'synthetic' }),
    signInWithIdToken: null,
  });
  await assert.rejects(h.controller.signIn('apple'), /unavailable/);
  assert.equal(h.calls.length, 0);
});

for (const reason of ['cancelled', 'account changed']) {
  test(`the social controller propagates ${reason} from inside the native session lock`, async () => {
    const entered = deferred(),
      release = deferred();
    let requests = 0;
    const h = harness({
      native: async () => ({ token: 'synthetic', nonce: 'synthetic' }),
      signInWithIdToken: async (_credentials, isCurrent) => {
        entered.resolve();
        await release.promise;
        if (!isCurrent()) return { cancelled: true };
        requests++;
        return { data: { session: {} }, error: null };
      },
    });
    const signingIn = h.controller.signIn('apple');
    await entered.promise;
    if (reason === 'cancelled') h.controller.cancel();
    else h.changeIdentity('other-account');
    release.resolve();
    assert.equal((await signingIn).cancelled, true);
    assert.equal(requests, 0);
    assert.equal(h.calls.length, 0);
  });
}

for (const type of ['cancel', 'dismiss'])
  test(`${type} closes sign-in without an error or a token exchange`, async () => {
    const h = harness({ openSession: async () => ({ type }) });
    assert.equal((await h.controller.signIn('google')).cancelled, true);
    assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0);
    assert.equal(
      (await h.controller.receive(parseAuthLink(callback))).cancelled,
      true,
      'late cancelled callbacks stay retired',
    );
    assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0);
  });

test('cancelled native Apple does not mutate the account or fall back into another prompt', async () => {
  const h = harness({ native: async () => ({ cancelled: true }) });
  assert.equal((await h.controller.signIn('apple')).cancelled, true);
  assert.equal(h.calls.length, 0);
});

test('simultaneous provider buttons cannot overwrite each other’s PKCE verifier', async () => {
  const browser = deferred();
  const h = harness({ openSession: () => browser.promise });
  const first = h.controller.signIn('google');
  await assert.rejects(h.controller.signIn('apple'), /already in progress/);
  browser.resolve({ type: 'cancel' });
  await first;
  assert.equal(h.calls.filter(([name]) => name === 'oauth').length, 1);
});

test('Linking delivery before the browser result shares the same exchange and does not deadlock', async () => {
  const browser = deferred(),
    opened = deferred();
  const h = harness({
    openSession: () => {
      opened.resolve();
      return browser.promise;
    },
  });
  const first = h.controller.signIn('google');
  await opened.promise;
  const delivered = await h.controller.receive(parseAuthLink(callback));
  assert.equal(delivered.session.user.id, 'browser-user');
  browser.resolve({ type: 'success', url: callback });
  await first;
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 1);
});

test('an account change while a browser is open prevents the older sign-in from replacing it', async () => {
  const browser = deferred(),
    opened = deferred();
  const h = harness({
    openSession: () => {
      opened.resolve();
      return browser.promise;
    },
  });
  const first = h.controller.signIn('google');
  await opened.promise;
  h.changeIdentity('new-account');
  browser.resolve({ type: 'success', url: callback });
  assert.equal((await first).cancelled, true);
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0);
});

test('the browser cannot exchange an unrelated flow, a recovery link or a provider error', async () => {
  for (const url of [
    callback.replace(flowId, 'b'.repeat(32)),
    callback.replace('/callback', '/recovery'),
    'https://evil.example/?code=synthetic',
    `${AUTH_REDIRECT}?error_description=private-provider-error`,
  ]) {
    const h = harness({ openSession: async () => ({ type: 'success', url }) });
    await assert.rejects(
      h.controller.signIn('google'),
      (error) => !error.message.includes('private-provider-error'),
    );
    assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0);
  }
});

test('unknown or disabled providers never launch a sign-in prompt', async () => {
  const h = harness({
    ensureProvider: async () => {
      throw new Error('Not available yet');
    },
  });
  await assert.rejects(h.controller.signIn('spotify'), /Unsupported/);
  await assert.rejects(h.controller.signIn('google'), /Not available yet/);
  assert.equal(h.calls.length, 0);
});

test('an untrusted authorization URL is rejected before the browser opens', async () => {
  const h = harness({ url: 'https://evil.example/auth/v1/authorize?provider=google' });
  await assert.rejects(h.controller.signIn('google'), /could not start/);
  assert.equal(h.calls.length, 1);
});

test('unmount cancellation retires the pending flow even if a successful callback arrives later', async () => {
  const browser = deferred(),
    opened = deferred();
  const h = harness({
    openSession: () => {
      opened.resolve();
      return browser.promise;
    },
  });
  const first = h.controller.signIn('google');
  await opened.promise;
  h.controller.cancel();
  browser.resolve({ type: 'success', url: callback });
  assert.equal((await first).cancelled, true);
  assert.equal((await h.controller.receive(parseAuthLink(callback))).cancelled, true);
  assert.equal(h.calls.filter(([name]) => name === 'exchange').length, 0);
});
