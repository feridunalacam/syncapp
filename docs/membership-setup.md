# Accounts and Sync Pro

## Architecture and plan

The hosted backend is the `syncapp` Supabase project (`iyipvwlhiwfaeyfoyakr`) in Frankfurt (`eu-central-1`), in the selected `Project 1` organization. This is not a local database. Migration SQL and function sources are versioned in this repository.

Free includes all existing local routines, timer, music controls, activity and guest mode. Accounts use email/password with confirmation, recovery, signout and deletion. Optional Apple/Google sign-in is behind explicit configuration flags. Spotify sign-in remains separate from the Sync account.

Sync Pro adds private cloud backup and cross-device synchronization of routines, up to the existing last 100 activity records, bio, social links and locally saved posts. Imported audio and profile photos remain device-local; routines retain their track metadata so files can be reselected on other devices. Pulling metadata back onto the original device preserves its matching local audio references. No public social network, advertising delivery or server-side music streaming is introduced.

Monthly and annual products map to a single RevenueCat entitlement named `sync_pro` (the internal database access key remains `pro`). A reasonable initial catalog proposal is US$4.99/month and US$39.99/year, with no trial in the first release. These are setup proposals, not published prices. The existing RevenueCat Test Store onboarding catalog is not a live App Store/Google Play product catalog. Store regional prices must be configured and approved in the merchant's console; the paywall always uses actual localized prices from the store, never these draft amounts.

## Hosted work completed

- `membership_subscriptions` and `bind_backup_account` migrations applied.
- Owner RLS on profiles, service-written entitlements and Pro-only cloud backup; client backup RPC binds the snapshot owner to the JWT user and uses revision compare-and-swap.
- Private avatar bucket reserved for future upload UI; current photo UI remains device-local.
- `delete-account`, `sync-subscription` and `revenuecat-webhook` deployed. Their handlers authenticate requests themselves. Calls without account credentials return 401; the webhook returns 503 until its secret is configured.
- Auth site URL `syncapp://auth/callback`; exact callback and recovery redirects added in the hosted dashboard.
- The device's `.env.local` uses the project's publishable key, never its secret/service key. It is ignored by Git. Each development/build environment needs its own environment values.
- Live SQL validation uses random fixtures inside a rolled-back transaction, so it grants no lasting test subscription. The two private billing tables deliberately have RLS with no client policies; the advisor's informational default-deny notice for those tables is expected.

## Remaining external release configuration

1. **Transactional email:** configure custom SMTP in Supabase Auth > Emails > SMTP Settings. The built-in sender is for limited development use and is not a production email service. Keep email confirmation enabled, set minimum password length to at least 8, and verify signup/recovery on a real test address after SMTP is ready. Configure sender domain DNS and sender identity with the chosen email provider.
2. **Store accounts:** use the owner's Apple Developer/App Store Connect and Google Play Console accounts; complete their merchant, tax and banking setup personally. iOS bundle ID is `com.feridun.syncapp`; Android package is `com.syncapp.app`.
3. **RevenueCat:** the existing project `sync` (`109558cb`) currently has a Test Store and `sync_pro` entitlement. Connect the two real store apps, add monthly/annual auto-renewable products, attach them to `sync_pro`, and expose them as `$rc_monthly`/`$rc_annual` in the current offering. Keep RevenueCat's restore/transfer policy on the original App User ID so a different Sync account cannot claim another account's purchase. The SDK uses the Supabase UUID; do not add unnecessary name/email attributes.
4. **Keys and webhook:** put the public iOS/Android SDK keys in the client build environment. Put `REVENUECAT_SECRET_API_KEY` and a random `REVENUECAT_WEBHOOK_SECRET` only in Supabase Edge Function secrets. In RevenueCat configure the webhook endpoint `https://iyipvwlhiwfaeyfoyakr.supabase.co/functions/v1/revenuecat-webhook` and Authorization `Bearer <secret>`. Production is the default. Never enable sandbox grants in this production project; create a separate test project for sandbox billing.
5. **Legal pages:** publish accurate Terms of Use and Privacy Policy under an owned HTTPS domain, then set `EXPO_PUBLIC_TERMS_URL`/`EXPO_PUBLIC_PRIVACY_URL`. Checkout stays disabled without both pages. Policy text must reflect the actual operator, subprocessors and retention/support practices; no placeholder legal URL is shipped as live.
6. **Native build:** rebuild the development/distribution binary with `react-native-purchases` before enabling real checkout. The older installed simulator binary can preview accounts/Free UI and intentionally reports that purchases require an updated build. A native RevenueCat binary has not been built or validated yet. `eas.json` also prepares a cloud-build alternative: initialize/link the owner’s Expo project, set public build environment values, then use the development profile for a simulator binary or production for distribution. No EAS build was submitted in this run.
7. **Optional identity providers:** configure Apple/Google credentials and allowed redirects in Supabase, then enable the client flags. Keep them false until configured. Email/password remains the first supported path.

## Data behavior

All personal device keys and music credentials are scoped to an immutable account ID. Signing out returns to a separate guest space. Account switches remount data/workout providers so the old state is not shown to the next user. Deleting an account requires a sign-in in the last 15 minutes, confirmation, server deletion, then a closed/drained local scope. Account deletion does not cancel an Apple/Google subscription; the UI offers its store management link before deletion.

Existing guest records are imported explicitly from Profile once per device installation. Existing account records win on ID collisions, and source guest records are removed only after a durable account copy and ownership marker exist. Music credentials are never imported or backed up; reconnect Spotify in the signed-in account.

Offline writes remain in account-scoped storage. Sync uploads use a persisted dirty counter and server revision. If another device changed the cloud backup while this device has edits, the UI asks which version to keep. A recovery snapshot is kept before cloud replacement. Synchronization pauses during an active workout. Media files, credentials, tokens and passwords are excluded from backups. Background sync retries on foreground and at one-minute intervals while Pro is active.

## Validation

Run `npm test`; generate iOS/Android JavaScript bundles with `npx expo export --platform ios --platform android --output-dir dist`. Run `supabase/verify-membership.sql` against the intended project to validate access isolation and revision behavior. These checks do not prove live email delivery, OAuth provider setup or store purchase behavior.

Before release, verify two real test accounts cannot see each other's profiles/backups, first signup and confirmation, recovery from a cold launch, switching accounts during queued writes, restoring a new device, choosing a conflicting copy, account deletion, real sandbox purchase/renewal/cancellation/refund and restore using the owner's store test setup. Re-check production webhook secrets/environment and legal links before distributing.

References: [Supabase Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [native callbacks](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [RevenueCat Expo](https://www.revenuecat.com/docs/getting-started/installation/expo), [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks).
