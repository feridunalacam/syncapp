import { computeAccessTokenExpiresAt } from '../services/spotify/auth.js';
/** Serializes credential writes and prevents a late refresh from undoing disconnect/reconnect. */
export function createMusicConnections({ initial, save, onChange, services, now = Date.now }) {
  let state = initial;
  let writes = Promise.resolve();
  const revisions = {};
  const refreshes = new Map();
  let disposed = false;
  const update = (change) => {
    const work = writes.then(async () => {
      if (disposed) return state;
      const next = change(state);
      if (next === state) return state;
      await save(next);
      state = next;
      onChange(next);
      return state;
    });
    writes = work.catch(() => {});
    return work;
  };
  const connect = (id, data) => {
    revisions[id] = (revisions[id] || 0) + 1;
    return update((previous) => ({
      ...previous,
      [id]: { ...data, connected: true, connectedAt: new Date(now()).toISOString() },
    }));
  };
  const disconnect = (id) => {
    revisions[id] = (revisions[id] || 0) + 1;
    return update((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };
  const refresh = (id) => {
    if (refreshes.has(id)) return refreshes.get(id);
    const current = state[id];
    const version = revisions[id] || 0;
    if (!current?.connected || !current.refreshToken) return Promise.resolve(null);
    const job = (async () => {
      const result = await services[id].getAccessToken(current.refreshToken);
      if (disposed || version !== (revisions[id] || 0)) return null;
      if (result?.accessToken) {
        const expiresAt = computeAccessTokenExpiresAt(result.expiresIn, now());
        await update((previous) =>
          version !== (revisions[id] || 0)
            ? previous
            : {
                ...previous,
                [id]: {
                  ...previous[id],
                  accessToken: result.accessToken,
                  refreshToken: result.refreshToken || previous[id].refreshToken,
                  expiresAt,
                },
              },
        );
        return version === (revisions[id] || 0) ? result.accessToken : null;
      }
      if (result?.shouldDisconnect || result?.errorCode === 'invalid_grant') await disconnect(id);
      return null;
    })().finally(() => {
      if (refreshes.get(id) === job) refreshes.delete(id);
    });
    refreshes.set(id, job);
    return job;
  };
  return {
    getState: () => state,
    connect,
    disconnect,
    refresh,
    dispose: () => {
      disposed = true;
    },
  };
}
