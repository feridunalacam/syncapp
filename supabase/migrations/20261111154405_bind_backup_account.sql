-- Bind every backup write to the account that queued it on the client.
-- A token/session change during a pending request must never move one account's
-- payload into another account's backup, even when both accounts have Pro.
-- Keep the previous overload for migration compatibility but remove all client access.
revoke all on function public.save_account_backup(bigint, jsonb) from public, anon, authenticated;

create function public.save_account_backup(expected_revision bigint, backup_payload jsonb, backup_user_id uuid)
returns setof public.account_backups language plpgsql security invoker set search_path = '' as $$
begin
  if backup_user_id is null or backup_user_id is distinct from (select auth.uid()) then
    raise exception 'Backup account does not match the authenticated user.' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid backup revision' using errcode = '22023'; end if;
  return query
    insert into public.account_backups as existing (user_id, payload, revision, updated_at)
    select backup_user_id, backup_payload, 1, now() where expected_revision = 0
    on conflict (user_id) do nothing
    returning existing.*;
  if found then return; end if;
  return query
    update public.account_backups as existing set payload = backup_payload, revision = existing.revision + 1, updated_at = now()
    where existing.user_id = backup_user_id and existing.revision = expected_revision
    returning existing.*;
  if not found then raise exception 'Backup changed on another device. Reload before saving.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.save_account_backup(bigint, jsonb, uuid) from public, anon;
grant execute on function public.save_account_backup(bigint, jsonb, uuid) to authenticated;
