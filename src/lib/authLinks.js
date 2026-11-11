export const AUTH_REDIRECT = 'syncapp://auth/callback';
export const RECOVERY_REDIRECT = 'syncapp://auth/recovery';
// Pinned auth-js 2.119 generates 16 random bytes as 32 lowercase hex characters.
export const isAuthFlowId = (value) => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

export function parseAuthLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;
  if (
    url.protocol !== 'syncapp:' ||
    url.hostname !== 'auth' ||
    !['/callback', '/recovery'].includes(url.pathname)
  )
    return null;
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (error) return { error };
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.get('error') || fragment.get('error_description') || fragment.get('error_code'))
    return { error: 'This account link is invalid or has expired. Request a new link.' };
  const codes = url.searchParams.getAll('code');
  if (codes.length > 1)
    return { error: 'This account link is invalid or has expired. Request a new link.' };
  const code = codes[0];
  if (!code) return null;
  const flowIds = url.searchParams.getAll('sb_flow_id');
  if (flowIds.length > 1 || (flowIds.length === 1 && !isAuthFlowId(flowIds[0])))
    return { error: 'This account link is invalid or has expired. Request a new link.' };
  return {
    code,
    recovery: url.pathname === '/recovery',
    ...(flowIds.length === 1 ? { flowId: flowIds[0] } : {}),
  };
}
