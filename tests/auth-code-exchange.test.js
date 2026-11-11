import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createAuthSessionStorage } from '../src/lib/authSessionStorage.js';
import { parseAuthLink, RECOVERY_REDIRECT } from '../src/lib/authLinks.js';
import { authExchangeDiagnostic, createAuthCodeExchanger } from '../src/lib/authCodeExchange.js';
const require = createRequire(import.meta.url);
const { GoTrueClient } = require('@supabase/auth-js');

// Real installed auth-js + real chunked storage adapter, with memory-only native
// storage and an injected fake HTTP transport. No device or network is accessed.
function setup(failedRecoverCalls = []) {
  const data = new Map();
  const secureStore = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
  const flows = new Map();
  let resets = 0;
  let tokenCalls = 0;
  const response = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    });
  const auth = new GoTrueClient({
    url: 'https://offline-test.invalid/auth/v1',
    storageKey: 'offline-pkce-test',
    storage: createAuthSessionStorage(secureStore),
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    experimental: { appendPkceFlowIdToRedirects: true },
    fetch: async (input, init) => {
      const url = new URL(input);
      const body = JSON.parse(init.body);
      if (url.pathname.endsWith('/recover')) {
        resets++;
        if (failedRecoverCalls.includes(resets))
          return response(
            { code: 'over_email_send_rate_limit', msg: 'Wait before requesting another reset.' },
            429,
          );
        const redirect = new URL(url.searchParams.get('redirect_to'));
        const flowId = redirect.searchParams.get('sb_flow_id');
        assert.match(flowId, /^[0-9a-f]{32}$/);
        flows.set(flowId, { challenge: body.code_challenge, method: body.code_challenge_method });
        return response({});
      }
      if (url.pathname.endsWith('/token')) {
        tokenCalls++;
        const flowId = body.auth_code.replace('offline-code-', '');
        const expected = flows.get(flowId);
        const actual =
          expected?.method === 's256'
            ? createHash('sha256').update(body.code_verifier).digest('base64url')
            : body.code_verifier;
        if (!expected || actual !== expected.challenge)
          return response({ code: 'bad_code_verifier', msg: 'Verifier does not match.' }, 400);
        const payload = Buffer.from(
          JSON.stringify({
            sub: '10101010-1010-4010-8010-101010101010',
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString('base64url');
        return response({
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.offline-signature`,
          refresh_token: 'offline-test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: '10101010-1010-4010-8010-101010101010' },
        });
      }
      assert.fail('Unexpected endpoint; no real HTTP request is permitted.');
    },
  });
  const exchange = createAuthCodeExchanger({ auth });
  return {
    auth,
    exchange,
    flows,
    data,
    get tokenCalls() {
      return tokenCalls;
    },
    callback: (flowId) =>
      parseAuthLink(`${RECOVERY_REDIRECT}?code=offline-code-${flowId}&sb_flow_id=${flowId}`),
  };
}

test('clean recovery stores its verifier securely and emits recovery after exchanging its own flow', async () => {
  const app = setup();
  const events = [];
  const listener = app.auth.onAuthStateChange((event) => events.push(event));
  assert.equal(
    (
      await app.auth.resetPasswordForEmail('offline@example.test', {
        redirectTo: RECOVERY_REDIRECT,
      })
    ).error,
    null,
  );
  const flowId = [...app.flows.keys()][0];
  const result = await app.exchange(app.callback(flowId));
  assert.equal(result.session.user.id, '10101010-1010-4010-8010-101010101010');
  assert.ok(events.includes('PASSWORD_RECOVERY'));
  assert.equal(app.tokenCalls, 1);
  listener.data.subscription.unsubscribe();
});

test('overlapping successful reset requests exchange each callback with its own original verifier', async () => {
  const app = setup();
  await app.auth.resetPasswordForEmail('offline@example.test', { redirectTo: RECOVERY_REDIRECT });
  await app.auth.resetPasswordForEmail('offline@example.test', { redirectTo: RECOVERY_REDIRECT });
  const [earlier, later] = [...app.flows.keys()];
  assert.notEqual(earlier, later);
  await app.exchange(app.callback(earlier));
  await app.exchange(app.callback(later));
  assert.equal(app.tokenCalls, 2);
});

test('a later rate-limited reset cannot strand the earlier emailed callback even after recreating the client-side exchanger', async () => {
  const app = setup([2]);
  await app.auth.resetPasswordForEmail('offline@example.test', { redirectTo: RECOVERY_REDIRECT });
  const earlier = [...app.flows.keys()][0];
  const failed = await app.auth.resetPasswordForEmail('offline@example.test', {
    redirectTo: RECOVERY_REDIRECT,
  });
  assert.equal(failed.error.status, 429);
  const recreatedExchange = createAuthCodeExchanger({ auth: app.auth });
  await recreatedExchange(app.callback(earlier));
  assert.equal(app.tokenCalls, 1);
});

test('duplicate delivery shares one exchange and legacy callbacks preserve their SDK call shape', async () => {
  const calls = [];
  let finish;
  const exchange = createAuthCodeExchanger({
    auth: {
      exchangeCodeForSession: (code, options) => {
        calls.push({ code, options });
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  const legacy = parseAuthLink(`${RECOVERY_REDIRECT}?code=legacy-code`);
  const first = exchange(legacy);
  assert.equal(exchange(legacy), first);
  finish({ data: { session: {} }, error: null });
  await first;
  assert.equal(exchange(legacy), first);
  assert.deepEqual(calls, [{ code: 'legacy-code', options: undefined }]);
});

test('an invalid explicit flow never calls the SDK or falls back to a different verifier', async () => {
  const exchange = createAuthCodeExchanger({
    auth: { exchangeCodeForSession: () => assert.fail('Invalid flow must not exchange') },
  });
  await assert.rejects(exchange({ code: 'code', flowId: '' }), /Invalid account callback/);
});

test('a missing valid flow slot does not borrow or delete a pending flow verifier', async () => {
  const app = setup();
  await app.auth.resetPasswordForEmail('offline@example.test', { redirectTo: RECOVERY_REDIRECT });
  const pending = [...app.flows.keys()][0];
  const absent = pending === '0'.repeat(32) ? '1'.repeat(32) : '0'.repeat(32);
  await assert.rejects(app.exchange(app.callback(absent)), {
    name: 'AuthPKCECodeVerifierMissingError',
    code: 'pkce_code_verifier_not_found',
  });
  assert.equal(app.tokenCalls, 0);
  await app.exchange(app.callback(pending));
  assert.equal(app.tokenCalls, 1);
});

test('developer diagnostics retain only allowlisted metadata, never messages or callback secrets', () => {
  assert.deepEqual(
    authExchangeDiagnostic({
      name: 'AuthApiError',
      code: 'bad_code_verifier',
      status: 400,
      message: 'private-code-and-token',
    }),
    { name: 'AuthApiError', code: 'bad_code_verifier', status: 400 },
  );
  assert.deepEqual(
    authExchangeDiagnostic({
      name: 'private-token',
      code: 'private-verifier',
      status: 'private-value',
      message: 'private-callback',
    }),
    { name: 'AuthError', code: 'unknown', status: null },
  );
});
