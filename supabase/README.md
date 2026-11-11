# Account and subscription backend

The migration installs owner-only profiles, server-written `pro` entitlements, private avatar storage, and Pro-only cloud backups. Nothing in a user's profile or JWT `user_metadata` grants premium access.

## Client contracts

- `profiles`: `id`, `display_name`, `bio`, `social_links` (JSON object), `avatar_path`, `created_at`, `updated_at`. Signed-in users can select/insert/update only their own profile. Upsert the profile before uploading an avatar.
- `avatars`: private bucket; objects are flat files under `<user UUID>/<filename>`. Maximum 5 MB, JPEG/PNG/WebP. Use signed URLs, never persist an expiring signed URL as the avatar path.
- `entitlements`: select own row where `entitlement_id = 'pro'`; active when `expires_at > now()`. `store`, `environment`, `updated_at` are additional context. A missing/expired row means Free. A network failure means status is unknown; it does not prove cancellation.
- `account_backups`: `user_id`, `payload`, `revision`, `updated_at`. A JSON object up to 2 MB. All reads and writes require an active Pro entitlement; owners may delete their backup even after expiry.
- `save_account_backup({ expected_revision, backup_payload, backup_user_id })`: returns one backup row. Always pass the UUID of the account that owns the queued snapshot as `backup_user_id`; it must match the caller JWT. This prevents a pending write from crossing accounts during a login change. Use `expected_revision: 0` only to create the first backup. Successful saves increment revision. SQLSTATE `40001` means another device changed the backup; fetch/reconcile before retrying. Do not automatically replace another device's newer backup.
- `sync-subscription`: authenticated POST, no trusted request body fields. Returns `{ entitlement }` only after server verification. Until RevenueCat credentials are configured, returns 503 and leaves existing verified entitlements untouched.
- `delete-account`: authenticated POST with `{ "confirmation": "DELETE" }`. Requires a real sign-in within the last 15 minutes (`last_sign_in_at`, not JWT refresh time); otherwise returns 403 `reauthentication_required`. Removes avatars, revokes refresh sessions, hard-deletes Auth account and cascades profiles/backups/entitlements. Client clears account-scoped cache after success. This does **not** cancel the user's Apple/Google subscription: show that clearly and provide the store management link before deletion.

All Edge Functions validate their own authorization. `revenuecat-webhook` accepts only the configured bearer secret; auth functions call Supabase Auth `getUser` with the user's JWT. They must not trust a user ID in JSON input.

## Required server configuration

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the following in Edge Function secrets:

- `REVENUECAT_SECRET_API_KEY`: RevenueCat secret key with permission to read customer/subscription information via REST API v1.
- `REVENUECAT_WEBHOOK_SECRET`: generate a high-entropy random value. Configure RevenueCat's webhook Authorization header as `Bearer <value>`.
- `REVENUECAT_ENTITLEMENT_ID`: defaults to `sync_pro`, matching the existing RevenueCat project; map monthly and yearly products to this entitlement. The internal database entitlement remains `pro`.
- `REVENUECAT_ENVIRONMENT`: defaults to `PRODUCTION`. Use `SANDBOX` only in an isolated test Supabase project. Never switch a live project to sandbox to test purchases.

Webhook URL: `<SUPABASE_URL>/functions/v1/revenuecat-webhook`. Configure production subscription events, including transfers; events for the other environment are ignored. Configure app user IDs to the signed-in Supabase UUID and do not send email/name attributes unnecessarily. Anonymous SDK IDs are deliberately ignored by the webhook.

The backend obtains canonical Customer Info from RevenueCat after notifications and checks entitlement expiry, grace period, refund and sandbox state. Cancellation preserves access until expiry. Monthly/yearly recurring products are supported; lifetime/promotional products are deliberately not recognized. Backend-only RPCs reserve an ordered generation before the external lookup; stale requests cannot overwrite newer results, and completed event IDs are idempotent. Webhook processing returns a retryable error on upstream failures; no failure is interpreted as a refund.

## Deployment and validation

Generate a migration with the installed Supabase CLI's `migration new` command, then copy the reviewed schema into that generated file. Apply to the intended hosted project using the Supabase migration tool. Deploy the three Edge Functions including `_shared` dependencies and `deno.json`. The webhook uses its own bearer authentication; auth endpoints also verify the caller with `getUser`.

Run `supabase/verify-membership.sql` via SQL editor/`execute_sql`: it creates random isolated fixtures, verifies RLS and concurrency behavior, and rolls everything back. Run `npm test` for subscription rules, then check Supabase security/performance advisors. No synthetic test entitlement should remain in a production account. Real sandbox renewal/refund/restore tests require store products and RevenueCat credentials and cannot be replaced by these unit tests.

Official references:

- [Supabase user data and deletion](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RevenueCat Customer Info model](https://www.revenuecat.com/docs/api-v1/customer-info-model)
- [RevenueCat webhook verification and canonical refresh](https://www.revenuecat.com/docs/integrations/webhooks)
