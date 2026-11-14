import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createAppleTokenService,
  appleSubject,
} from '../supabase/functions/_shared/apple-revocation.js';

const UID = '10101010-1010-4010-8010-101010101010';
const appleUser = (id = UID) => ({
  id,
  identities: [{ provider: 'apple', identity_data: { sub: 'apple-subject' } }],
});
const time = 1800000000000;
const enc = new TextEncoder();
const b64 = (value) => Buffer.from(value).toString('base64url');
const json = (value) => b64(JSON.stringify(value));
const signing = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const appleSigning = await webcrypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('pkcs8', signing.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const appleKey = {
  ...(await webcrypto.subtle.exportKey('jwk', appleSigning.publicKey)),
  kid: 'apple-test-key',
  alg: 'RS256',
  use: 'sig',
};
async function fixture(options = {}) {
  const calls = [];
  let record = options.record || null;
  const env = {
    APPLE_AUTH_CLIENT_ID: 'com.feridun.syncapp',
    APPLE_AUTH_TEAM_ID: 'TEAM123456',
    APPLE_AUTH_KEY_ID: 'KEY1234567',
    APPLE_AUTH_PRIVATE_KEY: pem,
    APPLE_TOKEN_ENCRYPTION_KEY: b64(new Uint8Array(32).fill(7)),
    ...options.env,
  };
  const claims = {
    iss: 'https://appleid.apple.com',
    aud: 'com.feridun.syncapp',
    sub: 'apple-subject',
    iat: time / 1000,
    exp: time / 1000 + 300,
    ...options.claims,
  };
  const input = `${json({ alg: 'RS256', kid: 'apple-test-key' })}.${json(claims)}`;
  const signature = await webcrypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    appleSigning.privateKey,
    enc.encode(input),
  );
  const idToken = `${input}.${b64(signature)}`;
  const service = createAppleTokenService({
    env: (key) => env[key],
    cryptoImpl: webcrypto,
    now: () => time,
    fetcher: async (url, init) => {
      calls.push([url, init]);
      assert.equal(init.redirect, 'error');
      if (url.endsWith('/auth/keys')) return new Response(JSON.stringify({ keys: [appleKey] }));
      const request = new URLSearchParams(init.body);
      assert.equal(request.get('client_id'), 'com.feridun.syncapp');
      const secret = request.get('client_secret').split('.');
      assert.deepEqual(JSON.parse(Buffer.from(secret[0], 'base64url')), {
        alg: 'ES256',
        kid: env.APPLE_AUTH_KEY_ID,
      });
      const secretClaims = JSON.parse(Buffer.from(secret[1], 'base64url'));
      assert.equal(secretClaims.exp - secretClaims.iat, 300);
      assert.equal(secretClaims.sub, env.APPLE_AUTH_CLIENT_ID);
      assert.equal(
        await webcrypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          signing.publicKey,
          Buffer.from(secret[2], 'base64url'),
          enc.encode(`${secret[0]}.${secret[1]}`),
        ),
        true,
      );
      if (url.endsWith('/auth/revoke')) {
        assert.equal(request.get('token'), 'synthetic-apple-refresh-token');
        assert.equal(request.get('token_type_hint'), 'refresh_token');
        return new Response(null, { status: options.revokeFailure ? 503 : 200 });
      }
      assert.equal(request.get('grant_type'), 'authorization_code');
      assert.equal(request.get('code'), 'one-use-code');
      return new Response(
        JSON.stringify({
          id_token: options.badSignature ? `${input}.${b64(new Uint8Array(256))}` : idToken,
          refresh_token: 'synthetic-apple-refresh-token',
        }),
        { status: options.exchangeFailure ? 400 : 200 },
      );
    },
  });
  const admin = {
    rpc: async (name, args) => {
      if (name === 'store_apple_revocation_token') {
        record = {
          apple_subject: args.target_apple_subject,
          client_id: args.target_client_id,
          sealed_token: args.sealed_token,
        };
        return { error: null };
      }
      assert.equal(name, 'get_apple_revocation_token');
      return { data: record, error: null };
    },
  };
  return { service, admin, calls, record: () => record };
}

test('real WebCrypto exchanges a code, verifies Apple RSA identity, encrypts at rest, and revokes with a signed ES256 client secret', async () => {
  const h = await fixture();
  await h.service.register(h.admin, appleUser(), 'one-use-code');
  assert.equal(JSON.stringify(h.record()).includes('synthetic-apple-refresh-token'), false);
  assert.equal(JSON.stringify(h.record()).includes('one-use-code'), false);
  assert.equal(h.record().sealed_token.version, 1);
  assert.deepEqual(await h.service.revokeForDeletion(h.admin, appleUser()), { status: 'revoked' });
  assert.deepEqual(
    h.calls.map(([url]) => url),
    [
      'https://appleid.apple.com/auth/token',
      'https://appleid.apple.com/auth/keys',
      'https://appleid.apple.com/auth/revoke',
    ],
  );
});

test('authoritative identities, not user-editable metadata, bind registration', async () => {
  const h = await fixture();
  const metadataOnly = { id: UID, user_metadata: { provider: 'apple', sub: 'apple-subject' } };
  assert.equal(appleSubject(metadataOnly), null);
  await assert.rejects(h.service.register(h.admin, metadataOnly, 'one-use-code'));
  assert.equal(h.calls.length, 0);
});

test('wrong subject, audience, issuer, expiry or Apple signature cannot store a token', async () => {
  for (const options of [
    { claims: { sub: 'other-apple-user' } },
    { claims: { aud: 'other-client' } },
    { claims: { iss: 'https://attacker.invalid' } },
    { claims: { exp: time / 1000 - 1 } },
    { badSignature: true },
    { exchangeFailure: true },
  ]) {
    const h = await fixture(options);
    await assert.rejects(h.service.register(h.admin, appleUser(), 'one-use-code'));
    assert.equal(h.record(), null);
  }
});

test('ciphertext cannot be replayed across UIDs/subjects/clients and tampering never reaches Apple revoke', async () => {
  const h = await fixture();
  await h.service.register(h.admin, appleUser(), 'one-use-code');
  const stored = h.record();
  for (const record of [
    stored,
    { ...stored, apple_subject: 'different-subject' },
    { ...stored, client_id: 'different-client' },
    { ...stored, sealed_token: { ...stored.sealed_token, ciphertext: b64(new Uint8Array(60)) } },
  ]) {
    const attack = await fixture({ record });
    const result = await attack.service.revokeForDeletion(
      attack.admin,
      appleUser('20202020-2020-4020-8020-202020202020'),
    );
    assert.equal(result.status, 'manual_required');
    assert.equal(attack.calls.length, 0);
    assert.equal(JSON.stringify(result).includes('synthetic-apple-refresh-token'), false);
  }
});

test('missing configuration never consumes the one-use code and missing token/outage gives sanitized manual deletion fallback', async () => {
  const missing = await fixture({ env: { APPLE_TOKEN_ENCRYPTION_KEY: undefined } });
  await assert.rejects(missing.service.register(missing.admin, appleUser(), 'one-use-code'));
  assert.equal(missing.calls.length, 0);
  assert.equal(
    (await missing.service.revokeForDeletion(missing.admin, appleUser())).status,
    'manual_required',
  );
  const legacy = await fixture();
  assert.equal(
    (await legacy.service.revokeForDeletion(legacy.admin, appleUser())).status,
    'manual_required',
  );
  const outage = await fixture({ revokeFailure: true });
  await outage.service.register(outage.admin, appleUser(), 'one-use-code');
  const result = await outage.service.revokeForDeletion(outage.admin, appleUser());
  assert.equal(result.status, 'manual_required');
  assert.match(result.message, /Your Sync account was deleted/);
  assert.equal(result.url, 'https://support.apple.com/102571');
  assert.deepEqual(await outage.service.revokeForDeletion(outage.admin, { id: UID }), {
    status: 'not_required',
  });
});
