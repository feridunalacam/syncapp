import { recoverySessionIdentity } from './authRecoveryState.js';

// The OS event carries no account identity. Check the *current* Apple subject
// with the OS, then fence that exact Supabase session again inside its queue.
// No Apple identifier or token is persisted by this observer.
export function observeAppleCredentialRevocation({ apple, getSession, enqueue, onRevoked }) {
  if (!apple?.addRevokeListener || !apple?.getCredentialStateAsync) return null;
  let alive = true;
  const same = (expected, subject) => {
    const session = getSession();
    const current = recoverySessionIdentity(session);
    const currentSubject = session?.user?.identities?.find((value) => value.provider === 'apple')
      ?.identity_data?.sub;
    return (
      alive &&
      expected?.userId === current?.userId &&
      expected?.sessionId === current?.sessionId &&
      currentSubject === subject
    );
  };
  const check = async () => {
    const session = getSession();
    const identity = recoverySessionIdentity(session);
    const subject = session?.user?.identities?.find((value) => value.provider === 'apple')
      ?.identity_data?.sub;
    if (!alive || !identity?.sessionId || typeof subject !== 'string' || !subject) return;
    try {
      const state = await apple.getCredentialStateAsync(subject);
      if (
        ![
          apple.AppleAuthenticationCredentialState.REVOKED,
          apple.AppleAuthenticationCredentialState.NOT_FOUND,
        ].includes(state) ||
        !same(identity, subject)
      )
        return;
      await enqueue(async () => {
        if (same(identity, subject)) await onRevoked(session);
      });
    } catch {
      // OS/network errors do not mean the credential was revoked.
    }
  };
  const listener = apple.addRevokeListener(check);
  return {
    check,
    dispose() {
      alive = false;
      listener.remove();
    },
  };
}
