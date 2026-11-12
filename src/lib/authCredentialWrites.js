/**
 * Pinned auth-js 2.119 saves these three credential sign-ins without taking its
 * configured lock. Only these known unlocked writers use this outer boundary.
 * exchangeCodeForSession/updateUser/signOut already lock and must not be wrapped.
 * Keep auth subscribers synchronous: they must never await another auth call.
 */
export function createAuthCredentialWriters({ auth, storageKey, lock, timeoutMs = 30000 }) {
  const write = async (method, credentials, isCurrent = () => true) => {
    await auth.initialize();
    return lock(`lock:${storageKey}`, timeoutMs, () =>
      isCurrent() ? auth[method](credentials) : { cancelled: true },
    );
  };
  return {
    signInWithPassword: (credentials) => write('signInWithPassword', credentials),
    signUp: (credentials) => write('signUp', credentials),
    signInWithIdToken: (credentials, isCurrent) =>
      write('signInWithIdToken', credentials, isCurrent),
  };
}
