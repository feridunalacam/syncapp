import { accountBillingScope, adminClient, authenticatedUser, json, preflight, readEntitlement, readReviewEntitlement, syncEntitlement, syncReviewEntitlement } from '../_shared/server.ts';
Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  try {
    const admin = adminClient();
    const auth = await authenticatedUser(req, admin);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    // User ID and entitlement are derived server-side; ignore all request body fields.
    const scope = await accountBillingScope(admin, auth.user.id);
    if (scope.lane === 'review' && !scope.active) return json({ scope, entitlement: null });
    const result = scope.lane === 'review'
      ? await syncReviewEntitlement(admin, scope)
      : await syncEntitlement(admin, auth.user.id);
    if (!result.applied) return json({ error: 'refresh_superseded_retry' }, 409);
    const latest = await accountBillingScope(admin, auth.user.id, false);
    if (!latest || latest.namespace !== scope.namespace || latest.epoch !== scope.epoch)
      return json({ error: 'scope_changed_retry' }, 409);
    return json({ scope: latest, entitlement: latest.lane === 'review'
      ? await readReviewEntitlement(admin, latest) : await readEntitlement(admin, auth.user.id),
      ...(scope.lane === 'review' && result.entitlement?.rejection === 'production_receipt_in_review'
        ? { verification_error: 'review_purchase_not_eligible' } : {}),
    });
  } catch {
    console.error('Subscription refresh failed.');
    return json({ error: 'subscription_sync_unavailable' }, 503);
  }
});
