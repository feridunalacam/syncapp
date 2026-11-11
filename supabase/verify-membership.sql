-- Run with the SQL editor/execute_sql after applying the migration.
-- All fixtures and writes are rolled back; no real account or subscription is modified.
begin;
create temporary table membership_test_context (user_a uuid, user_b uuid);
insert into membership_test_context values (gen_random_uuid(), gen_random_uuid());
grant select on membership_test_context to authenticated, service_role;
insert into auth.users(id) select user_a from membership_test_context union all select user_b from membership_test_context;
insert into public.profiles(id, display_name) select user_a, 'RLS fixture A' from membership_test_context union all select user_b, 'RLS fixture B' from membership_test_context;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true) from membership_test_context;
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: profile ownership leak'; end if;
  if has_table_privilege('authenticated', 'public.entitlements', 'INSERT') then raise exception 'FAIL: client can grant subscription'; end if;
  if has_function_privilege('authenticated', 'public.begin_subscription_sync(uuid,text)', 'EXECUTE') then raise exception 'FAIL: client can reserve billing writes'; end if;
  if has_function_privilege('authenticated', 'public.apply_subscription_sync(uuid,bigint,timestamptz,text,text,text)', 'EXECUTE') then raise exception 'FAIL: client can change billing'; end if;
  begin
    perform * from public.save_account_backup(0, '{"version":1,"data":{}}'::jsonb, (select user_a from membership_test_context));
    raise exception 'FAIL: Free account wrote a Pro backup';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
insert into public.entitlements(user_id,entitlement_id,expires_at,environment)
select user_a,'pro',now()+interval '1 hour','PRODUCTION' from membership_test_context
union all select user_b,'pro',now()+interval '1 hour','PRODUCTION' from membership_test_context;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true) from membership_test_context;
do $$
declare saved public.account_backups;
begin
  select * into saved from public.save_account_backup(0, '{"version":1,"data":{"routines":[]}}'::jsonb, (select user_a from membership_test_context));
  if saved.revision <> 1 then raise exception 'FAIL: first backup revision'; end if;
  begin
    perform * from public.save_account_backup(0, '{"version":1,"data":{}}'::jsonb, (select user_a from membership_test_context));
    raise exception 'FAIL: stale backup overwrote data';
  exception when serialization_failure then null;
  end;
  select * into saved from public.save_account_backup(1, '{"version":1,"data":{"routines":[{"id":"test"}]}}'::jsonb, (select user_a from membership_test_context));
  if saved.revision <> 2 then raise exception 'FAIL: backup revision did not increment'; end if;
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true) from membership_test_context;
do $$
begin
  if (select count(*) from public.account_backups) <> 0 then raise exception 'FAIL: cross-account backup read'; end if;
  if has_function_privilege('authenticated', 'public.save_account_backup(bigint,jsonb)', 'EXECUTE') then raise exception 'FAIL: unsafe old backup RPC remains executable'; end if;
  begin
    perform * from public.save_account_backup(0, '{"version":1,"data":{}}'::jsonb, (select user_a from membership_test_context));
    raise exception 'FAIL: stale account payload was written using a different login';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.entitlements) <> 1 then raise exception 'FAIL: cross-account entitlement read'; end if;
  begin
    insert into public.account_backups(user_id,payload) select user_a,'{}'::jsonb from membership_test_context;
    raise exception 'FAIL: cross-account backup write';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set local role service_role;
do $$
declare target uuid; older bigint; newer bigint; duplicate bigint; success boolean;
begin
  select user_a into target from membership_test_context;
  older := public.begin_subscription_sync(target, 'fixture-event');
  newer := public.begin_subscription_sync(target, 'fixture-event');
  success := public.apply_subscription_sync(target, older, now()+interval '1 year','app_store','PRODUCTION','fixture-event');
  if success then raise exception 'FAIL: stale subscription refresh applied'; end if;
  success := public.apply_subscription_sync(target, newer, now()+interval '1 day','app_store','PRODUCTION','fixture-event');
  if not success then raise exception 'FAIL: current subscription refresh rejected'; end if;
  duplicate := public.begin_subscription_sync(target, 'fixture-event');
  if duplicate is not null then raise exception 'FAIL: duplicate webhook was not idempotent'; end if;
end;
$$;
reset role;
update public.entitlements set expires_at = now()-interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true) from membership_test_context;
do $$
begin
  if (select count(*) from public.account_backups) <> 0 then raise exception 'FAIL: expired subscription can access cloud'; end if;
end;
$$;
reset role;
select 'PASS: profiles, billing permissions, Pro access, account isolation, backup conflicts, subscription ordering and duplicate events' as result;
rollback;
