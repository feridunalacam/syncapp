// SecureStore values are chunked because complete JWT sessions can exceed 2KB.
// A manifest is committed last, so a failed write never replaces a valid session.
export function createAuthSessionStorage(secureStore) {
  let queue = Promise.resolve();
  const serial = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const manifestKey = (key) => `sync.auth.${encodeURIComponent(key).replace(/%/g, '_')}`;
  const manifest = async (key) => {
    const raw = await secureStore.getItemAsync(manifestKey(key));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      typeof value.prefix !== 'string' ||
      !Number.isInteger(value.count) ||
      value.count < 0 ||
      value.count > 256
    )
      throw new Error('Invalid session storage');
    return {
      chunks: Array.from({ length: value.count }, (_, index) => `${value.prefix}.${index}`),
    };
  };
  return {
    getItem: (key) =>
      serial(async () => {
        const saved = await manifest(key);
        if (!saved) return null;
        const chunks = await Promise.all(
          saved.chunks.map((part) => secureStore.getItemAsync(part)),
        );
        if (chunks.some((part) => part == null)) return null;
        return chunks.join('');
      }),
    setItem: (key, value) =>
      serial(async () => {
        const previous = await manifest(key);
        const prefix = `${manifestKey(key)}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        const chunks = [];
        try {
          // 400 UTF-16 characters stay below 2KB even with Unicode metadata.
          const characters = Array.from(value);
          if (characters.length > 102400)
            throw new Error('Session is too large for secure storage');
          for (let index = 0; index < characters.length; index += 400) {
            const part = `${prefix}.${chunks.length}`;
            chunks.push(part);
            await secureStore.setItemAsync(part, characters.slice(index, index + 400).join(''));
          }
          await secureStore.setItemAsync(
            manifestKey(key),
            JSON.stringify({ prefix, count: chunks.length }),
          );
        } catch (error) {
          await Promise.all(
            chunks.map((part) => secureStore.deleteItemAsync(part).catch(() => {})),
          );
          throw error;
        }
        await Promise.all(
          (previous?.chunks || []).map((part) => secureStore.deleteItemAsync(part).catch(() => {})),
        );
      }),
    removeItem: (key) =>
      serial(async () => {
        const saved = await manifest(key);
        await secureStore.deleteItemAsync(manifestKey(key));
        await Promise.all(
          (saved?.chunks || []).map((part) => secureStore.deleteItemAsync(part).catch(() => {})),
        );
      }),
  };
}
