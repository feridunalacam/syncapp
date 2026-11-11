import { adminClient, authenticatedUser, json, preflight } from '../_shared/server.ts';
import { requireRecentSignIn } from '../_shared/subscriptions.js';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;
  try {
    const admin = adminClient();
    const auth = await authenticatedUser(req, admin);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    if (!requireRecentSignIn(auth.user)) return json({ error: 'reauthentication_required', message: 'Sign in again before deleting your account.' }, 403);
    let confirmation;
    try { confirmation = await req.json(); } catch { return json({ error: 'invalid_confirmation' }, 400); }
    if (confirmation?.confirmation !== 'DELETE') return json({ error: 'invalid_confirmation' }, 400);
    const userId = auth.user.id;
    // Policies only allow flat files within the user's own avatar folder.
    for (;;) {
      const { data: objects, error: listError } = await admin.storage.from('avatars').list(userId, { limit: 100 });
      if (listError) throw listError;
      if (!objects?.length) break;
      const paths = objects.filter((file) => file.id).map((file) => `${userId}/${file.name}`);
      if (paths.length !== objects.length) throw new Error('Unexpected avatar folder.');
      const { error: removeError } = await admin.storage.from('avatars').remove(paths);
      if (removeError) throw removeError;
    }
    // Revoke refresh sessions before deletion. Already-issued access JWTs cannot recreate
    // profiles/backups because their auth.users foreign key disappears with the account.
    const { error: signOutError } = await admin.auth.admin.signOut(auth.token, 'global');
    if (signOutError) throw signOutError;
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) throw deleteError;
    return json({ deleted: true, subscription_cancelled: false });
  } catch {
    console.error('Account deletion failed.');
    return json({ error: 'account_deletion_failed', message: 'Account deletion could not be completed. Please sign in and try again.' }, 503);
  }
});
