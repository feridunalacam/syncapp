import { isAuthFlowId, RECOVERY_REDIRECT } from './authLinks.js';
import { recoverySessionIdentity } from './authRecoveryState.js';

const cancelled = () => ({ cancelled: true });
const invalidLink = () =>
  new Error('Request a new password reset link and open it on the device that requested it.');

/** Only the canonical main client owns the app's identity and recovery form. */
export function createAuthRecoveryFlow({ auth, storage, mainAuth, enqueue, onRecovery }) {
  let revision = 0;
  let disposed = false;
  const exchanges = new Map();
  const current = (version) => !disposed && version === revision;
  const trim = () => {
    while (exchanges.size > 20) exchanges.delete(exchanges.keys().next().value);
  };
  return {
    async send(email) {
      const version = revision;
      try {
        await auth.initialize();
        if (!current(version)) return cancelled();
        const result = await storage.run(() =>
          auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_REDIRECT }),
        );
        if (!current(version)) return cancelled();
        if (result.error) throw result.error;
        return result.data;
      } catch (error) {
        if (!current(version)) return cancelled();
        throw error;
      }
    },
    receive(parsed) {
      if (
        parsed?.recovery !== true ||
        !isAuthFlowId(parsed.flowId) ||
        typeof parsed.code !== 'string' ||
        !parsed.code ||
        parsed.code.length > 2048
      )
        return Promise.reject(invalidLink());
      const key = `${parsed.flowId}:${parsed.code}`;
      if (exchanges.has(key)) return exchanges.get(key);
      const version = revision;
      const operation = enqueue(async () => {
        try {
          await auth.initialize();
          if (!current(version)) return cancelled();
          const verified = await storage.run(async () => {
            if (!(await storage.hasFlow(parsed.flowId))) throw invalidLink();
            const result = await auth.exchangeCodeForSession(parsed.code, {
              flowId: parsed.flowId,
            });
            if (result.error) throw result.error;
            return result.data;
          });
          const identity = recoverySessionIdentity(verified?.session);
          if (verified?.redirectType !== 'recovery' || !identity) throw invalidLink();
          if (!current(version)) return cancelled();
          // setSession already takes the SDK lock. Never outer-lock it or use
          // secondary signOut: that would revoke the token being adopted here.
          const result = await mainAuth.setSession({
            access_token: verified.session.access_token,
            refresh_token: verified.session.refresh_token,
          });
          if (result.error) throw result.error;
          const adopted = recoverySessionIdentity(result.data?.session);
          if (
            !adopted ||
            adopted.userId !== identity.userId ||
            adopted.sessionId !== identity.sessionId
          )
            throw invalidLink();
          if (!current(version)) return cancelled();
          await onRecovery(result.data.session);
          return result.data;
        } catch (error) {
          if (!current(version)) return cancelled();
          throw error;
        }
      });
      exchanges.set(key, operation);
      trim();
      operation.then(
        (result) => {
          if (result?.cancelled && exchanges.get(key) === operation) exchanges.delete(key);
        },
        () => {},
      );
      return operation;
    },
    cancel() {
      revision++;
      exchanges.clear();
      return storage.invalidate();
    },
    resume() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      revision++;
      storage.suspend();
    },
  };
}
