import { accountRequest, billingScopeActive, parseBillingScope } from './accountBillingScope.js';

export function createAccountBackupRemote({ client, scope: value, getSession, isCurrent }) {
  const scope = parseBillingScope(value, value?.user_id);
  const review = scope.lane === 'review';
  const session = () => {
    const current = getSession();
    if (!isCurrent() || !billingScopeActive(scope) || current?.user.id !== scope.user_id)
      throw new Error('Your account changed. Please retry.');
    return current;
  };
  return {
    async read() {
      const captured = session();
      const { data, error } = await accountRequest((signal) => {
        let query = client
          .from(review ? 'review_backups' : 'account_backups')
          .select(
            review ? 'namespace,epoch,payload,revision,updated_at' : 'payload,revision,updated_at',
          )
          .setHeader('Authorization', `Bearer ${captured.access_token}`)
          .eq('user_id', scope.user_id);
        if (review) query = query.eq('namespace', scope.namespace).eq('epoch', scope.epoch);
        return query.abortSignal(signal).maybeSingle();
      });
      session();
      if (error) throw error;
      if (review && data && (data.namespace !== scope.namespace || data.epoch !== scope.epoch))
        throw new Error('Your account changed. Please retry.');
      return data;
    },
    async write(payload, revision) {
      const captured = session();
      const parameters = {
        expected_revision: revision,
        backup_payload: payload,
        backup_user_id: scope.user_id,
        ...(review ? { backup_namespace: scope.namespace, backup_epoch: scope.epoch } : {}),
      };
      const { data, error } = await accountRequest((signal) =>
        client
          .rpc(review ? 'save_review_account_backup' : 'save_account_backup', parameters)
          .setHeader('Authorization', `Bearer ${captured.access_token}`)
          .abortSignal(signal)
          .single(),
      );
      session();
      if (error) throw error;
      return data;
    },
  };
}
