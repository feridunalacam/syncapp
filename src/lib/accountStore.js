// The scope is immutable: an old async callback can never write to the next user.
export const BACKUP_KEYS = [
  'routines',
  'completedRoutines',
  'profileBio',
  'profileSocialLinks',
  'posts',
];
export const ACCOUNT_KEYS = [
  ...BACKUP_KEYS,
  'profilePictureUri',
  'connectedPlatforms',
  'selectedPlatform',
];
const OWNER_KEY = '@syncapp_guest_import_owner';
const queues = new WeakMap();
const importQueues = new WeakMap();
const closedScopes = new WeakMap();
const queueFor = (base) => {
  if (!queues.has(base)) queues.set(base, new Map());
  return queues.get(base);
};
const closedFor = (base) => {
  if (!closedScopes.has(base)) closedScopes.set(base, new Set());
  return closedScopes.get(base);
};
const claimImport = (base, fn) => {
  const result = (importQueues.get(base) || Promise.resolve()).then(fn);
  importQueues.set(
    base,
    result.catch(() => {}),
  );
  return result;
};
const decode = (raw, fallback = null) => {
  try {
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const prefixFor = (userId) => (userId ? `@syncapp/account/${userId}/` : '');
export const clearAccountStore = async (base, userId) => {
  const prefix = prefixFor(userId);
  if (!userId) throw new Error('An account is required.');
  // Close synchronously before waiting: stale providers may still have a token
  // refresh or persistence callback in flight. A new adapter cannot reopen it.
  closedFor(base).add(prefix);
  const scopedQueues = queueFor(base);
  const result = (scopedQueues.get(prefix) || Promise.resolve()).then(async () => {
    const keys = await base.getAllKeys();
    await base.multiRemove(keys.filter((key) => key.startsWith(prefix)));
  });
  scopedQueues.set(
    prefix,
    result.catch(() => {}),
  );
  await result;
};

const isLocalReference = (value) =>
  typeof value === 'string' && /^(file:|content:|ph:|assets-library:|blob:)/i.test(value);

// Only reattach a device-local value inside the same stable identity. Array
// positions are not identities: rounds may move and a song may be replaced.
function retainDeviceReferences(incoming, current, mayRetain = false) {
  if (incoming === null) return mayRetain && isLocalReference(current) ? current : null;
  if (Array.isArray(incoming)) {
    if (!Array.isArray(current)) return incoming;
    return incoming.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const identityKey = item.id != null ? 'id' : item.roundNumber != null ? 'roundNumber' : null;
      if (!identityKey) return item;
      const match = current.find(
        (candidate) => candidate && candidate[identityKey] === item[identityKey],
      );
      return retainDeviceReferences(item, match, !!match);
    });
  }
  if (!incoming || typeof incoming !== 'object' || !current || typeof current !== 'object')
    return incoming;
  if (Object.hasOwn(incoming, 'uri') && incoming.id == null) return incoming;
  const identityKey =
    incoming.id != null ? 'id' : incoming.roundNumber != null ? 'roundNumber' : null;
  // Song objects have their own identity; a different song in the same round
  // must never inherit the previous song's local file.
  if (identityKey && incoming[identityKey] !== current[identityKey]) return incoming;
  if (
    Object.hasOwn(incoming, 'uri') &&
    ((incoming.platform && current.platform && incoming.platform !== current.platform) ||
      (incoming.source && current.source && incoming.source !== current.source))
  )
    return incoming;
  const stable = identityKey ? true : mayRetain;
  return Object.fromEntries(
    Object.entries(incoming).map(([key, value]) => [
      key,
      retainDeviceReferences(value, current[key], stable),
    ]),
  );
}

export function sanitizeBackup(value) {
  if (isLocalReference(value)) return null;
  if (Array.isArray(value)) return value.map(sanitizeBackup);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/^(accessToken|refreshToken|access_token|refresh_token|password|authorization)$/i.test(
            key,
          ),
      )
      .map(([key, item]) => [key, sanitizeBackup(item)]),
  );
}

export function createAccountStore(base, userId, onWrite = () => {}) {
  const prefix = prefixFor(userId);
  const metaKey = `${prefix}@syncmeta`;
  const scopedQueues = queueFor(base);
  const ensureOpen = () => {
    if (closedFor(base).has(prefix))
      throw new Error('This account has been deleted from this device.');
  };
  const serial = (fn) => {
    const result = (scopedQueues.get(prefix) || Promise.resolve()).then(fn);
    scopedQueues.set(
      prefix,
      result.catch(() => {}),
    );
    return result;
  };
  const readMeta = async () => ({
    revision: 0,
    counter: 0,
    dirty: false,
    ...decode(await base.getItem(metaKey), {}),
  });
  const keyFor = (key) => (ACCOUNT_KEYS.includes(key) ? `${prefix}${key}` : key);
  const write = async (key, raw) => {
    ensureOpen();
    const scoped = keyFor(key);
    if ((await base.getItem(scoped)) === raw) return true;
    if (BACKUP_KEYS.includes(key)) {
      const meta = await readMeta();
      await base.setItem(
        metaKey,
        JSON.stringify({ ...meta, dirty: true, counter: meta.counter + 1 }),
      );
    }
    if (raw == null) await base.removeItem(scoped);
    else await base.setItem(scoped, raw);
    if (BACKUP_KEYS.includes(key) && !closedFor(base).has(prefix)) onWrite();
    return true;
  };
  const snapshot = async () => {
    const data = {};
    for (const key of BACKUP_KEYS) {
      const raw = await base.getItem(keyFor(key));
      if (raw != null) data[key] = key === 'profileBio' ? raw : decode(raw, raw);
    }
    // Discover samples are bundled content; only the user's own saved posts are private data.
    if (Array.isArray(data.posts))
      data.posts = data.posts.filter((p) => p.authorId === 'current-user');
    return { payload: { version: 1, data: sanitizeBackup(data) }, meta: await readMeta() };
  };
  const replace = async (payload, revision, expectedCounter, canApply = () => true) => {
    ensureOpen();
    if (
      payload?.version !== 1 ||
      !payload.data ||
      typeof payload.data !== 'object' ||
      Array.isArray(payload.data)
    )
      throw new Error('This backup format is not supported.');
    if (payload.data.routines != null && !Array.isArray(payload.data.routines))
      throw new Error('This backup has invalid routines.');
    if (payload.data.completedRoutines != null && !Array.isArray(payload.data.completedRoutines))
      throw new Error('This backup has invalid activity.');
    if (payload.data.posts != null && !Array.isArray(payload.data.posts))
      throw new Error('This backup has invalid posts.');
    const meta = await readMeta();
    if (meta.counter !== expectedCounter || !canApply()) return false;
    // Preserve a recoverable device copy before replacing anything.
    await base.setItem(`${prefix}@before-cloud-restore`, JSON.stringify(await snapshot()));
    for (const key of BACKUP_KEYS) {
      const incoming = payload.data[key];
      const current = decode(await base.getItem(keyFor(key)));
      const value = ['routines', 'completedRoutines', 'posts'].includes(key)
        ? retainDeviceReferences(incoming, current)
        : incoming;
      const raw = value == null ? null : typeof value === 'string' ? value : JSON.stringify(value);
      if (raw == null) await base.removeItem(keyFor(key));
      else await base.setItem(keyFor(key), raw);
    }
    await base.setItem(
      metaKey,
      JSON.stringify({ revision, counter: meta.counter + 1, dirty: false }),
    );
    return true;
  };
  return {
    userId,
    getString: (key) => serial(() => base.getItem(keyFor(key))),
    getJSON: (key, fallback = null) =>
      serial(async () => decode(await base.getItem(keyFor(key)), fallback)),
    setString: (key, value) =>
      serial(() => write(key, value == null ? null : String(value))).catch(() => false),
    setJSON: (key, value) =>
      serial(() => write(key, value == null ? null : JSON.stringify(value))).catch(() => false),
    remove: (key) => serial(() => write(key, null)).catch(() => false),
    removeMany: (keys) =>
      serial(async () => {
        for (const key of keys) await write(key, null);
        return true;
      }).catch(() => false),
    snapshot: () => serial(snapshot),
    replaceFromCloud: (payload, revision, expectedCounter, canApply) =>
      serial(() => replace(payload, revision, expectedCounter, canApply)),
    markSynced: (revision, counter) =>
      serial(async () => {
        ensureOpen();
        const meta = await readMeta();
        await base.setItem(
          metaKey,
          JSON.stringify({ ...meta, revision, dirty: meta.counter !== counter }),
        );
      }),
    guestImportState: () =>
      serial(async () => {
        const owner = await base.getItem(OWNER_KEY);
        const hasGuestData =
          !owner &&
          (await Promise.all(BACKUP_KEYS.map((key) => base.getItem(key)))).some(
            (raw) => raw != null,
          );
        return { hasGuestData, importComplete: owner === userId };
      }),
    importGuestData: () =>
      serial(() =>
        claimImport(base, async () => {
          ensureOpen();
          if (!userId) throw new Error('Sign in before importing device data.');
          const owner = await base.getItem(OWNER_KEY);
          if (owner && owner !== userId)
            throw new Error(
              'These device records have already been imported into another account.',
            );
          if (owner === userId) return;
          const combine = (local, guest, identity) => [
            ...new Map([...guest, ...local].map((row) => [identity(row), row])).values(),
          ];
          for (const key of [...BACKUP_KEYS, 'profilePictureUri']) {
            const guest = await base.getItem(key);
            if (guest == null) continue;
            const current = await base.getItem(keyFor(key));
            let raw = current == null ? guest : current;
            if (['routines', 'completedRoutines', 'posts'].includes(key)) {
              const localRows = decode(current, []);
              const guestRows = decode(guest, []);
              if (!Array.isArray(localRows) || !Array.isArray(guestRows))
                throw new Error('Device data could not be imported.');
              const rows = combine(localRows, guestRows, (r) =>
                key === 'completedRoutines' ? r.sessionId || `${r.id}:${r.completedAt}` : r.id,
              );
              raw = JSON.stringify(rows);
            }
            await write(key, raw);
          }
          // Durable ownership marker first; never let another account claim this import.
          await base.setItem(OWNER_KEY, userId);
          await base.multiRemove([...BACKUP_KEYS, 'profilePictureUri']);
        }),
      ),
  };
}
