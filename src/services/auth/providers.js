import { createAuthFetch } from '../../lib/authFetch';
export const AUTH_SERVICE_ORIGIN = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).origin
  : null;

/** Check the live project's public capability flags without exposing configuration secrets. */
export async function ensureSocialProvider(provider) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const name = provider === 'apple' ? 'Apple' : 'Google';
  if (!url || !key) throw new Error('Account services are unavailable. Please try again later.');
  let response, settings;
  try {
    response = await createAuthFetch(fetch.bind(globalThis), url, { timeoutMs: 10000 })(
      new URL('/auth/v1/settings', url).href,
      { headers: { apikey: key } },
    );
    settings = await response.json();
  } catch {
    throw new Error('Sign-in services could not be reached. Check your connection and try again.');
  }
  if (!response.ok) throw new Error('Sign-in services could not be reached. Please try again.');
  if (settings.external?.[provider] !== true)
    throw new Error(
      `${name} sign-in is not available yet. You can sign in with email or continue without an account.`,
    );
}
