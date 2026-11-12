// Apple credentials never leave this server-only module in plaintext. All
// network destinations are constants; no client-supplied URL/client ID is used.
const APPLE_ISSUER = 'https://appleid.apple.com';
const CLIENT_ID = 'com.feridun.syncapp';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const APPLE_REVOCATION_HELP_URL = 'https://support.apple.com/102571';
export const appleManualRevocation = () => ({
  status: 'manual_required',
  url: APPLE_REVOCATION_HELP_URL,
  message:
    'Your Sync account was deleted. To also stop Sign in with Apple, open Settings, tap your name, Sign in with Apple, then Sync, and delete its connection. You can also follow Apple’s instructions below.',
});
export function appleSubject(user) {
  const identities = user?.identities?.filter((identity) => identity.provider === 'apple') || [];
  if (identities.length !== 1) return null;
  const subject = identities[0].identity_data?.sub;
  return typeof subject === 'string' && subject.length > 0 && subject.length <= 255
    ? subject
    : null;
}
export function hasAppleIdentity(user) {
  return Boolean(
    appleSubject(user) ||
      user?.identities?.some((identity) => identity.provider === 'apple') ||
      user?.app_metadata?.providers?.includes('apple'),
  );
}
function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Invalid encoding.');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
    char.charCodeAt(0),
  );
}
const jsonPart = (value) => encode(encoder.encode(JSON.stringify(value)));
const aad = (userId, subject, clientId) =>
  encoder.encode(JSON.stringify(['sync-apple-refresh-token', 1, userId, subject, clientId]));

export function createAppleTokenService({
  env,
  fetcher,
  cryptoImpl = globalThis.crypto,
  now = Date.now,
}) {
  const configuration = () => {
    const clientId = env('APPLE_AUTH_CLIENT_ID');
    const teamId = env('APPLE_AUTH_TEAM_ID');
    const keyId = env('APPLE_AUTH_KEY_ID');
    const privateKey = env('APPLE_AUTH_PRIVATE_KEY');
    if (
      clientId !== CLIENT_ID ||
      !/^[A-Z0-9]{10}$/.test(teamId || '') ||
      !/^[A-Z0-9]{10}$/.test(keyId || '') ||
      !privateKey
    )
      throw new Error('Apple service unavailable.');
    return { clientId, teamId, keyId, privateKey };
  };
  const encryptionKey = async () => {
    const raw = decode(env('APPLE_TOKEN_ENCRYPTION_KEY'));
    if (raw.length !== 32) throw new Error('Apple service unavailable.');
    return cryptoImpl.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  };
  const clientSecret = async (config) => {
    const pem = config.privateKey.replace(/\\n/g, '\n');
    const match = pem.match(
      /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PRIVATE KEY-----\s*$/,
    );
    if (!match) throw new Error('Apple service unavailable.');
    const key = await cryptoImpl.subtle.importKey(
      'pkcs8',
      Uint8Array.from(atob(match[1].replace(/\s/g, '')), (char) => char.charCodeAt(0)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const seconds = Math.floor(now() / 1000);
    const input = `${jsonPart({ alg: 'ES256', kid: config.keyId })}.${jsonPart({ iss: config.teamId, iat: seconds, exp: seconds + 300, aud: APPLE_ISSUER, sub: config.clientId })}`;
    const signature = await cryptoImpl.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(input),
    );
    return `${input}.${encode(signature)}`;
  };
  const post = async (path, body) => {
    const response = await fetcher(`${APPLE_ISSUER}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Apple service unavailable.');
    return response;
  };
  const verifyIdentity = async (token, config, subject) => {
    if (typeof token !== 'string' || token.length > 16384)
      throw new Error('Invalid Apple response.');
    const pieces = token.split('.');
    if (pieces.length !== 3) throw new Error('Invalid Apple response.');
    const header = JSON.parse(decoder.decode(decode(pieces[0])));
    const claims = JSON.parse(decoder.decode(decode(pieces[1])));
    const seconds = Math.floor(now() / 1000);
    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      claims.iss !== APPLE_ISSUER ||
      claims.aud !== config.clientId ||
      claims.sub !== subject ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= seconds ||
      !Number.isFinite(claims.iat) ||
      claims.iat > seconds + 60
    )
      throw new Error('Invalid Apple response.');
    const response = await fetcher(`${APPLE_ISSUER}/auth/keys`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Apple service unavailable.');
    const { keys } = await response.json();
    const jwk = keys?.find(
      (item) =>
        item.kid === header.kid && item.kty === 'RSA' && item.alg === 'RS256' && item.use === 'sig',
    );
    if (!jwk) throw new Error('Invalid Apple response.');
    const key = await cryptoImpl.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    if (
      !(await cryptoImpl.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        decode(pieces[2]),
        encoder.encode(`${pieces[0]}.${pieces[1]}`),
      ))
    )
      throw new Error('Invalid Apple response.');
  };
  return {
    async register(admin, user, authorizationCode) {
      const subject = appleSubject(user);
      if (
        !subject ||
        typeof authorizationCode !== 'string' ||
        authorizationCode.length < 1 ||
        authorizationCode.length > 4096 ||
        /\s/.test(authorizationCode)
      )
        throw new Error('Invalid Apple registration.');
      const config = configuration();
      const key = await encryptionKey(); // Configuration failure must precede consuming the one-use code.
      const secret = await clientSecret(config);
      const response = await post('/auth/token', {
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: config.clientId,
        client_secret: secret,
      });
      const tokens = await response.json();
      await verifyIdentity(tokens.id_token, config, subject);
      if (
        typeof tokens.refresh_token !== 'string' ||
        !tokens.refresh_token ||
        tokens.refresh_token.length > 8192
      )
        throw new Error('Invalid Apple response.');
      const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
      const ciphertext = await cryptoImpl.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(user.id, subject, config.clientId) },
        key,
        encoder.encode(tokens.refresh_token),
      );
      const { error } = await admin.rpc('store_apple_revocation_token', {
        target_user_id: user.id,
        target_apple_subject: subject,
        target_client_id: config.clientId,
        sealed_token: { version: 1, iv: encode(iv), ciphertext: encode(ciphertext) },
      });
      if (error) throw new Error('Apple registration unavailable.');
    },
    async revokeForDeletion(admin, user) {
      if (!hasAppleIdentity(user)) return { status: 'not_required' };
      try {
        const subject = appleSubject(user);
        if (!subject) return appleManualRevocation();
        const config = configuration();
        const { data, error } = await admin.rpc('get_apple_revocation_token', {
          target_user_id: user.id,
        });
        if (
          error ||
          !data ||
          data.apple_subject !== subject ||
          data.client_id !== config.clientId ||
          data.sealed_token?.version !== 1
        )
          return appleManualRevocation();
        const iv = decode(data.sealed_token.iv);
        if (iv.length !== 12) return appleManualRevocation();
        const plaintext = await cryptoImpl.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: aad(user.id, subject, config.clientId) },
          await encryptionKey(),
          decode(data.sealed_token.ciphertext),
        );
        const token = decoder.decode(plaintext);
        if (!token || token.length > 8192) return appleManualRevocation();
        await post('/auth/revoke', {
          client_id: config.clientId,
          client_secret: await clientSecret(config),
          token,
          token_type_hint: 'refresh_token',
        });
        return { status: 'revoked' };
      } catch {
        // Apple outages, missing configuration, legacy users and unreadable
        // ciphertext never block deletion or leak provider/crypto diagnostics.
        return appleManualRevocation();
      }
    },
  };
}
