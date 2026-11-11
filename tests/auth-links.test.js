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

test('provider errors take precedence over a supplied code', () => {
  assert.deepEqual(parseAuthLink(`${AUTH_REDIRECT}?error=access_denied&code=unused`), {
    error: 'access_denied',
  });
  assert.deepEqual(parseAuthLink(`${RECOVERY_REDIRECT}?error_description=Expired%20link`), {
    error: 'Expired link',
  });
});
