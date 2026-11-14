# Review billing rollout runbook

Prepared **12 November 2026** for the existing Supabase project. **Preparation only:** two approval requests for live resources/deployment and two dedicated reviewer accounts remain pending. No review RevenueCat project/key, hosted migration/function, reviewer reservation, notification cutover or purchase-to-Pro result is established. Use Free services only; do not create another Supabase project. [Source evidence and current validation boundaries](review-billing-offline-evidence.json).

## 1. Approvals, disclosure and migration

Confirm the approved scope before any external action. Publish the reviewed [privacy amendment](review-billing-privacy-amendment.md) **before or with migration activation**, not merely before the first review purchase: migration backfill immediately creates permanent production classifications for existing Auth users. The retained registry holds UUID + lane after account deletion, including production users; it is pseudonymous account data, not anonymous data.

Inspect the target schema/migration history and confirm existing recovery arrangements; no paid backup service is authorized. Inspect only entitlement environment counts, not customer payloads:

```sql
select environment, count(*) from public.entitlements group by environment;
select count(*) as incompatible_rows
from public.entitlements where environment is distinct from 'PRODUCTION';
```

Require zero incompatible rows before adding `production_entitlements_only`. Stop on unexpected rows; do not relabel sandbox receipts as production or fabricate grants. Apply the reviewed [migration](../supabase/migrations/20261112152101_isolated_review_billing.sql), then verify grants/RLS, own-account scope resolution and production compatibility. It backfills **existing Auth users as production**, with UUID namespace/epoch 0. Therefore create the new review Auth accounts **after migration**, not beforehand. The scope backfill joins the classified production registry to Auth users; later arrivals resolve through the RPC.

## 2. Separate RevenueCat credentials and server deployment

After approval, create the separate Free RevenueCat project and App Store app for the existing bundle `com.feridun.syncapp`. Its server credentials must exist before secrets can be configured; catalog completion and the public build key follow in step 4. Reuse existing Apple IAP credentials only within the explicitly approved scope. Keep the production project, credentials and production notification route intact.

Configure only these new server secrets in the existing Supabase project:

- `REVENUECAT_REVIEW_SECRET_API_KEY`: the separate review project's server API key.
- `REVENUECAT_REVIEW_WEBHOOK_SECRET`: a distinct review webhook bearer secret.

The implementation rejects equality with the respective production secrets. Preserve `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SECRET` and production environment `PRODUCTION`. No private value belongs in `EXPO_PUBLIC_*`, Git, command output, screenshots or logs.

Deploy the reviewed `sync-subscription`, `revenuecat-webhook` and new `revenuecat-review-webhook` with their shared sources and [function configuration](../supabase/config.toml). Each handler authenticates requests itself. Verify unauthorized requests fail after configuration, and authenticated canonical **Free** sync still works. A 401, catalog response or successful deployment proves neither purchase nor Pro. The sync response is `{scope, entitlement}` with an optional review rejection code; clients cannot choose the lane through request bodies.

## 3. Provision and reserve two unused reviewers

Use the official Supabase Auth dashboard/admin API to create the approved fresh accounts. **Do not insert Auth users with SQL.** Before either account signs in, runs scope resolution, receives a production webhook refresh or writes a profile/backup, invoke the service-only `reserve_review_account(target_user_id, valid_until)` with its approved fixed expiry. The proposed two 30-day windows are still pending approval.

Verify each returned scope: its Auth UUID, `lane='review'`, `namespace='review:1:<uuid>'`, `epoch=1`, active status and exact fixed expiry. Reservation refuses an account with prior production classification/data. If rejected, stop; never delete a registry row or convert an existing user to review. Production resolution and profile/billing writes can permanently claim the UUID first. Revocation/expiry is terminal: no extension, re-enable or reclassification; a new window requires a new authorized UUID. Keep passwords/credentials out of evidence files and provide them only through the authorized review process.

## 4. Catalog, public build key and sandbox notifications

Finish the review App Store catalog with entitlement `sync_pro`, the actual monthly/yearly product IDs `com.feridun.syncapp.pro.monthly` and `com.feridun.syncapp.pro.yearly`, and the intended offering/packages. Record the review project's restore behavior before transfer testing; do not assume production settings were copied.

Set `EXPO_PUBLIC_REVENUECAT_REVIEW_IOS_API_KEY` to that project's distinct **`appl_` public SDK key** in the intended EAS environments. Preserve the production public key. iOS preview/production preflight now blocks missing, shared, placeholder, private or Test Store review keys. Use the existing registered checks; format checks do not verify hosted values or live products.

Configure the review project's RevenueCat webhook for sandbox events to the implemented existing-project route `/functions/v1/revenuecat-review-webhook`, using its distinct bearer secret. Apple has one production URL and one sandbox URL: any approved **sandbox-only** URL change to the review project's Apple notification destination affects all sandbox notifications for this bundle. Obtain that destination from RevenueCat; do not invent it or assume dual delivery. Preserve Apple's production URL and the production RevenueCat webhook's production-only filter. Initial SDK purchase/canonical-refresh testing and full notification lifecycle verification are separate gates; the former must not be called proof of the latter.

## 5. New build and acceptance evidence

Build, inspect, deliver and install a **new Store client** containing this source/configuration. Existing Store **1.0.0 (4)** remains production-compatible but contains no review routing and cannot validate sandbox-to-canonical Pro. The earlier standalone native product/offering probe is catalog evidence only. No real review purchase is proven yet.

Start each project boundary in a cold app process. Native Purchases is configured once after fresh server scope resolution; crossing production/review keys requires a full process restart, not a JS reload. Cache selects local storage only. Unknown scope disables paid/cloud actions; review never imports guest data or falls back to production.

| Check on the new delivered client | Required evidence                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewer A purchase               | Real Apple sandbox transaction; separate-project canonical `app_store`/`SANDBOX` receipt for an allowed product; only matching `review_entitlements` gains access. SDK-active alone grants nothing.                                                                      |
| Lease and lifecycle               | Access is capped at five minutes, canonical expiry and reservation expiry. Verify foreground renewal, background/no-renewal expiry, cancellation through paid expiry, accelerated renewal, refund/revocation and notification retry/deduplication.                       |
| A → B restore/transfer            | Both reserved accounts stay in the review project; canonical ownership/access follows the recorded restore policy. Account data remains separate and neither account gains production access.                                                                            |
| Isolation and deletion            | Check exact review local/backup namespaces, production RLS fences, no guest import, stale-callback rejection and confirmed deletion cleanup. Live data cascades; the UUID/lane registry remains. Preserve other accounts/guest data.                                     |
| Production compatibility          | Existing client/account scope and canonical Free behavior still work; production accepts no sandbox grants. Use offline fixtures for production-receipt rejection cases unless a separate live test is authorized; never restore an owner's real purchase as a shortcut. |

Record sanitized build/source identifiers, outcomes and timestamps; no tokens, passwords, raw receipts or personal payloads. Add actual evidence only after observation. Offline SQL tests include deterministic statement ordering and RLS, **not real two-connection concurrency**.

## Stop, containment and rollback

On isolation failure, stop testing/distribution and revoke the affected review scopes with `revoke_review_account`; verify cloud denial and cease review notification delivery as authorized. Remove/disable only review configuration if needed. Do not change production routing, manually grant production Pro, reopen reviewers or erase the permanent registry. Prefer a reviewed forward fix; restoring an older client does not undo server classifications or retention disclosures.

Hosted forward migration/deployment, provider cutover, delivered review-client runtime, actual purchases/lifecycle/transfers, two-connection database races and rollback/redeploy behavior remain unverified. **No down migration or destructive rollback has been tested.** Retain the registry/fences and the matching privacy disclosure through containment; do not promise that a rollback erases them.
