import { adminClient, authenticatedUser, json, preflight, readEntitlement, syncEntitlement } from '../_shared/server.ts';
Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  try {
    const admin = adminClient();
    const auth = await authenticatedUser(req, admin);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    // User ID and entitlement are derived server-side; ignore all request body fields.
    const result = await syncEntitlement(admin, auth.user.id);
    if (!result.applied) return json({ error: 'refresh_superseded_retry' }, 409);
    return json({ entitlement: await readEntitlement(admin, auth.user.id) });
  } catch {
    console.error('Subscription refresh failed.');
    return json({ error: 'subscription_sync_unavailable' }, 503);
  }
});
