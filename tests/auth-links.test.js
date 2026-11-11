import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_REDIRECT, RECOVERY_REDIRECT, parseAuthLink } from '../src/lib/authLinks.js';

test('only Sync account callback routes can exchange an authorization code', () => {
  for (const link of [
    'syncapp://spotify-callback?code=spotify-code',
    'syncapp://routine/example?code=not-auth',
    'https://auth/callback?code=web-code',
    'otherapp://auth/callback?code=foreign-code',
    'syncapp://auth/not-a-callback?code=wrong-path',
    'syncapp://another-host/callback?code=wrong-host',
    'syncapp://username@auth/callback?code=unexpected-user',
    'syncapp://username:password@auth/recovery?code=unexpected-credentials',
    'syncapp://auth:8081/callback?code=unexpected-port',
    'not a URL',
    null,
    '',
  ])
    assert.equal(parseAuthLink(link), null, String(link));
});

test('PKCE callbacks distinguish sign-in from recovery and preserve decoded code', () => {
  assert.deepEqual(parseAuthLink(`${AUTH_REDIRECT}?code=abc%2B123%3D`), {
    code: 'abc+123=',
    recovery: false,
  });
  assert.deepEqual(parseAuthLink(`${RECOVERY_REDIRECT}?code=recovery-code`), {
    code: 'recovery-code',
    recovery: true,
  });
});

test('implicit-token fragments and missing or empty codes are never exchanged', () => {
  assert.equal(parseAuthLink(AUTH_REDIRECT), null);
  assert.equal(parseAuthLink(`${AUTH_REDIRECT}?code=`), null);
  assert.equal(parseAuthLink(`${AUTH_REDIRECT}#access_token=secret&refresh_token=secret`), null);
});

test('duplicate authorization codes fail closed even when their values match', () => {
  for (const query of ['code=first&code=second', 'code=same&code=same', 'code=&code=second']) {
    assert.deepEqual(parseAuthLink(`${RECOVERY_REDIRECT}?${query}`), {
      error: 'This account link is invalid or has expired. Request a new link.',
    });
  }
});

test('provider errors take precedence over a supplied code', () => {
  assert.deepEqual(parseAuthLink(`${AUTH_REDIRECT}?error=access_denied&code=unused`), {
    error: 'access_denied',
  });
  assert.deepEqual(parseAuthLink(`${RECOVERY_REDIRECT}?error_description=Expired%20link`), {
    error: 'Expired link',
  });
});

test('Supabase fragment recovery errors block code exchange without echoing callback secrets', () => {
  for (const fragment of [
    'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    'error_description=Callback+contains+access_token%3Ddo-not-display',
    'error_code=otp_expired',
  ]) {
    assert.deepEqual(parseAuthLink(`${RECOVERY_REDIRECT}?code=unused#${fragment}`), {
      error: 'This account link is invalid or has expired. Request a new link.',
    });
  }
});

test('query errors retain precedence over fragment errors and foreign fragment routes are ignored', () => {
  assert.deepEqual(
    parseAuthLink(`${AUTH_REDIRECT}?error_description=Query%20error#error=access_denied`),
    { error: 'Query error' },
  );
  for (const route of [
    'https://auth/recovery',
    'syncapp://spotify-callback',
    'syncapp://auth/another-path',
    'syncapp://username@auth/recovery',
  ])
    assert.equal(parseAuthLink(`${route}#error=access_denied&error_code=otp_expired`), null);
});

test('fragment codes and implicit token fragments still cannot create a session', () => {
  assert.equal(parseAuthLink(`${RECOVERY_REDIRECT}#code=fragment-code`), null);
  assert.equal(
    parseAuthLink(`${RECOVERY_REDIRECT}#access_token=private&refresh_token=private&type=recovery`),
    null,
  );
});

test('per-flow PKCE callback preserves only the pinned SDK generated 32-lowercase-hex ID', () => {
  const flowId = '1234567890abcdef1234567890abcdef';
  for (const route of [AUTH_REDIRECT, RECOVERY_REDIRECT]) {
    assert.deepEqual(parseAuthLink(`${route}?sb_flow_id=${flowId}&code=flow-code`), {
      code: 'flow-code',
      recovery: route === RECOVERY_REDIRECT,
      flowId,
    });
  }
});

test('malformed or duplicate flow IDs fail closed instead of borrowing the legacy verifier', () => {
  const flowId = '1234567890abcdef1234567890abcdef';
  for (const invalid of [
    '',
    'short',
    'a'.repeat(31),
    'a'.repeat(33),
    'g'.repeat(32),
    'A'.repeat(32),
    '../private',
    `${flowId}/other`,
  ]) {
    assert.deepEqual(
      parseAuthLink(`${RECOVERY_REDIRECT}?code=code&sb_flow_id=${encodeURIComponent(invalid)}`),
      {
        error: 'This account link is invalid or has expired. Request a new link.',
      },
    );
  }
  for (const duplicate of [flowId, 'abcdef1234567890abcdef1234567890']) {
    assert.deepEqual(
      parseAuthLink(`${RECOVERY_REDIRECT}?code=code&sb_flow_id=${flowId}&sb_flow_id=${duplicate}`),
      {
        error: 'This account link is invalid or has expired. Request a new link.',
      },
    );
  }
});
