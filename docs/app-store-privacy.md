# iOS App Store privacy draft

Technical review dated 12 November 2026 for the intended iOS release. **No App Store questionnaire was changed or published.** This maps inspected code and exact installed SDK manifests to proposed answers; owner review and the final Release archive/runtime evidence are still required. It is not a legal determination.

## Scope and interpretation

Production/preview advertising is disabled in the effective EAS configuration. Automatic placements therefore do not initialize Google Mobile Ads or request inventory. However, **Profile → Ad privacy choices remains available** and calls UMP `requestInfoUpdate()` before deciding whether a form is required; this explicit path does not initialize GMA. Spotify is hard-disabled outside owner development builds. RevenueCat configures on account identification, including Free accounts, with the Supabase UUID as its custom App User ID. No RevenueCat email/name attributes or attribution-identifier collection calls were found.

Apple's label concerns retained off-device data, including partners and optional flows. Local-only processing is different from collection; ordinary optional cloud functionality is not automatically exempt. Account-linked UUID data is not anonymous merely because no email accompanies the request. These principles follow [Apple's privacy guidance](https://developer.apple.com/app-store/app-privacy-details/). The matrices below are draft classifications, not observations of every network payload.

## App/backend and RevenueCat matrix

“Linked” below means joinable to the Sync account. “No tracking evidenced” describes inspected use, not a blanket certification of every provider or integration.

| Apple data type | Actual path / recipient | Draft purposes | Linked | Tracking / outstanding evidence |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | Email/password signup, sign-in, confirmation/recovery through Supabase Auth and the configured email-delivery provider. | App Functionality. No marketing-email path found. | **Yes** | No tracking evidenced. Confirm email-provider retention/use; do not mark Data Not Collected. |
| Identifiers → User ID | Supabase UUID binds Auth, entitlement/backup rows and RevenueCat `appUserID`. | App Functionality; Analytics where RevenueCat uses it with purchase reporting. | **Yes** | No cross-app advertising use found in these paths. UUID is a User ID, not evidence of a Device ID. |
| Purchases → Purchase History | Apple transaction/subscription state is processed by RevenueCat; server entitlement stores expiry, store and environment against the UUID. | **App Functionality + Analytics**, following RevenueCat's dashboard/reporting guidance. | **Yes** | No RevenueCat tracking evidenced absent advertising/attribution integrations. Review actual enabled integrations. |
| User Content → Other User Content | Pro backup includes routine content, bio, social-link fields, user-authored saved posts and track/URL metadata; Supabase `account_backups` is keyed by UUID. | App Functionality. | **Yes** | No advertising use found. Stored metadata/URLs are not the same as uploaded audio/photo files. |
| Health & Fitness → Fitness | Pro backup includes structured exercise/session history: routine snapshot, start/completion time, duration, rounds and skips. | App Functionality. | **Yes** | **Classification recommendation:** exercise history merits Fitness even without HealthKit. Confirm handling of non-exercise/study sessions; do not infer medical/Health data from arbitrary free text. |
| Contact Info → Other User Contact Info | Dedicated social-profile links can be included in the account's Pro backup. | App Functionality. | **Yes** | **Owner classification review:** these are purpose-specific contact/profile links, rather than only an unrestricted bio field. |
| Usage Data / Diagnostics → category depends on actual retained fields | Supabase Auth/gateway/service logs can record account/request events. The app adds no standalone analytics/crash SDK; Edge handlers avoid raw tokens/webhooks. | App Functionality for security/operations; additional purpose only if actually used. | Potentially yes | Confirm retained IP, request/device metadata and identifiers, retention and access. Do not infer zero server collection from quiet application logs. [Supabase logs](https://supabase.com/docs/guides/observability/logs). |

The Purchase History row intentionally differs from the generic installed RevenueCat manifest: it declares `linked=false` and App Functionality only, while **this app supplies an account UUID joinable to email**. RevenueCat's [Apple disclosure guide](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy) calls for Purchase History, includes Analytics and explains linked custom identifiers. Optional attribution integrations can change the answer. No billing-card/bank data is collected by Sync's inspected code; Apple handles payment entry, while purchase history remains a separate category.

No dedicated real-name or telephone input was found. A reserved `profiles.display_name` schema field is not evidence that the current UI uploads real names. Profile photos and imported audio/video remain local; no media bytes are included in the current backup allowlist. Do not select Photos/Videos or Audio Data solely because local permission is requested. Generic bio/post text is covered as user content; specific requested fields/history require their own classification. Recheck if avatar upload or media backup is added.

## Exact installed Google manifest matrix

Installed versions: RN Google Mobile Ads **17.0.0**, Google Mobile Ads **13.6.0**, UMP **3.1.0**. These rows describe their manifests, **not a claim that dormant GMA collected every listed type in this release**.

Purpose abbreviations: **AF** App Functionality; **AN** Analytics; **TA** Third-Party Advertising; **DM** Developer Advertising/Marketing. DM is a vendor declaration, not evidence that Sync sends marketing campaigns.

| SDK / Apple data type | Manifest purposes | Manifest linked | Manifest tracking | Release relevance |
| --- | --- | --- | --- | --- |
| GMA: Coarse Location | TA, AN, DM | Yes | No | Automatic GMA path disabled; require runtime evidence before attributing actual collection. |
| GMA: Device ID | TA, AN, DM | Yes | **Yes** | Cannot convert this to “no tracking” solely from non-personalized requests or absent ATT prompt. |
| GMA: Advertising Data; Product Interaction | TA, AN, DM | Yes | No | Conditional GMA inventory/SDK activity; currently no automatic ad requests. |
| GMA: Performance Data; Other Diagnostic Data | TA, AN, DM | No | No | Conditional SDK behavior, pending final archive/runtime assessment. |
| GMA: Crash Data | AN | No | No | Included SDK declaration; actual runtime behavior remains to be verified. |
| UMP: Coarse Location; Performance Data; Product Interaction | **AF** | No | No | **Explicit privacy-options path is reachable even with ads disabled.** Treat these as potential collected categories until that path/provider behavior is resolved. |

Evidence files are the device-slice `PrivacyInfo.xcprivacy` files under installed `GoogleMobileAds.xcframework`, `UserMessagingPlatform.xcframework` and `ios/Pods/RevenueCat/Sources/`. The app's own empty collected-data array does not replace these SDK declarations or the backend matrix. The final Release archive's aggregated report is pending.

Google's current [data-disclosure guide](https://developers.google.com/admob/ios/privacy/data-disclosure) describes a newer SDK than installed 13.6; use exact installed manifests and runtime evidence instead of importing new-version optional behavior. If advertising is enabled later, reassess every GMA row before serving. Requests currently ask for non-personalized ads, but [Google explains](https://support.google.com/admob/answer/7676680?hl=en) that this still permits identifier use for functions such as frequency capping/reporting. Publisher first-party ID retains its default; the RNAds 17 setter is a no-op compatibility stub. [Google strategies](https://developers.google.com/admob/ios/privacy/strategies).

## Linking and tracking decision

Account email, UUID, cloud content/history and associated purchases are linked in this implementation. No Sync account/routine/music data is passed into the ads integration. GMA's manifest flags and provider defaults still need assessment if that SDK executes; UMP's reachable consent request must be considered independently. An ATT prompt is absent. **Do not finalize either a blanket “tracking: yes” or “tracking: no” from manifests alone.** Validate the submitted configuration and partner behavior against [Apple's tracking rules](https://developer.apple.com/app-store/user-privacy-and-data-use/).

The Browser audio feature lets users navigate arbitrary HTTP/HTTPS sites. It does not persist a separate browsing/search-history log in the inspected app code; user-selected media URLs can enter cloud metadata. Review third-party web traffic and Apple's open-web exception before deciding Browsing History/Search History answers. Do not treat embedded legal pages and arbitrary browsing as identical data flows.

## Owner review draft before entering answers

1. Confirm the submitted production configuration keeps advertising off, and decide whether the reachable UMP privacy-options network path remains. If retained, resolve its actual categories using the final Release runtime/provider evidence rather than assuming Google has no collection.
2. Confirm **linked User ID + linked Purchase History**, and RevenueCat **App Functionality + Analytics** purposes; review enabled RevenueCat integrations for any additional attribution/advertising behavior.
3. Confirm the cloud-content classifications, particularly **Fitness** for exercise history and **Other User Contact Info** for dedicated social links, with App Functionality and linked identity. Optional Pro backup is part of the data inventory even if guests stay local.
4. Confirm Supabase/email-provider log fields, IP use and retention, then reconcile these categories with the final aggregated archive report and public Privacy Policy. Record any unresolved field instead of selecting “Data Not Collected.”

No live identifiers, emails, backup payloads, credentials or questionnaire settings were accessed or changed for this draft. The owner should enter answers only after resolving the marked unknowns; no additional user-input request was sent by this task.
