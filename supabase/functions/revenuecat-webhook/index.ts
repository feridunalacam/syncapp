import { adminClient, json, preflight, subscriptionConfig, syncEntitlement } from '../_shared/server.ts';
import { secureEqual, validateWebhook, webhookUsers } from '../_shared/subscriptions.js';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'webhook_not_configured' }, 503);
  if (!secureEqual(req.headers.get('Authorization'), `Bearer ${secret}`)) return json({ error: 'unauthorized' }, 401);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 131072) return json({ error: 'payload_too_large' }, 413);
    const payload = JSON.parse(raw);
    if (!validateWebhook(payload)) return json({ error: 'invalid_event' }, 400);
    const { event } = payload;
    const { environment } = subscriptionConfig();
    if (event.environment !== environment) return json({ ignored: 'different_environment' });
    const admin = adminClient();
    for (const userId of webhookUsers(event)) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      // Ignore former/deleted accounts. An upstream auth outage should be retried.
      if (error && error.status !== 404) throw error;
      if (!data?.user) continue;
      const result = await syncEntitlement(admin, userId, event.id);
      if (!result.applied && !result.duplicate) return json({ error: 'refresh_superseded_retry' }, 409);
    }
    return json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'invalid_json' }, 400);
    // Never log raw webhooks, user identifiers, API keys, or access tokens.
    console.error('Subscription webhook processing failed.');
    return json({ error: 'subscription_sync_failed' }, 503);
  }
});
