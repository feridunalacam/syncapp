import { AUTH_REDIRECT, isAuthFlowId, parseAuthLink } from './authLinks.js';

/** The browser never holds the session queue: Linking may deliver the callback first. */
export function createSocialAuth({
  client,
  enqueue,
  exchangeCode,
  ensureProvider,
  openSession,
  signInNativeApple,
  signInWithIdToken,
  registerAppleAuthorization,
  getIdentity,
  onBusy = () => {},
  authorizationOrigin,
}) {
  let active = null;
  const retired = new Set();
  const retire = (attempt) => {
    if (attempt.flowId && !attempt.completed) retired.add(attempt.flowId);
    if (retired.size > 20) retired.delete(retired.values().next().value);
  };
  const cancelled = () => ({ cancelled: true });
  const finish = (attempt, parsed) => {
    if (attempt.cancelled) return Promise.resolve(cancelled());
    if (parsed.recovery || (attempt.flowId && parsed.flowId !== attempt.flowId))
      return Promise.reject(new Error('Sign-in could not be verified. Please try again.'));
    if (attempt.exchange) return attempt.exchange;
    attempt.exchange = enqueue(async () => {
      if (attempt.cancelled || getIdentity() !== attempt.identity) return cancelled();
      const result = await exchangeCode(parsed);
      attempt.completed = true;
      return result;
    });
    return attempt.exchange;
  };
  const receive = (parsed) => {
    if (parsed.flowId && retired.has(parsed.flowId)) return Promise.resolve(cancelled());
    if (active && parsed.flowId && parsed.flowId === active.flowId) return finish(active, parsed);
    return enqueue(() => exchangeCode(parsed));
  };
  const signIn = (provider) => {
    if (!['apple', 'google'].includes(provider))
      return Promise.reject(new Error('Unsupported sign-in provider.'));
    if (active) return Promise.reject(new Error('A sign-in is already in progress.'));
    const attempt = {
      provider,
      identity: getIdentity(),
      cancelled: false,
      completed: false,
      flowId: null,
    };
    active = attempt;
    onBusy(provider);
    return (async () => {
      try {
        await ensureProvider(provider);
        if (attempt.cancelled || getIdentity() !== attempt.identity) return cancelled();
        if (provider === 'apple' && signInNativeApple) {
          const credential = await signInNativeApple();
          if (credential?.cancelled || attempt.cancelled || getIdentity() !== attempt.identity)
            return cancelled();
          if (credential)
            return await enqueue(async () => {
              if (attempt.cancelled || getIdentity() !== attempt.identity) return cancelled();
              if (!signInWithIdToken)
                throw new Error('Apple sign-in is unavailable. Please update Sync and try again.');
              const result = await signInWithIdToken(
                {
                  provider: 'apple',
                  token: credential.token,
                  nonce: credential.nonce,
                },
                () => !attempt.cancelled && getIdentity() === attempt.identity,
              );
              if (result?.cancelled) return result;
              const { data, error } = result;
              if (error) throw new Error('Apple sign-in could not be completed. Please try again.');
              attempt.completed = true;
              if (
                credential.authorizationCode &&
                registerAppleAuthorization &&
                !attempt.cancelled
              ) {
                try {
                  // Registration is optional: missing server signing material,
                  // an outage or a used code must never undo verified sign-in.
                  await registerAppleAuthorization(credential.authorizationCode, data.session);
                } catch {
                  // No native/provider error or credential is logged or exposed.
                }
              }
              return data;
            });
        }
        const { data, error } = await enqueue(() =>
          client.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: AUTH_REDIRECT,
              skipBrowserRedirect: true,
              ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
            },
          }),
        );
        if (error) throw new Error('Sign-in could not start. Please try again.');
        let url, redirect;
        try {
          url = new URL(data?.url);
          redirect = new URL(url.searchParams.get('redirect_to'));
        } catch {
          throw new Error('Sign-in could not start. Please try again.');
        }
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          (authorizationOrigin && url.origin !== authorizationOrigin) ||
          !url.pathname.endsWith('/auth/v1/authorize') ||
          url.searchParams.get('provider') !== provider ||
          redirect.protocol !== 'syncapp:' ||
          redirect.username ||
          redirect.password ||
          redirect.port ||
          redirect.hostname !== 'auth' ||
          redirect.pathname !== '/callback'
        )
          throw new Error('Sign-in could not start. Please try again.');
        const flowId = redirect.searchParams.get('sb_flow_id');
        if (flowId && !isAuthFlowId(flowId))
          throw new Error('Sign-in could not be verified. Please try again.');
        attempt.flowId = flowId;
        if (attempt.cancelled || getIdentity() !== attempt.identity) return cancelled();
        let response;
        try {
          response = await openSession(url.href, AUTH_REDIRECT);
        } catch {
          throw new Error('The sign-in window could not be opened. Please try again.');
        }
        if (attempt.exchange) return await attempt.exchange;
        if (attempt.cancelled || ['cancel', 'dismiss'].includes(response.type)) return cancelled();
        const parsed = response.type === 'success' ? parseAuthLink(response.url) : null;
        if (!parsed?.code || parsed.error || parsed.recovery)
          throw new Error('Sign-in could not be completed. Please try again.');
        try {
          return await finish(attempt, parsed);
        } catch {
          throw new Error('Sign-in could not be verified. Please try again.');
        }
      } finally {
        retire(attempt);
        if (active === attempt) {
          active = null;
          onBusy(null);
        }
      }
    })();
  };
  return {
    signIn,
    receive,
    cancel() {
      if (active) {
        active.cancelled = true;
        retire(active);
      }
    },
  };
}
