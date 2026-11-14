import {
  accountRequest,
  billingScopeActive,
  parseBillingScope,
  sameBillingScope,
} from '../../lib/accountBillingScope.js';

export async function verifyAccountEntitlement(
  client,
  userId,
  { scope: value, sync = false } = {},
) {
  if (!client) throw new Error('Account services are not available in this build.');
  const scope = parseBillingScope(value, userId);
  if (!billingScopeActive(scope)) throw new Error('Account purchase access is unavailable.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || session?.user.id !== userId)
    throw new Error('Your account changed. Please try again.');
  let syncError = null;
  let verificationError;
  if (sync) {
    const result = await accountRequest((signal) =>
      client.functions.invoke('sync-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      }),
    );
    if (result.error)
      syncError =
        'Subscription verification is temporarily unavailable. Refresh access in a moment.';
    else if (
      !sameBillingScope(scope, parseBillingScope(result.data?.scope, userId)) ||
      !billingScopeActive(result.data.scope)
    )
      throw new Error('Your account changed. Please retry.');
    else
      verificationError =
        scope.lane === 'review' && result.data.verification_error === 'review_purchase_not_eligible'
          ? 'review_purchase_not_eligible'
          : null;
  }
  const review = scope.lane === 'review';
  const result = await accountRequest((signal) => {
    let query = client
      .from(review ? 'review_entitlements' : 'entitlements')
      .select(
        review
          ? 'entitlement_id,expires_at,store,environment,updated_at,namespace,epoch'
          : 'entitlement_id,expires_at,store,environment,updated_at',
      )
      .setHeader('Authorization', `Bearer ${session.access_token}`)
      .eq('user_id', userId)
      .eq('entitlement_id', 'pro');
    if (review) query = query.eq('namespace', scope.namespace).eq('epoch', scope.epoch);
    return query.abortSignal(signal).maybeSingle();
  });
  if (result.error) throw new Error('Could not verify cloud access. Please try again.');
  return { entitlement: result.data, scope, syncError, verificationError };
}
