# iOS App Store privacy draft

Updated on 12 November 2026 with the actual signed Store IPA **1.0.0 (2)** from source `da7339f`. Its signature/profile checks passed, upload succeeded and Apple processing reports `VALID` / internally `READY_FOR_BETA_TESTING`. The owner-only internal group has this build and one tester marked **Invited**; acceptance/installation remain unobserved. **No App Store privacy questionnaire was changed or published.** This maps inspected code and shipped SDK manifest declarations to proposed answers. It is a manifest inventory, not an official Xcode aggregated privacy report, final privacy label or legal determination; runtime/provider and owner review remain required.

## Scope and interpretation

Production/preview advertising is disabled in the effective EAS configuration. Automatic placements therefore do not initialize Google Mobile Ads or request inventory. However, **Profile → Ad privacy choices remains available** and calls UMP `requestInfoUpdate()` before deciding whether a form is required; this explicit path does not initialize GMA. Spotify is hard-disabled outside owner development builds. RevenueCat configures on account identification, including Free accounts, with the Supabase UUID as its custom App User ID. No RevenueCat email/name attributes or attribution-identifier collection calls were found.

Apple's label concerns retained off-device data, including partners and optional flows. Local-only processing is different from collection; ordinary optional cloud functionality is not automatically exempt. Account-linked UUID data is not anonymous merely because no email accompanies the request. These principles follow [Apple's privacy guidance](https://developer.apple.com/app-store/app-privacy-details/). The matrices below are draft classifications, not observations of every network payload.

## App/backend and RevenueCat matrix

“Linked” below means joinable to the Sync account. “No tracking evidenced” describes inspected use, not a blanket certification of every provider or integration.

| Apple data type | Actual path / recipient | Draft purposes | Linked | Tracking / outstanding evidence |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | Email/password signup, sign-in, confirmation/recovery through Supabase Auth and the configured email-delivery provider. | App Functionality. No marketing-email path found. | **Yes** | No tracking evidenced. Confirm email-provider retention/use; do not mark Data Not Collected. |
| Contact Info → Name | Google identity metadata retained by Supabase Auth. The existing owner record has nonempty `name` and `full_name` fields in both user and Google identity metadata; actual values were not returned. | **App Functionality** for authentication/account identity. | **Yes** | **Owner classification review:** include linked Name based on the observed server record, even without a dedicated name input. This observation covers one account and does not prove every user's fields or a login from the selected Store binary. No advertising use evidenced. |
| Identifiers → User ID | Supabase UUID binds Auth, entitlement/backup rows and RevenueCat `appUserID`. | App Functionality; Analytics where RevenueCat uses it with purchase reporting. | **Yes** | No cross-app advertising use found in these paths. UUID is a User ID, not evidence of a Device ID. |
| Purchases → Purchase History | Apple transaction/subscription state is processed by RevenueCat; server entitlement stores expiry, store and environment against the UUID. | **App Functionality + Analytics**, following RevenueCat's dashboard/reporting guidance. | **Yes** | No RevenueCat tracking evidenced absent advertising/attribution integrations. Review actual enabled integrations. |
| User Content → Other User Content | Pro backup includes routine content, bio, social-link fields, user-authored saved posts and track/URL metadata; Supabase `account_backups` is keyed by UUID. | App Functionality. | **Yes** | No advertising use found. Stored metadata/URLs are not the same as uploaded audio/photo files. |
| Health & Fitness → Fitness | Pro backup includes structured exercise/session history: routine snapshot, start/completion time, duration, rounds and skips. | App Functionality. | **Yes** | **Classification recommendation:** exercise history merits Fitness even without HealthKit. Confirm handling of non-exercise/study sessions; do not infer medical/Health data from arbitrary free text. |
| Contact Info → Other User Contact Info | Dedicated social-profile links can be included in the account's Pro backup. | App Functionality. | **Yes** | **Owner classification review:** these are purpose-specific contact/profile links, rather than only an unrestricted bio field. |
| Usage Data / Diagnostics → category depends on actual retained fields | Supabase Auth/gateway/service logs can record account/request events. The app adds no standalone analytics/crash SDK; Edge handlers avoid raw tokens/webhooks. | App Functionality for security/operations; additional purpose only if actually used. | Potentially yes | Confirm retained IP, request/device metadata and identifiers, retention and access. Do not infer zero server collection from quiet application logs. [Supabase logs](https://supabase.com/docs/guides/observability/logs). |

The Purchase History row intentionally differs from the generic installed RevenueCat manifest: it declares `linked=false` and App Functionality only, while **this app supplies an account UUID joinable to email**. RevenueCat's [Apple disclosure guide](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy) calls for Purchase History, includes Analytics and explains linked custom identifiers. Optional attribution integrations can change the answer. No billing-card/bank data is collected by Sync's inspected code; Apple handles payment entry, while purchase history remains a separate category.

No dedicated real-name or telephone input was found. However, the Google Auth observation below confirms retained name fields independently of a UI input; the reserved `profiles.display_name` field is not the basis for the Name classification. Imported profile photos and audio/video remain local; no media bytes are included in the current backup allowlist. Retained Google `avatar_url` and `picture` metadata does not establish that photo binaries were downloaded or uploaded. Do not select Photos/Videos or Audio Data solely from those URL fields or a local permission request. Generic bio/post text is covered as user content; specific requested fields/history require their own classification. Recheck if avatar upload or media backup is added.

## Music and social sign-in — source and observed Auth metadata

The music/auth source observations concern features **not present in Store build 2**. Archive contents, provider setup and runtime behavior must be assessed for the selected binary. The existing Google Auth record observed below is server-side evidence for one account; it is not a successful login or playback test of that binary.

- Native Apple Music requests Music access when the person explicitly connects, checks catalog-subscription access, and uses MusicKit for catalog search, library playlists and playback. The current bridge returns song/playlist metadata, not MusicKit credentials. JavaScript keeps a device-local connection marker in ordinary account metadata storage; MusicKit credentials are not returned to JavaScript or stored in SecureStore. Selected routine track IDs/metadata can enter the existing Pro backup allowlist. Inspect final framework/Apple service behavior and retained data before choosing listening/search-history categories; absence of an app-side history table does not establish all partner behavior.
- Other music-service entries currently open approved external HTTPS destinations. They do not import an account/library or control its interval playback. Those pages/apps have their own network/data flows; do not describe the links as connected accounts or assume no destination receives a request.
- New social sign-in exchanges identity credentials through Supabase Auth. The native Apple path requests **email only** and sends its identity token plus nonce for verification; it does not request a real name or persist a separate Apple credential in music storage. Google uses the configured OAuth provider. Retained Google name and profile-image URL metadata is verified for the existing owner account below. Final scopes, fields for other accounts and selected-binary login behavior remain separate verification items; absence of a name input does not establish absence of provider-supplied names.
- The actual Store build 4 archive was inspected separately: 15 bundled manifests, three collection vendors, 11 declarations and eight categories. Paths and parsed content match build 3; these are fresh archive observations, not copied build 2 counts. This is not an official Xcode aggregate or a final questionnaire classification.

On **12 November 2026**, a read-only connected Supabase query restricted to the existing owner Auth account returned only metadata key names, provider labels and presence booleans. Both `auth.users.raw_user_meta_data` and that account's Google `auth.identities.identity_data` had nonempty `name`, `full_name`, `avatar_url`, `picture` and `email` fields. The account's provider array contained `email` and `google`. No actual names, email addresses, image URLs, tokens, password hashes or user/identity IDs were returned, and no records were changed. Supabase describes OAuth `identity_data` as provider-supplied user metadata in its [identity documentation](https://supabase.com/docs/guides/auth/identities).

This observation supports the draft **linked Name / App Functionality** classification above. Google profile-image URL fields are retained metadata; the query did not fetch image URLs or establish storage/upload of photo binaries, so it adds no verified Photos/Videos collection claim. The email/User ID/User Content rows remain relevant. This remains a draft classification, not a published questionnaire answer, a claim about all users or selected-binary login evidence. Native permission setup is separate from service/content authorization and paid-release readiness.

## Exact installed Google manifest matrix

Installed versions: RN Google Mobile Ads **17.0.0**, Google Mobile Ads **13.6.0**, UMP **3.1.0**. These rows describe their manifests, **not a claim that dormant GMA collected every listed type in this release**.

Purpose abbreviations: **AF** App Functionality; **AN** Analytics; **TA** Third-Party Advertising; **DM** Developer Advertising/Marketing. DM is a vendor declaration, not evidence that Sync sends marketing campaigns.

| SDK / Apple data type | Manifest purposes | Manifest linked | Manifest tracking | Release relevance |
| --- | --- | --- | --- | --- |
| GMA: Coarse Location | TA, AN, DM | Yes | No | Automatic GMA path disabled; require runtime evidence before attributing actual collection. |
| GMA: Device ID | TA, AN, DM | Yes | **Yes** | Cannot convert this to “no tracking” solely from non-personalized requests or absent ATT prompt. |
| GMA: Advertising Data; Product Interaction | TA, AN, DM | Yes | No | Conditional GMA inventory/SDK activity; currently no automatic ad requests. |
| GMA: Performance Data; Other Diagnostic Data | TA, AN, DM | No | No | Declaration verified in the Store IPA; actual runtime/provider behavior remains open. |
| GMA: Crash Data | AN | No | No | Declaration verified in the Store IPA; actual runtime behavior remains to be verified. |
| UMP: Coarse Location; Performance Data; Product Interaction | **AF** | No | No | **Explicit privacy-options path is reachable even with ads disabled.** Treat these as potential collected categories until that path/provider behavior is resolved. |

The installed device-slice manifests were compared with the actual IPA's `GoogleMobileAdsResources.bundle/PrivacyInfo.xcprivacy`, `UserMessagingPlatformResources.bundle/PrivacyInfo.xcprivacy` and `RevenueCat.bundle/PrivacyInfo.xcprivacy`. Their category/purpose/linked/tracking declarations match this matrix and the generic RevenueCat declaration above. The app's own empty collected-data array does not replace those declarations or the app/backend matrix.

## Shipped IPA manifest inventory

The actual **1.0.0 (2)** IPA contains **15 `PrivacyInfo.xcprivacy` files**. Three declare collected data: Google Mobile Ads, UMP and RevenueCat, totaling **11 declarations across 8 distinct categories**. GMA's Device ID declaration is both linked and tracking; a missing top-level tracking flag in a vendor manifest is not a blanket no-tracking result. UMP declares Coarse Location, Performance Data and Product Interaction for App Functionality, unlinked and non-tracking. RevenueCat's generic Purchase History declaration is App Functionality, unlinked and non-tracking; the app-specific account UUID/Analytics distinction above still applies.

Required-reason declarations across the shipped manifests are:

| API category | Declared reason codes |
| --- | --- |
| File Timestamp | `0A2A.1`, `3B52.1`, `C617.1` |
| User Defaults | `CA92.1` |
| Disk Space | `85F4.1`, `E174.1` |
| System Boot Time | `35F9.1` |

The sanitized artifact record is `/private/tmp/syncapp-cloud-release2/inspection.json`. This inventory records bundled declarations and the checked IPA settings; **it is not an official Xcode aggregated report or final App Store questionnaire**. Neither a successful upload nor Apple's valid-build status resolves the runtime/partner behavior and disclosure questions below. The official aggregated report and final questionnaire review remain open.

Google's current [data-disclosure guide](https://developers.google.com/admob/ios/privacy/data-disclosure) describes a newer SDK than installed 13.6; use exact installed manifests and runtime evidence instead of importing new-version optional behavior. If advertising is enabled later, reassess every GMA row before serving. Requests currently ask for non-personalized ads, but [Google explains](https://support.google.com/admob/answer/7676680?hl=en) that this still permits identifier use for functions such as frequency capping/reporting. Publisher first-party ID retains its default; the RNAds 17 setter is a no-op compatibility stub. [Google strategies](https://developers.google.com/admob/ios/privacy/strategies).

## Linking and tracking decision

Account email, UUID, cloud content/history and associated purchases are linked in this implementation. No Sync account/routine/music data is passed into the ads integration. GMA's manifest flags and provider defaults still need assessment if that SDK executes; UMP's reachable consent request must be considered independently. An ATT prompt is absent. **Do not finalize either a blanket “tracking: yes” or “tracking: no” from manifests alone.** Validate the submitted configuration and partner behavior against [Apple's tracking rules](https://developer.apple.com/app-store/user-privacy-and-data-use/).

The Browser audio feature lets users navigate arbitrary HTTP/HTTPS sites. It does not persist a separate browsing/search-history log in the inspected app code; user-selected media URLs can enter cloud metadata. Review third-party web traffic and Apple's open-web exception before deciding Browsing History/Search History answers. Do not treat embedded legal pages and arbitrary browsing as identical data flows.

## Owner review draft before entering answers

1. Confirm the submitted production configuration keeps advertising off, and decide whether the reachable UMP privacy-options network path remains. If retained, resolve its actual categories using the final Release runtime/provider evidence rather than assuming Google has no collection.
2. Include **Contact Info → Name, linked, App Functionality** in owner review based on the observed Google Auth metadata. Keep profile-image URL metadata distinct from photo binaries; the one-account query does not establish Photos/Videos collection or every user's provider fields.
3. Confirm **linked User ID + linked Purchase History**, and RevenueCat **App Functionality + Analytics** purposes; review enabled RevenueCat integrations for any additional attribution/advertising behavior.
4. Confirm the cloud-content classifications, particularly **Fitness** for exercise history and **Other User Contact Info** for dedicated social links, with App Functionality and linked identity. Optional Pro backup is part of the data inventory even if guests stay local.
5. Confirm Supabase/email-provider log fields, IP use and retention, then reconcile these categories with the final aggregated archive report and public Privacy Policy. Record any unresolved field instead of selecting “Data Not Collected.”

The artifact inspection retained only sanitized technical signature/profile checks and manifest summaries; no live account emails, backup payloads or credentials were collected for this draft. No privacy questionnaire answers were changed or submitted. The owner should enter final answers after resolving the marked unknowns.
