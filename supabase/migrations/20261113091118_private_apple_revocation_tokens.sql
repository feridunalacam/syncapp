-- Server-only Apple refresh tokens, encrypted by the Edge Function with a
-- separate 32-byte AES-GCM key. This schema is never exposed to the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.apple_revocation_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  apple_subject text not null check (length(apple_subject) between 1 and 255),
  client_id text not null check (client_id = 'com.feridun.syncapp'),
  sealed_token jsonb not null check (coalesce(
    jsonb_typeof(sealed_token) = 'object' and
    sealed_token->'version' = '1'::jsonb and
    jsonb_typeof(sealed_token->'iv') = 'string' and
    jsonb_typeof(sealed_token->'ciphertext') = 'string' and
    sealed_token->>'iv' ~ '^[A-Za-z0-9_-]{16}$' and
    length(sealed_token->>'ciphertext') between 23 and 12000 and
    sealed_token->>'ciphertext' ~ '^[A-Za-z0-9_-]+$' and
    sealed_token - 'version' - 'iv' - 'ciphertext' = '{}'::jsonb,
    false
  )),
  updated_at timestamptz not null default now()
);
alter table private.apple_revocation_tokens enable row level security;
revoke all on private.apple_revocation_tokens from public, anon, authenticated, service_role;

-- Explicitly service-role-only, including removal of the default PUBLIC EXECUTE.
-- SECURITY DEFINER is required to reach the unexposed private table; no client
-- role can call either function. The write also rechecks the live Auth identity.
create function public.store_apple_revocation_token(
  target_user_id uuid, target_apple_subject text, target_client_id text, sealed_token jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = target_user_id for key share;
  if not found then raise exception 'Account unavailable' using errcode = '42501'; end if;
  if not exists (
    select 1 from auth.identities
    where user_id = target_user_id and provider = 'apple'
      and identity_data->>'sub' = target_apple_subject
  ) then raise exception 'Apple identity unavailable' using errcode = '42501'; end if;
  insert into private.apple_revocation_tokens(user_id, apple_subject, client_id, sealed_token)
    values (target_user_id, target_apple_subject, target_client_id, sealed_token)
    on conflict (user_id) do update set apple_subject = excluded.apple_subject,
      client_id = excluded.client_id, sealed_token = excluded.sealed_token, updated_at = now();
end;
$$;
create function public.get_apple_revocation_token(target_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('apple_subject', apple_subject, 'client_id', client_id, 'sealed_token', sealed_token)
  from private.apple_revocation_tokens where user_id = target_user_id;
$$;
revoke all on function public.store_apple_revocation_token(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.get_apple_revocation_token(uuid) from public, anon, authenticated;
grant execute on function public.store_apple_revocation_token(uuid,text,text,jsonb) to service_role;
grant execute on function public.get_apple_revocation_token(uuid) to service_role;
