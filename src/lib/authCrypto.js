const integerArrays = new Set([
  '[object Int8Array]',
  '[object Uint8Array]',
  '[object Uint8ClampedArray]',
  '[object Int16Array]',
  '[object Uint16Array]',
  '[object Int32Array]',
  '[object Uint32Array]',
]);

// Supabase's PKCE implementation needs these two WebCrypto operations, not a
// complete WebCrypto implementation. Native failures must abort authentication
// rather than silently switching to Math.random or a plain challenge.
export function installNativeAuthCrypto({ platform, target = globalThis, loadNativeCrypto }) {
  if (platform === 'web') return true;
  if (typeof target.TextEncoder !== 'function' || typeof target.btoa !== 'function') return false;
  try {
    const existing = target.crypto;
    const needsRandom = typeof existing?.getRandomValues !== 'function';
    const needsDigest = typeof existing?.subtle?.digest !== 'function';
    if (!needsRandom && !needsDigest) return true;
    const native = loadNativeCrypto();
    if (
      (needsRandom && typeof native?.getRandomValues !== 'function') ||
      (needsDigest && typeof native?.digest !== 'function')
    )
      return false;

    const crypto = existing || {};
    if (needsRandom)
      Object.defineProperty(crypto, 'getRandomValues', {
        configurable: true,
        writable: true,
        value: (array) => {
          if (
            !ArrayBuffer.isView(array) ||
            !integerArrays.has(Object.prototype.toString.call(array))
          )
            throw new TypeError('Random values require an integer typed array.');
          if (array.byteLength > 65536)
            throw new RangeError('The random values request is too large.');
          native.getRandomValues(array);
          return array;
        },
      });
    if (needsDigest) {
      const subtle = crypto.subtle || {};
      Object.defineProperty(subtle, 'digest', {
        configurable: true,
        writable: true,
        value: async (algorithm, data) => {
          const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
          if (typeof name !== 'string' || name.toUpperCase() !== 'SHA-256')
            throw new Error('Only SHA-256 is available in the native authentication adapter.');
          let bytes;
          if (ArrayBuffer.isView(data))
            bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
          else throw new TypeError('A digest requires a byte buffer.');
          // Respect view offsets and snapshot mutable inputs before awaiting native work.
          return native.digest('SHA-256', new Uint8Array(bytes));
        },
      });
      if (!crypto.subtle)
        Object.defineProperty(crypto, 'subtle', { value: subtle, configurable: true });
    }
    if (!existing) Object.defineProperty(target, 'crypto', { value: crypto, configurable: true });
    return (
      typeof target.crypto?.getRandomValues === 'function' &&
      typeof target.crypto?.subtle?.digest === 'function'
    );
  } catch {
    // Missing native modules or non-extensible globals disable account services;
    // the offline timer remains usable and no weak request is sent.
    return false;
  }
}
