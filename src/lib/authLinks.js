export const AUTH_REDIRECT = 'syncapp://auth/callback';
export const RECOVERY_REDIRECT = 'syncapp://auth/recovery';

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
  const code = url.searchParams.get('code');
  if (!code) return null;
  return { code, recovery: url.pathname === '/recovery' };
}
