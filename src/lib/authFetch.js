export const AUTH_REQUEST_TIMEOUT_MS = 30000;

// Bound this project's Auth and exact account-deletion endpoint, which share
// the session operation queue. Never race a live session mutation:
// the queue is released after fetch/body consumption actually rejects on abort.
export function createAuthFetch(
  fetcher,
  supabaseUrl,
  { timeoutMs = AUTH_REQUEST_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  const endpoint = new URL(supabaseUrl);
  const basePath = endpoint.pathname.replace(/\/$/, '');
  const authPath = `${basePath}/auth/v1/`;
  const deletionPath = `${basePath}/functions/v1/delete-account`;
  return async (input, options) => {
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input?.url || input?.href);
    } catch {
      /* Delegate other fetch inputs. */
    }
    if (
      !url ||
      url.origin !== endpoint.origin ||
      (!url.pathname.startsWith(authPath) && url.pathname !== deletionPath)
    )
      return fetcher(input, options);
    const controller = new AbortController();
    const upstream = options?.signal || input?.signal;
    const abort = () => controller.abort();
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort);
    const timer = setTimer(abort, timeoutMs);
    try {
      const response = await fetcher(input, { ...options, signal: controller.signal });
      // Include a stalled response body in the same deadline. Native fetch
      // already buffers its body; web fetch can still be receiving it here.
      const body = await response.text();
      if (controller.signal.aborted) {
        const error = new Error('Account request was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      return new Response([204, 205, 304].includes(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      clearTimer(timer);
      upstream?.removeEventListener('abort', abort);
    }
  };
}
