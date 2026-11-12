import { adminClient, authenticatedUser, json, preflight } from '../_shared/server.ts';
import { createAppleTokenService } from '../_shared/apple-revocation.js';
import { requireRecentSignIn } from '../_shared/subscriptions.js';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  try {
    const admin = adminClient();
    const auth = await authenticatedUser(req, admin);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { data, error } = await admin.auth.getClaims(auth.token);
    if (error || data?.claims.sub !== auth.user.id || !requireRecentSignIn(data?.claims))
      return json({ error: 'reauthentication_required' }, 403);
    // Only the authorization code is accepted. Identity and client ID come from
    // authenticated Supabase identities and server configuration, respectively.
    const body = await req.json();
    await createAppleTokenService({ env: (key) => Deno.env.get(key), fetcher: fetch }).register(
      admin,
      auth.user,
      body?.authorization_code,
    );
    return json({ registered: true });
  } catch {
    return json({ error: 'apple_registration_unavailable' }, 503);
  }
});
