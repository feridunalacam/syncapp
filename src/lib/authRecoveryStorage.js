export const AUTH_RECOVERY_MAX_AGE_MS = 60 * 60 * 1000;
const cancelled = () => new Error('This password reset was cancelled. Request a new link.');
const unavailable = () => new Error('Password reset storage is unavailable. Please try again.');

/** Native callers inject the encrypted, chunked Auth storage, never AsyncStorage. */
export function createAuthRecoveryStorage({
  storage,
  storageKey,
  now = Date.now,
  maxAgeMs = AUTH_RECOVERY_MAX_AGE_MS,
}) {
  const durableKey = `${storageKey}.pending.v1`;
  const memory = new Map();
  let version = 0;
  let active = null;
  let io = Promise.resolve();
  let operations = Promise.resolve();
  const serial = (action) => {
    const result = io.then(action);
    io = result.catch(() => {});
    return result;
  };
  const slot = (flowId) => `${storageKey}-flow-${flowId}-code-verifier`;
  // This SupportedStorage adapter is deliberately limited to the pinned SDK's
  // PKCE keys. Session/user writes are transient and can never reach the vault.
  const pkceKey = (key) =>
    key === `${storageKey}-code-verifier` ||
    key === `${storageKey}-flows-code-verifier` ||
    (key.startsWith(`${storageKey}-flow-`) &&
      /^[0-9a-f]{32}$/.test(key.slice(storageKey.length + 6, -14)) &&
      key.endsWith('-code-verifier'));
  const transient = (key) => key === storageKey || key === `${storageKey}-user`;
  const load = async () => {
    const raw = await storage.getItem(durableKey);
    if (raw == null) return { version: 1, epoch: 0, entries: {} };
    let state;
    try {
      if (typeof raw !== 'string' || raw.length > 128000) throw unavailable();
      state = JSON.parse(raw);
      if (
        state?.version !== 1 ||
        !Number.isSafeInteger(state.epoch) ||
        state.epoch < 0 ||
        !state.entries ||
        typeof state.entries !== 'object' ||
        Array.isArray(state.entries) ||
        Object.keys(state.entries).length > 64
      )
        throw unavailable();
      for (const [key, entry] of Object.entries(state.entries)) {
        if (
          !pkceKey(key) ||
          typeof entry?.value !== 'string' ||
          entry.value.length > 16384 ||
          !Number.isFinite(entry.expiresAt)
        )
          throw unavailable();
      }
    } catch {
      throw unavailable();
    }
    const count = Object.keys(state.entries).length;
    state.entries = Object.fromEntries(
      Object.entries(state.entries).filter(([, entry]) => entry.expiresAt > now()),
    );
    if (Object.keys(state.entries).length !== count)
      await storage.setItem(durableKey, JSON.stringify(state));
    return state;
  };
  const current = (lease) => !!lease && active === lease && lease.version === version;
  const access = (key, action) => {
    const lease = active;
    if (!pkceKey(key)) return Promise.reject(unavailable());
    return serial(async () => {
      if (!current(lease)) throw cancelled();
      const state = await load();
      if (!current(lease) || state.epoch !== lease.epoch) throw cancelled();
      return action(state);
    });
  };
  const sdkStorage = {
    getItem: (key) => {
      if (transient(key)) return Promise.resolve(memory.get(key) ?? null);
      return access(key, (state) => state.entries[key]?.value ?? null);
    },
    setItem: (key, value) => {
      if (transient(key)) {
        if (!current(active)) return Promise.reject(cancelled());
        memory.set(key, value);
        return Promise.resolve();
      }
      return access(key, async (state) => {
        if (typeof value !== 'string' || value.length > 16384) throw unavailable();
        state.entries[key] = { value, expiresAt: now() + maxAgeMs };
        if (Object.keys(state.entries).length > 64) throw unavailable();
        await storage.setItem(durableKey, JSON.stringify(state));
      });
    },
    removeItem: (key) => {
      if (transient(key)) {
        memory.delete(key);
        return Promise.resolve();
      }
      return access(key, async (state) => {
        delete state.entries[key];
        await storage.setItem(durableKey, JSON.stringify(state));
      });
    },
  };
  const suspend = () => {
    version++;
    active?.controller.abort();
    memory.clear();
  };
  return {
    storage: sdkStorage,
    get signal() {
      return active?.controller.signal;
    },
    hasFlow: async (flowId) => {
      const raw = await sdkStorage.getItem(slot(flowId));
      try {
        const value = JSON.parse(raw);
        return typeof value === 'string' && value.endsWith('/recovery');
      } catch {
        return false;
      }
    },
    run(action) {
      const requested = version;
      const result = operations.then(async () => {
        const state = await serial(load);
        if (requested !== version) throw cancelled();
        const lease = { version: requested, epoch: state.epoch, controller: new AbortController() };
        active = lease;
        try {
          const result = await action();
          await serial(async () => {
            const latest = await load();
            if (!current(lease) || latest.epoch !== lease.epoch) throw cancelled();
          });
          return result;
        } finally {
          if (active === lease) active = null;
          memory.clear();
        }
      });
      operations = result.catch(() => {});
      return result;
    },
    invalidate() {
      suspend();
      return serial(async () => {
        const state = await load();
        if (state.epoch >= Number.MAX_SAFE_INTEGER) throw unavailable();
        await storage.setItem(
          durableKey,
          JSON.stringify({ version: 1, epoch: state.epoch + 1, entries: {} }),
        );
      });
    },
    suspend,
  };
}
