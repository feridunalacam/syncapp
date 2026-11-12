-- OFFLINE PREPARATION ONLY. No reviewer is enrolled and no entitlement is granted here.
-- This tiny, permanent registry retains a pseudonymous UUID and its security lane
-- after account deletion. Never store emails, backup payloads or financial data here.
create table public.account_billing_scope_registry (
  user_id uuid primary key,
  lane text not null check (lane in ('production', 'review')),
  unique (user_id, lane)
);
alter table public.account_billing_scope_registry enable row level security;
revoke all on public.account_billing_scope_registry from public, anon, authenticated, service_role;
grant select, insert on public.account_billing_scope_registry to authenticated, service_role;
create policy scope_registry_read_own on public.account_billing_scope_registry for select to authenticated
  using (user_id = (select auth.uid()));
create policy scope_registry_claim_production on public.account_billing_scope_registry for insert to authenticated
  with check (user_id = (select auth.uid()) and lane = 'production');

create function private.guard_billing_registry() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Billing classification is permanent.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 724619));
  return new;
end;
$$;
create trigger billing_registry_immutable before insert or update or delete on public.account_billing_scope_registry
  for each row execute function private.guard_billing_registry();

create table public.account_billing_scopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lane text not null,
  namespace text not null,
  epoch integer not null,
  active boolean not null,
  expires_at timestamptz,
  foreign key (user_id, lane) references public.account_billing_scope_registry(user_id, lane),
  unique (user_id, namespace, epoch),
  check ((lane = 'production' and namespace = user_id::text and epoch = 0 and active and expires_at is null)
    or (lane = 'review' and namespace = 'review:1:' || user_id::text and epoch = 1 and expires_at is not null))
);
alter table public.account_billing_scopes enable row level security;
revoke all on public.account_billing_scopes from public, anon, authenticated, service_role;
grant select, insert on public.account_billing_scopes to authenticated;
grant select, insert, update on public.account_billing_scopes to service_role;
create policy billing_scope_read_own on public.account_billing_scopes for select to authenticated
  using (user_id = (select auth.uid()));
create policy billing_scope_claim_production on public.account_billing_scopes for insert to authenticated
  with check (user_id = (select auth.uid()) and lane = 'production');

create function private.guard_billing_scope() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 724619));
  if tg_op = 'UPDATE' and (
    (new.user_id, new.lane, new.namespace, new.epoch, new.expires_at)
      is distinct from (old.user_id, old.lane, old.namespace, old.epoch, old.expires_at)
    or (old.active = false and new.active = true)
    or (old.lane = 'production' and new.active is distinct from old.active)
  ) then raise exception 'Billing scope cannot be reassigned or reopened.' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger billing_scope_immutable before insert or update on public.account_billing_scopes
  for each row execute function private.guard_billing_scope();

-- Older clients already use the production UUID namespace. They must never be
-- reclassified into review, including accounts without a paid entitlement.
insert into public.account_billing_scope_registry(user_id, lane) select id, 'production' from auth.users;
-- READ COMMITTED may see newer Auth users in this statement. Only backfill
-- identities actually classified above; later arrivals resolve normally by RPC.
insert into public.account_billing_scopes(user_id, lane, namespace, epoch, active, expires_at)
  select u.id, 'production', u.id::text, 0, true, null
  from public.account_billing_scope_registry r
  join auth.users u on u.id = r.user_id
  where r.lane = 'production';

create function public.get_account_billing_scope() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target uuid := (select auth.uid()); scope public.account_billing_scopes;
begin
  if target is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text, 724619));
  insert into public.account_billing_scope_registry(user_id, lane) values(target, 'production') on conflict do nothing;
  if exists(select 1 from public.account_billing_scope_registry where user_id = target and lane = 'production') then
    insert into public.account_billing_scopes(user_id, lane, namespace, epoch, active, expires_at)
      values(target, 'production', target::text, 0, true, null) on conflict do nothing;
  end if;
  select * into scope from public.account_billing_scopes where user_id = target;
  if not found then raise exception 'Billing scope is unavailable.' using errcode = '42501'; end if;
  return jsonb_build_object('user_id',scope.user_id,'lane',scope.lane,'namespace',scope.namespace,'epoch',scope.epoch,
    'active',scope.active and (scope.expires_at is null or scope.expires_at > now()),'expires_at',scope.expires_at);
end;
$$;
revoke all on function public.get_account_billing_scope() from public, anon;
grant execute on function public.get_account_billing_scope() to authenticated;

create function public.get_account_billing_scope_for_user(target_user_id uuid, create_production boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare scope public.account_billing_scopes;
begin
  if target_user_id is null then raise exception 'Account required.' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 724619));
  if create_production then
    insert into public.account_billing_scope_registry(user_id, lane) values(target_user_id, 'production') on conflict do nothing;
    if exists(select 1 from public.account_billing_scope_registry where user_id = target_user_id and lane = 'production') then
      insert into public.account_billing_scopes(user_id, lane, namespace, epoch, active, expires_at)
        values(target_user_id, 'production', target_user_id::text, 0, true, null) on conflict do nothing;
    end if;
  end if;
  select * into scope from public.account_billing_scopes where user_id = target_user_id;
  if not found then return null; end if;
  return jsonb_build_object('user_id',scope.user_id,'lane',scope.lane,'namespace',scope.namespace,'epoch',scope.epoch,
    'active',scope.active and (scope.expires_at is null or scope.expires_at > now()),'expires_at',scope.expires_at);
end;
$$;
revoke all on function public.get_account_billing_scope_for_user(uuid,boolean) from public, anon, authenticated;
grant execute on function public.get_account_billing_scope_for_user(uuid,boolean) to service_role;

create function public.reserve_review_account(target_user_id uuid, valid_until timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if target_user_id is null or valid_until is null or valid_until <= now() then
    raise exception 'A future review expiry is required.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 724619));
  if exists(select 1 from public.account_billing_scope_registry where user_id = target_user_id)
    or exists(select 1 from public.entitlements where user_id = target_user_id)
    or exists(select 1 from public.account_backups where user_id = target_user_id)
    or exists(select 1 from public.profiles where id = target_user_id)
    or exists(select 1 from private.subscription_sync_state where user_id = target_user_id)
    or exists(select 1 from storage.objects where bucket_id = 'avatars' and (storage.foldername(name))[1] = target_user_id::text)
  then raise exception 'Only an unused account can be reserved for review.' using errcode = '42501'; end if;
  insert into public.account_billing_scope_registry(user_id, lane) values(target_user_id, 'review');
  insert into public.account_billing_scopes(user_id, lane, namespace, epoch, active, expires_at)
    values(target_user_id, 'review', 'review:1:' || target_user_id::text, 1, true, valid_until);
  return public.get_account_billing_scope_for_user(target_user_id, false);
end;
$$;
revoke all on function public.reserve_review_account(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_review_account(uuid,timestamptz) to service_role;

create function public.revoke_review_account(target_user_id uuid) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 724619));
  update public.account_billing_scopes set active = false where user_id = target_user_id and lane = 'review';
end;
$$;
revoke all on function public.revoke_review_account(uuid) from public, anon, authenticated;
grant execute on function public.revoke_review_account(uuid) to service_role;

-- An authenticated caller can see only its own immutable classification. No JWT
-- metadata or request body selects a lane. Restrictive policies fence legacy APIs too.
create policy production_entitlement_fence on public.entitlements as restrictive for all to authenticated
  using (environment = 'PRODUCTION' and not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'));
create policy production_backup_fence on public.account_backups as restrictive for all to authenticated
  using (not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'))
  with check (not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'));
create policy production_profile_fence on public.profiles as restrictive for all to authenticated
  using (not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'))
  with check (not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'));
create policy production_avatar_fence on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'avatars' or not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'))
  with check (bucket_id <> 'avatars' or not exists(select 1 from public.account_billing_scope_registry r where r.user_id = (select auth.uid()) and r.lane = 'review'));
alter table public.entitlements add constraint production_entitlements_only check (environment = 'PRODUCTION');

create function private.guard_production_billing_data() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 724619));
  insert into public.account_billing_scope_registry(user_id, lane) values(new.user_id, 'production') on conflict do nothing;
  if exists(select 1 from public.account_billing_scope_registry where user_id = new.user_id and lane = 'review') then
    raise exception 'Review accounts cannot use production billing data.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger production_entitlement_scope before insert or update on public.entitlements
  for each row execute function private.guard_production_billing_data();
create trigger production_backup_scope before insert or update on public.account_backups
  for each row execute function private.guard_production_billing_data();

-- Profile RLS alone cannot serialize an old client's raw write with enrollment.
-- Take the same per-UID lock and permanent production claim before any write.
create function private.guard_production_profile_data() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 724619));
  insert into public.account_billing_scope_registry(user_id, lane) values(new.id, 'production') on conflict do nothing;
  if exists(select 1 from public.account_billing_scope_registry where user_id = new.id and lane = 'review') then
    raise exception 'Review accounts cannot use production profile data.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger production_profile_scope before insert or update on public.profiles
  for each row execute function private.guard_production_profile_data();

create or replace function public.begin_subscription_sync(target_user_id uuid, webhook_event_id text default null)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_generation bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 724619));
  insert into public.account_billing_scope_registry(user_id, lane) values(target_user_id, 'production') on conflict do nothing;
  if exists(select 1 from public.account_billing_scope_registry where user_id = target_user_id and lane = 'review') then
    raise exception 'Review account cannot start production verification.' using errcode = '42501';
  end if;
  if webhook_event_id is not null and exists(select 1 from private.subscription_webhook_events where user_id = target_user_id and event_id = webhook_event_id) then return null; end if;
  insert into private.subscription_sync_state as existing(user_id,generation) values(target_user_id,1)
    on conflict(user_id) do update set generation = existing.generation + 1,last_started_at = now() returning generation into next_generation;
  return next_generation;
end;
$$;
create or replace function public.apply_subscription_sync(target_user_id uuid, sync_generation bigint, valid_until timestamptz, purchase_store text, purchase_environment text, webhook_event_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_generation bigint;
begin
  if sync_generation is null or sync_generation <= 0 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 724619));
  if purchase_environment is distinct from 'PRODUCTION' or exists(select 1 from public.account_billing_scope_registry where user_id = target_user_id and lane = 'review') then
    raise exception 'Production verification requires a production account and receipt.' using errcode = '42501';
  end if;
  select generation into current_generation from private.subscription_sync_state where user_id = target_user_id for update;
  if current_generation is distinct from sync_generation then return false; end if;
  insert into public.entitlements(user_id,entitlement_id,expires_at,store,environment,updated_at)
    values(target_user_id,'pro',valid_until,purchase_store,purchase_environment,now())
    on conflict(user_id,entitlement_id) do update set expires_at=excluded.expires_at,store=excluded.store,environment=excluded.environment,updated_at=excluded.updated_at;
  if webhook_event_id is not null then insert into private.subscription_webhook_events(user_id,event_id) values(target_user_id,webhook_event_id) on conflict do nothing; end if;
  return true;
end;
$$;

create table public.review_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  namespace text not null,
  epoch integer not null check (epoch = 1),
  entitlement_id text not null check (entitlement_id = 'pro'),
  expires_at timestamptz not null,
  canonical_expires_at timestamptz not null,
  store text not null check (store = 'app_store'),
  environment text not null check (environment = 'SANDBOX'),
  product_id text check (product_id in ('com.feridun.syncapp.pro.monthly','com.feridun.syncapp.pro.yearly')),
  updated_at timestamptz not null default now(),
  foreign key (user_id,namespace,epoch) references public.account_billing_scopes(user_id,namespace,epoch) on delete cascade,
  check (namespace = 'review:1:' || user_id::text),
  check (expires_at <= canonical_expires_at and expires_at <= updated_at + interval '5 minutes'),
  check (expires_at <= updated_at or product_id is not null)
);
alter table public.review_entitlements enable row level security;
revoke all on public.review_entitlements from public, anon, authenticated;
grant select on public.review_entitlements to authenticated;
grant all on public.review_entitlements to service_role;
create policy review_entitlements_own_scope on public.review_entitlements for select to authenticated
  using (user_id = (select auth.uid()) and exists(select 1 from public.account_billing_scopes s where s.user_id = (select auth.uid()) and s.lane = 'review' and s.namespace = review_entitlements.namespace and s.epoch = review_entitlements.epoch and s.active and s.expires_at > now()));

create table public.review_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null,
  epoch integer not null check (epoch = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,namespace),
  foreign key (user_id,namespace,epoch) references public.account_billing_scopes(user_id,namespace,epoch) on delete cascade,
  check (namespace = 'review:1:' || user_id::text)
);
alter table public.review_backups enable row level security;
revoke all on public.review_backups from public, anon, authenticated;
grant select,insert,update,delete on public.review_backups to authenticated;
grant all on public.review_backups to service_role;
create policy review_backups_live_scope on public.review_backups for all to authenticated
  using (user_id = (select auth.uid()) and exists(select 1 from public.account_billing_scopes s join public.review_entitlements e on e.user_id=s.user_id and e.namespace=s.namespace and e.epoch=s.epoch where s.user_id=(select auth.uid()) and s.lane='review' and s.active and s.expires_at>now() and s.namespace=review_backups.namespace and s.epoch=review_backups.epoch and e.expires_at>now() and e.store='app_store' and e.environment='SANDBOX'))
  with check (user_id = (select auth.uid()) and exists(select 1 from public.account_billing_scopes s join public.review_entitlements e on e.user_id=s.user_id and e.namespace=s.namespace and e.epoch=s.epoch where s.user_id=(select auth.uid()) and s.lane='review' and s.active and s.expires_at>now() and s.namespace=review_backups.namespace and s.epoch=review_backups.epoch and e.expires_at>now() and e.store='app_store' and e.environment='SANDBOX'));

create function public.save_review_account_backup(expected_revision bigint, backup_payload jsonb, backup_user_id uuid, backup_namespace text, backup_epoch integer)
returns setof public.review_backups language plpgsql security invoker set search_path = '' as $$
begin
  if backup_user_id is null or backup_user_id is distinct from (select auth.uid()) then raise exception 'Backup account mismatch.' using errcode = '42501'; end if;
  if backup_namespace is distinct from 'review:1:' || backup_user_id::text or backup_epoch is distinct from 1 then raise exception 'Backup scope mismatch.' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid backup revision.' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(backup_user_id::text, 724619));
  if not exists(select 1 from public.account_billing_scopes where user_id=backup_user_id and lane='review' and namespace=backup_namespace and epoch=backup_epoch and active and expires_at>now()) then raise exception 'Review access is inactive.' using errcode='42501'; end if;
  return query insert into public.review_backups as existing(user_id,namespace,epoch,payload,revision,updated_at)
    select backup_user_id,backup_namespace,backup_epoch,backup_payload,1,now() where expected_revision=0
    on conflict(user_id,namespace) do nothing returning existing.*;
  if found then return; end if;
  return query update public.review_backups as existing set payload=backup_payload,revision=existing.revision+1,updated_at=now()
    where existing.user_id=backup_user_id and existing.namespace=backup_namespace and existing.epoch=backup_epoch and existing.revision=expected_revision returning existing.*;
  if not found then raise exception 'Backup changed on another device.' using errcode='40001'; end if;
end;
$$;
revoke all on function public.save_review_account_backup(bigint,jsonb,uuid,text,integer) from public, anon;
grant execute on function public.save_review_account_backup(bigint,jsonb,uuid,text,integer) to authenticated;

create table private.review_subscription_sync_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null,
  epoch integer not null,
  generation bigint not null default 0,
  last_started_at timestamptz not null default now(),
  primary key (user_id,namespace),
  foreign key (user_id,namespace,epoch) references public.account_billing_scopes(user_id,namespace,epoch) on delete cascade
);
create table private.review_subscription_webhook_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null,
  epoch integer not null,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (user_id,namespace,event_id),
  foreign key (user_id,namespace,epoch) references public.account_billing_scopes(user_id,namespace,epoch) on delete cascade
);
alter table private.review_subscription_sync_state enable row level security;
alter table private.review_subscription_webhook_events enable row level security;
revoke all on private.review_subscription_sync_state,private.review_subscription_webhook_events from public,anon,authenticated;
grant all on private.review_subscription_sync_state,private.review_subscription_webhook_events to service_role;

create function public.begin_review_subscription_sync(target_user_id uuid, review_namespace text, review_epoch integer, webhook_event_id text default null)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_generation bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text,724619));
  if not exists(select 1 from public.account_billing_scopes where user_id=target_user_id and lane='review' and namespace=review_namespace and epoch=review_epoch and active and expires_at>now()) then raise exception 'Review access is inactive.' using errcode='42501'; end if;
  if webhook_event_id is not null and exists(select 1 from private.review_subscription_webhook_events where user_id=target_user_id and namespace=review_namespace and event_id=webhook_event_id) then return null; end if;
  insert into private.review_subscription_sync_state as existing(user_id,namespace,epoch,generation)
    values(target_user_id,review_namespace,review_epoch,1)
    on conflict(user_id,namespace) do update set generation=existing.generation+1,last_started_at=now() returning generation into next_generation;
  return next_generation;
end;
$$;
revoke all on function public.begin_review_subscription_sync(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.begin_review_subscription_sync(uuid,text,integer,text) to service_role;

create function public.apply_review_subscription_sync(target_user_id uuid, review_namespace text, review_epoch integer, sync_generation bigint, valid_until timestamptz, canonical_valid_until timestamptz, purchase_store text, purchase_environment text, purchase_product_id text, webhook_event_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare scope public.account_billing_scopes; current_generation bigint; leased_until timestamptz;
begin
  if sync_generation is null or sync_generation <= 0 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text,724619));
  select * into scope from public.account_billing_scopes where user_id=target_user_id for update;
  if not found or scope.lane<>'review' or scope.namespace is distinct from review_namespace or scope.epoch is distinct from review_epoch or not scope.active or scope.expires_at<=now() then return false; end if;
  select generation into current_generation from private.review_subscription_sync_state where user_id=target_user_id and namespace=review_namespace for update;
  if current_generation is distinct from sync_generation then return false; end if;
  if purchase_store is distinct from 'app_store' or purchase_environment is distinct from 'SANDBOX'
    or valid_until is null or canonical_valid_until is null
    or (valid_until>now() and (purchase_product_id is null or purchase_product_id not in ('com.feridun.syncapp.pro.monthly','com.feridun.syncapp.pro.yearly')))
  then raise exception 'Invalid review purchase.' using errcode='42501'; end if;
  leased_until := least(valid_until,canonical_valid_until,scope.expires_at,now()+interval '5 minutes');
  insert into public.review_entitlements(user_id,namespace,epoch,entitlement_id,expires_at,canonical_expires_at,store,environment,product_id,updated_at)
    values(target_user_id,review_namespace,review_epoch,'pro',leased_until,canonical_valid_until,'app_store','SANDBOX',purchase_product_id,now())
    on conflict(user_id) do update set expires_at=excluded.expires_at,canonical_expires_at=excluded.canonical_expires_at,store=excluded.store,environment=excluded.environment,product_id=excluded.product_id,updated_at=excluded.updated_at;
  if webhook_event_id is not null then insert into private.review_subscription_webhook_events(user_id,namespace,epoch,event_id) values(target_user_id,review_namespace,review_epoch,webhook_event_id) on conflict do nothing; end if;
  return true;
end;
$$;
revoke all on function public.apply_review_subscription_sync(uuid,text,integer,bigint,timestamptz,timestamptz,text,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_review_subscription_sync(uuid,text,integer,bigint,timestamptz,timestamptz,text,text,text,text) to service_role;
