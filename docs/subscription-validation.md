# iOS subscription validation

This checklist distinguishes source coverage, hosted verification and actual Apple billing. It does not establish that paid subscriptions are ready to release. The current scope is **iOS only**. Apple banking, tax and seller/commercial setup remain partially complete and deferred by the owner. No new Supabase project or test backend is authorized.

## Environment boundaries

- Keep the existing production backend (`iyipvwlhiwfaeyfoyakr`) set to `REVENUECAT_ENVIRONMENT=PRODUCTION`. Never change it to accept sandbox receipts or insert lasting test entitlements.
- Production access comes only from a canonical RevenueCat response fetched server-side. Store SDK `CustomerInfo`, webhook purchase fields and client request bodies cannot grant Pro.
- A valid `TRANSFER` event may omit `environment`. Its former and new UUID owners are re-fetched separately; the canonical receipt environment still decides access. Explicit sandbox events remain ignored by production.
- Normal lifecycle events also refresh valid UUIDs in `original_app_user_id` and `aliases`, because the last-seen `app_user_id` can be anonymous. Each UUID is checked against Auth and then verified canonically; an alias by itself grants nothing.
- An Apple sandbox transaction against this production backend must remain pending/inactive for server-backed Pro. It cannot validate the successful purchase-to-Pro path in this configuration. Do not describe an SDK-only unlock, mock or manually inserted entitlement as that result.
- RevenueCat Test Store can exercise SDK behavior, but does not validate StoreKit, Apple's billing lifecycle or Apple server notifications. Xcode StoreKit testing also does not establish RevenueCat cancellation/refund webhook delivery.

## Evidence matrix

| Behavior | Evidence available | Remaining live check |
| --- | --- | --- |
| Native RevenueCat integration | Debug iOS integration links RNPurchases 11.0.1 and the account/paywall entry has been observed. Four public runtime variables are configured in all three linked EAS environments. | Final signed distribution binary and its actual runtime configuration. Apple Distribution certificate and an app-specific App Store profile were created; profile download/EAS build-credential assignment and a final archive remain open. |
| Email account and Free canonical sync | Earlier native email/password sign-in and production canonical Free sync are recorded in `membership-setup.md`. | Repeat on final source without displaying or exporting device tokens. The earlier result is not a new v4 authenticated lifecycle result. |
| Hosted functions and authentication | `delete-account`, `sync-subscription` and `revenuecat-webhook` are deployed at **version 4**. Fresh missing-credential POSTs returned **401 for all three**. Actual-handler tests cover authentication, method guards and preflight. | Successful authenticated/native lifecycle checks on the submitted version. A 401 alone does not verify a valid account action or paid purchase. |
| Production receipt isolation | The deployed v4 source preserves production filtering. Handler/rule tests reject sandbox events/receipts, including canonical lookups after environmentless transfers. No sandbox acceptance or lasting entitlement grant was introduced. | Actual Apple lifecycle remains unverified; keep production at `PRODUCTION` and do not create the declined test backend. |
| Restore transfer | v4 handlers refresh both owners, ignore deleted accounts and re-fetch canonical customer state; saved RevenueCat policy is Transfer to new App User ID. | Actual Apple restore must grant the destination and revoke the former owner without transferring private backups. Not yet observed. |
| Anonymous last-seen lifecycle events | v4 handlers re-fetch UUID original/alias identities instead of dropping an anonymous last-seen event. | Real renewal/refund delivery with the affected UUID alias and resulting hosted entitlement. |
| Pending verification | Controller tests preserve a completed purchase/restore during backend failure, block repeat checkout and re-fetch current identity information for background SDK updates. | Native payment completion, temporary network loss, refresh recovery and account switches. |
| Current-session deletion reauthentication | v4 deletion requires verified matching JWT subject/session and recent AMR authentication. Tests reject stale sessions even after another device signs in; refreshed `iat`, anonymous auth and mismatched/missing claims are insufficient. | Disposable-account stale/fresh sign-in, explicit confirmation, revocation and deletion. No real account was deleted in this audit. |
| Deletion transport/identity queue | Independent real FunctionsClient/AuthProvider tests cover held success/error response bodies, the exact-origin 30-second abort, preserved local data on unknown outcome and queued sign-out/sign-in. Explicit Auth mutations and callback exchanges are serialized. | Native cancellation and complete account deletion on an authorized disposable account; a timeout cannot be described as confirmed remote deletion. |
| Auth/RLS and billing permissions | The existing hosted project's `supabase/verify-membership.sql` checks **passed** inside a transaction that rolled back all random fixtures. No schema change was made. | This verifies real database policies/permissions, not actual JWT signature verification, a real customer deletion or an Apple transaction. |
| Paid lifecycle | Rules cover cancellation paid time, expiration, refund, grace periods, stale canonical responses and duplicate webhook events. | Actual purchase, renewal, paid cancellation through expiry, billing recovery/grace, refund and Apple-to-RevenueCat-to-Supabase notifications. No completed Apple paid lifecycle is established. |
| Ads and cloud access | Automated tests cover Pro/pending/unknown ad suppression and account isolation. Native Debug QA observed a Google test ad close, a five-second session start afterward, and completion. | Earlier Debug QA also verified Finish → test ad Close → Ready and cooldown skips. Real verified-Pro zero-ad requests and backup across two iOS devices remain open. Production ads remain disabled. |

The latest recorded full automated run passed **496/496 tests**. Handler tests execute the actual TypeScript/shared server logic with network/admin boundaries stubbed; real hosted SQL/401 checks have the narrower live scope above. Current-source platform exports and the iOS Release simulator build pass. Native Release image/transparent-sticker clipboard checks passed, and iPad visual QA is in progress. These results do not establish distribution signing, App Store readiness or Apple billing.

## Hosted verification record and repeat procedure

The three version-4 deployments, their unauthenticated 401 checks and the rolled-back hosted RLS/billing SQL checks are complete. These function/controller fixes required **no migration or schema change**. The production environment boundary and existing customer data were retained.

For a later deployment or schema change:

1. Review the exact source diff and the applicable migration scope first.
2. Run `supabase/verify-membership.sql` as one script when repeating RLS/billing checks. Retain the transaction and final rollback; it uses random temporary fixtures and leaves no lasting test entitlement. Roll back an interrupted/failed transaction before reusing its connection.
3. Record only the PASS result and sanitized errors, never access tokens, secret values, real identifiers, backup payloads or raw webhooks.
4. Repeat missing-credential POST checks after deployment. Use only the app's normal SDK session for a positive authenticated Free refresh; observe UI/backend state without copying device tokens to scripts or logs.
5. A positive Free check must show successful canonical synchronization, `environment=PRODUCTION`, inactive/no Pro expiry and no unlock. A cached read or unauthenticated 401 is insufficient.

## Remaining Apple lifecycle evidence

The final evidence should pair each legitimate store action with its resulting RevenueCat customer status, authenticated app state and hosted entitlement, without collecting credentials or unrelated customer data. For cancellation, check access continues through the paid period and ends at expiration. For refund, verify access is revoked according to the current canonical store record. For restore between two disposable accounts, verify that only the destination retains Pro and that neither account receives the other's profile/routines/backup.

No purchase, test-account creation, backend creation, manual production grant or change to deferred merchant settings is authorized by this document. Until an authorized configuration supports a complete store-to-server validation, keep that row of the release evidence open. Do not weaken production isolation to make a test pass.

## Primary references

- [RevenueCat event fields, including optional transfer environment and UUID aliases](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [RevenueCat sandbox and Test Store limitations](https://www.revenuecat.com/docs/test-and-launch/sandbox)
- [Apple sandbox and StoreKit testing limitations](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store)
- [Supabase verified JWT claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase JWT AMR and session claims](https://supabase.com/docs/guides/auth/jwt-fields)

A separate prepare-only native Test Store probe exists in `/private/tmp/syncapp-rc-probe`. It accepts only a Debug iOS build, a Test Store public key and synthetic non-UUID identities, with no Supabase/Auth imports. It has not been launched, no key has been loaded and no customer or transaction has been created. Its eight offline guard tests are preparation evidence only. Apple purchase/renewal/refund and canonical Pro behavior remain unverified.
