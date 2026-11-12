# Review billing security-record retention — publication draft

Prepared 12 November 2026. **Not published and not a statement of deployed behavior.** The isolated review-billing migration is offline source preparation; delivered Store **1.0.0 (4)** does not contain the new review path. The root owner will review this wording and coordinate publication with the backend rollout. No Site, access setting, privacy questionnaire or production data was changed by this preparation.

## Policy source inspected

Native Sites metadata identifies the existing project `appgprj_6af4df4ae95481919139accea2d7d270` as active/public, with latest saved version **6**. Both the saved version and the available local checkout identify source commit `1d41c6a2953d13c0be65f72c1663b64507a9cd4f`. The inspected file is `sites/sync-legal/dist/privacy.html`, SHA256 `47f0a46a74d81005f4796e59ce1ee450c3853770e8f19a4ac67e15935dd0680f`; the policy destination is [the existing Privacy Policy](https://sync-app-support.feridun.chatgpt.site/privacy).

The existing checkout supplied the complete source, so no repository credential, checkout, source commit/push, version save or deployment was needed. Native metadata/source inspection is not a new independent HTTP-availability test; the earlier web-tool InternalError is not evidence that the public Site is down.

## What the current text covers

The retention section says cloud backups and billing support records have no automatic time-based deletion schedule, then says successful account deletion removes the account and related application records, including private subscription-notification records. Its explicit exceptions concern RevenueCat/store records, device-local media/markers and provider-managed infrastructure backups.

Those statements do **not clearly disclose a permanent Sync-held UUID/billing-classification exception after account deletion**. The broad application-record deletion sentence needs qualification; the generic provider-retention paragraph does not explain this separate application security record. The existing RevenueCat/store paragraph should remain separate and unchanged.

## Minimal English amendment for the next policy version

These paragraphs are intended for publication only when the described retention is deployed and reviewed. Replace the current account-deletion paragraph in `section#retention` with:

> Use **Profile → Your account → Delete account** to request deletion in the app. You must have signed in recently and type the requested confirmation. Successful deletion removes the sign-in account, its related profile, cloud-backup, subscription-access and private subscription-notification records, and any owned avatar objects. The limited security record described below remains. The app also attempts to clear this device’s account-scoped cache and stored connection credentials, and reports if that cleanup cannot be completed.

Immediately after it, insert:

> For each account, we retain a limited security record after deletion containing only its system-generated account identifier (UUID) and whether it was classified for normal production billing or restricted review/test billing. We retain this record indefinitely to prevent the same identifier from being reassigned between test and real billing environments. This record contains no email address, name, profile content, routines, activity, cloud-backup content, connection credentials or payment details. It does not keep the deleted sign-in account active, restore its data or preserve subscription access.

Keep the following existing paragraph about account deletion not cancelling subscriptions or automatically erasing RevenueCat/store records, including its already-approved privacy contact link. Keep the subsequent device-copy, infrastructure-backup and support-correspondence boundaries. Do not present the retained classification as a purchase history, receipt or active entitlement.

## Exact implementation boundary behind the draft

The inspected offline migration is [20261112152101_isolated_review_billing.sql](../supabase/migrations/20261112152101_isolated_review_billing.sql), SHA256 `51678bc4f48d87eaa81268be0aec51388edc4efdabbfe164dbc312fa6d27c299`.

- `account_billing_scope_registry` contains exactly `user_id` (Auth UUID) and `lane` (`production` or `review`). It deliberately has no Auth-user foreign key and rejects row updates/deletes, so the classification survives Auth deletion. This applies to production accounts too, not only reviewers.
- The live scope/window, profile, production/review backup, entitlement, synchronization state and processed-notification records remain separate. Their Auth foreign keys cascade on deletion; the registry does not retain their payloads, expiry, event identifiers or history.
- The UUID is **pseudonymous account data, not anonymous or nonpersonal information**. Its lack of an email column does not establish that it cannot be linked to records held elsewhere, including RevenueCat.
- RevenueCat and Apple purchase history and store-subscription cancellation remain governed by the already-disclosed separate boundaries. This amendment promises no automatic provider deletion or billing cancellation.
- Device cleanup remains a separate operation after confirmed remote deletion; source tests cover incomplete-cleanup reporting. No promise of instantaneous physical erasure from every device or infrastructure backup is added.

The existing [App Privacy draft](app-store-privacy.md) already includes linked **Identifiers → User ID**. For owner review, this registry adds an explicit post-deletion retention purpose under **App Functionality/security**; it does not make that identifier anonymous or add an analytics purpose for this registry. Keep RevenueCat Purchase History and its existing purpose/linking assessment separate. No App Store questionnaire answer was entered by this draft.

Before publication, confirm the final deployed schema still matches this two-field permanent-record boundary and update the policy’s effective date/version as appropriate. Do not describe the review lane, a sandbox purchase or a successful Pro unlock as live merely because this wording has been prepared.
