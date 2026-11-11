-- Sync account data and server-verified subscriptions. No service key belongs in the app.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  bio text not null default '' check (char_length(bio) <= 2000),
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object' and octet_length(social_links::text) <= 10000),
  avatar_path text check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 512)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create table public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id text not null check (entitlement_id = 'pro'),
  expires_at timestamptz not null,
  store text,
  environment text not null check (environment in ('PRODUCTION', 'SANDBOX')),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement_id)
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from public, anon, authenticated;
grant select on public.entitlements to authenticated;
grant all on public.entitlements to service_role;
create policy entitlements_read_own on public.entitlements for select to authenticated using (user_id = (select auth.uid()));

create table public.account_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.account_backups enable row level security;
revoke all on public.account_backups from public, anon, authenticated;
grant select, insert, update, delete on public.account_backups to authenticated;
grant all on public.account_backups to service_role;
create policy backups_read_own_pro on public.account_backups for select to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.entitlements e where e.user_id = (select auth.uid()) and e.entitlement_id = 'pro' and e.expires_at > now()));
create policy backups_insert_own_pro on public.account_backups for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.entitlements e where e.user_id = (select auth.uid()) and e.entitlement_id = 'pro' and e.expires_at > now()));
create policy backups_update_own_pro on public.account_backups for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.entitlements e where e.user_id = (select auth.uid()) and e.entitlement_id = 'pro' and e.expires_at > now()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.entitlements e where e.user_id = (select auth.uid()) and e.entitlement_id = 'pro' and e.expires_at > now()));
-- Account owners can always remove their backup, including after their subscription expires.
create policy backups_delete_own on public.account_backups for delete to authenticated using (user_id = (select auth.uid()));

create function public.save_account_backup(expected_revision bigint, backup_payload jsonb)
returns setof public.account_backups language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid backup revision' using errcode = '22023'; end if;
  return query
    insert into public.account_backups as existing (user_id, payload, revision, updated_at)
    select (select auth.uid()), backup_payload, 1, now() where expected_revision = 0
    on conflict (user_id) do nothing
    returning existing.*;
  if found then return; end if;
  return query
    update public.account_backups as existing set payload = backup_payload, revision = existing.revision + 1, updated_at = now()
    where existing.user_id = (select auth.uid()) and existing.revision = expected_revision
    returning existing.*;
  if not found then raise exception 'Backup changed on another device. Reload before saving.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.save_account_backup(bigint, jsonb) from public, anon;
grant execute on function public.save_account_backup(bigint, jsonb) to authenticated;

-- Backend-only sequence per user. A late RevenueCat request cannot replace a newer refresh.
create table private.subscription_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 0,
  last_started_at timestamptz not null default now()
);
create table private.subscription_webhook_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table private.subscription_sync_state enable row level security;
alter table private.subscription_webhook_events enable row level security;
revoke all on private.subscription_sync_state, private.subscription_webhook_events from public, anon, authenticated;
grant all on private.subscription_sync_state, private.subscription_webhook_events to service_role;

create function public.begin_subscription_sync(target_user_id uuid, webhook_event_id text default null)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_generation bigint;
begin
  if webhook_event_id is not null and exists (select 1 from private.subscription_webhook_events where user_id = target_user_id and event_id = webhook_event_id) then return null; end if;
  insert into private.subscription_sync_state as existing(user_id, generation) values(target_user_id, 1)
    on conflict(user_id) do update set generation = existing.generation + 1, last_started_at = now()
    returning generation into next_generation;
  return next_generation;
end;
$$;
revoke all on function public.begin_subscription_sync(uuid,text) from public, anon, authenticated;
grant execute on function public.begin_subscription_sync(uuid,text) to service_role;

create function public.apply_subscription_sync(target_user_id uuid, sync_generation bigint, valid_until timestamptz, purchase_store text, purchase_environment text, webhook_event_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_generation bigint;
begin
  select generation into current_generation from private.subscription_sync_state where user_id = target_user_id for update;
  if current_generation is distinct from sync_generation then return false; end if;
  insert into public.entitlements(user_id,entitlement_id,expires_at,store,environment,updated_at)
    values(target_user_id,'pro',valid_until,purchase_store,purchase_environment,now())
    on conflict(user_id,entitlement_id) do update set expires_at = excluded.expires_at, store = excluded.store, environment = excluded.environment, updated_at = excluded.updated_at;
  if webhook_event_id is not null then
    insert into private.subscription_webhook_events(user_id,event_id) values(target_user_id,webhook_event_id) on conflict do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.apply_subscription_sync(uuid,bigint,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_subscription_sync(uuid,bigint,timestamptz,text,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.profiles p where p.id = (select auth.uid())));
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.profiles p where p.id = (select auth.uid())) and array_length(storage.foldername(name),1) = 1);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.profiles p where p.id = (select auth.uid())))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.profiles p where p.id = (select auth.uid())) and array_length(storage.foldername(name),1) = 1);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.profiles p where p.id = (select auth.uid())));
