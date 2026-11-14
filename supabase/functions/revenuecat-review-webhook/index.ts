import {
  accountBillingScope,
  adminClient,
  json,
  preflight,
  reviewSubscriptionConfig,
  syncReviewEntitlement,
} from '../_shared/server.ts';
import { secureEqual, validateWebhook, webhookUsers } from '../_shared/subscriptions.js';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  let config;
  try {
    config = reviewSubscriptionConfig();
  } catch {
    return json({ error: 'review_not_configured' }, 503);
  }
  if (!secureEqual(req.headers.get('Authorization'), `Bearer ${config.webhookSecret}`))
    return json({ error: 'unauthorized' }, 401);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 131072)
      return json({ error: 'payload_too_large' }, 413);
    const payload = JSON.parse(raw);
    if (!validateWebhook(payload)) return json({ error: 'invalid_event' }, 400);
    const { event } = payload;
    if (event.environment != null && event.environment !== 'SANDBOX')
      return json({ ignored: 'different_environment' });
    const admin = adminClient();
    for (const userId of webhookUsers(event)) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error && error.status !== 404) throw error;
      if (!data?.user) continue;
      // A review webhook can neither create a production scope nor enroll a reviewer.
      const scope = await accountBillingScope(admin, userId, false);
      if (!scope || scope.lane !== 'review' || !scope.active) continue;
      const result = await syncReviewEntitlement(admin, scope, event.id);
      if (!result.applied && !result.duplicate)
        return json({ error: 'refresh_superseded_retry' }, 409);
    }
    return json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'invalid_json' }, 400);
    console.error('Review subscription webhook processing failed.');
    return json({ error: 'review_subscription_sync_failed' }, 503);
  }
});
