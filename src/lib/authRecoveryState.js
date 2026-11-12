const recoveryKey = 'sync.auth.recovery.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Hermes does not promise the browser's atob/TextDecoder globals. This decoder
// only reads the existing SDK session's two binding claims; it verifies no JWT.
function sessionClaims(value) {
  if (!value || value.length > 200000 || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    return null;
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(`%${((buffer >> bits) & 255).toString(16).padStart(2, '0')}`);
    }
  }
  return JSON.parse(decodeURIComponent(bytes.join('')));
}

// This local binding only remembers an unfinished form. It never authorizes an
// account or grants access. Tokens remain exclusively in the SDK's session store.
export function recoverySessionIdentity(session) {
  try {
    const userId = session?.user?.id;
    const parts = session?.access_token?.split('.');
    if (!uuid.test(userId || '') || parts?.length !== 3) return null;
    const claims = sessionClaims(parts[1]);
    if (claims?.sub !== userId || !uuid.test(claims.session_id || '')) return null;
    return { userId, sessionId: claims.session_id };
  } catch {
    return null;
  }
}

const matches = (left, right) =>
  !!left && !!right && left.userId === right.userId && left.sessionId === right.sessionId;

export function createAuthRecoveryState({ storage, onChange, restoreTimeoutMs = 1500 }) {
  let identity = null;
  let active = false;
  let epoch = 0;
  let hydration = Promise.resolve(false);
  let queue = Promise.resolve();
  const serial = (action) => {
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  };
  const publish = (next) => {
    active = next;
    onChange(next);
  };
  const remove = () => serial(() => storage.removeItem(recoveryKey)).catch(() => {});
  const read = async () => {
    let timer;
    try {
      return await Promise.race([
        serial(() => storage.getItem(recoveryKey)),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), restoreTimeoutMs);
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    observe(session, event) {
      const next = recoverySessionIdentity(session);
      if (event === 'PASSWORD_RECOVERY') {
        epoch++;
        identity = next;
        publish(true);
        // Persistence is best effort; a storage failure must not invalidate an
        // already accepted recovery link or prevent updating its password.
        if (next) serial(() => storage.setItem(recoveryKey, JSON.stringify(next))).catch(() => {});
        hydration = Promise.resolve(true);
        return hydration;
      }
      if (matches(next, identity)) return hydration;
      const version = ++epoch;
      identity = next;
      publish(false);
      if (!next) {
        remove();
        hydration = Promise.resolve(false);
        return hydration;
      }
      hydration = (async () => {
        const raw = await read();
        if (version !== epoch) return active;
        let saved;
        try {
          saved = JSON.parse(raw);
        } catch {
          saved = null;
        }
        publish(matches(next, saved));
        if (raw && !active)
          serial(() => (version === epoch ? storage.removeItem(recoveryKey) : undefined)).catch(
            () => {},
          );
        return active;
      })();
      return hydration;
    },
    finish(session) {
      const next = recoverySessionIdentity(session);
      if (identity && !matches(next, identity)) return Promise.resolve();
      epoch++;
      publish(false);
      hydration = Promise.resolve(false);
      return remove();
    },
    suspend() {
      epoch++;
      identity = null;
      active = false;
      hydration = Promise.resolve(false);
    },
  };
}
