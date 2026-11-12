# AdMob setup

## Current state

The app integrates `react-native-google-mobile-ads` **17.0.0**, pinned for React Native **0.81.5** and Expo **54**. Historical signed Debug simulator QA covered demo banners and later guest Close→Start / Finish→Close boundaries, recorded below. Those are separate from current Store5 and the new source-only privacy guard. Expo Go cannot validate this integration; final distribution, regional and verified-Pro behavior still need their own validation.

The latest **12 November read-only account check** shows **APPROVED** and ad serving enabled at the **account level**, superseding the earlier reactivation-review status. Root also checked the iOS app read-only: **two active ad units**, **review required / limited serving**. Exact search for Apple app ID **6833659501** returned no result because the App Store listing is unpublished; no store-link write was possible or made. App-level approval and public readiness remain incomplete. European and US UMP messages are published for both apps. This does not establish public serving or regional consent-form presentation.

The owner explicitly intends **AdMob ON for public release**. Current Store5 still has ads **OFF**, and the future candidate's flag has **not yet been enabled**. A new source guard returns from explicit privacy requests before any SDK/cache/state work when disabled, hides Profile's Ad privacy choices row and blocks captured stale callbacks. This is an app-initiated-path guarantee, not packet-capture evidence or a blanket no-collection claim. Enabled-mode privacy management, including explicit Pro choices, is preserved.

## Placement and access

There is one banner placement: Discover's fixed header below the categories, outside the feed scroll and navigation dock. The creative uses an anchored-adaptive banner sized to the available width and is labelled **Advertisement**. Full-screen session-boundary placements are described below; there are no rewarded, app-open or arbitrary tab-change placements. One placement does not mean one lifetime network request; a native banner can refresh according to AdMob settings or be recreated after its identity/size changes.

The app prepares the placement only while foregrounded, Discover is focused and visible, no search/detail or blocking overlay is open, the feed is not empty, and no active or paused workout, music playback or audio synchronization is occurring. Stale native callbacks cannot revive a retired placement. Failed/no-fill loads do not block the timer, routines or music.

### Session boundaries

The user confirmed no advertising while a session is active, including work, rest and pause. Eligible Free users can receive an already-loaded interstitial before a NEW Start or when they explicitly press **Continue** on the ended-session summary. Resume and phase skips never create an opportunity. Timer copy explains these boundaries and that Sync Pro removes all ads.

The first and each subsequent full-screen presentation require two distinct real app actions. Accepted routine choices and Start/Continue actions count; duplicate taps and old opportunity IDs do not. A separate 120-second cooldown applies from native OPENED, with no immediate automatic presentation after close. This implements Google's action-spacing rule with an additional product limit; 120 seconds is not a Google-mandated threshold. [Google's disallowed implementations](https://support.google.com/admob/answer/6201362?hl=en-GB) require natural content breaks and prohibit repeated or unexpected interstitials.

Preloading never presents. Start/Continue consumes only ready inventory and never waits for an ad to load; no-fill, expiry and unavailable inventory are skipped. Cache age is capped at 55 minutes, in-flight loads at 15 seconds and load-error retries delayed 30 seconds. These are product limits; Google documents an approximately one-hour interstitial cache window and recommends advance loading. [iOS guidance](https://developers.google.com/admob/ios/interstitial), [Android guidance](https://developers.google.com/admob/android/interstitial).

Audio previews/cues stop first. Shared UMP/native-presentation barriers drain before Start, and a displayed creative holds the action until native CLOSED or presentation ERROR. The `show()` promise is not a dismissal event. Actual foreground, focus, identity, selected routine reference and session are checked before synchronous timer/audio start. Duplicate taps coalesce; blur, routine/account changes and unmount retire old continuations. SDK audio stays muted; there is no independent audio-ad playback. Muting alone is not a promise that an SDK cannot affect the audio session, so active-session placements remain prohibited.

Stable guests are eligible. Signed-in users require matching auth/subscription identities, a ready subscription state and successful backend access verification. Pro, unknown/failed verification, an SDK purchase awaiting backend confirmation, and purchase/restore loading suppress ads. A pending purchase remains pending when server verification fails, without granting Pro or permitting repeated checkout. Verification clears immediately during identity changes or queued refreshes; an offerings-only SDK error does not turn a successfully checked backend result into unknown access.

Pro is ad-free: the automatic placement path does not load consent/native ads or initialize Google Mobile Ads for a verified Pro account. If the SDK was already initialized earlier in the process, becoming Pro removes the banner, retires prepared interstitials and prevents further placement requests; process-wide initialization cannot be undone. An already-presented native creative cannot be programmatically dismissed by `destroy()`, so terminal listeners remain until it closes and no new ad is started. With effective ads configuration enabled, users can explicitly manage required privacy choices from Profile without that action initializing Google Mobile Ads. The future candidate hides and blocks this path when ads are disabled; Store5 predates that guard.

## Consent and data

The native module is loaded lazily after account and placement guards pass. The controller requests updated UMP consent information, presents a required form, and checks `canRequestAds` before configuring and initializing Google Mobile Ads. It re-checks identity/foreground/placement after asynchronous steps. Google initialization is shared across the process rather than repeated for each account or screen.

When effective ads configuration is enabled, **Profile → Preferences → Ad privacy choices** checks UMP status and opens its privacy-options form when required; otherwise it reports that no additional choices are required. This explicit action includes guests/Pro and is blocked during workouts, music playback or audio synchronization. In the future candidate, disabled configuration hides the row and rejects direct/stale entry before SDK/cache/state work. Store5's earlier manual path remains historical behavior. The Privacy policy link stays available independently. Published messages do not prove regional presentation or comprehensive compliance.

AdMob dashboard configuration now includes:

- **Sync - European privacy choices:** published for both apps, English plus 31 additional languages (32 total), Reject enabled for all regions, a custom partner list containing only Google (vendor 755), and automatic partner additions disabled. Other European-message defaults remain unchanged.
- **Sync - US privacy choices:** published for both apps, the default set of all current and future supported US states, English (`en-US`), Spanish (`es`) and Latin American Spanish (`es-419`), with the standard opt-out configuration.
- No IDFA/ATT message was created.

These are saved message settings, not a claim of comprehensive legal compliance or successful EEA/US device-form testing.

Banner and interstitial requests set `requestNonPersonalizedAdsOnly: true`, and request configuration uses `maxAdContentRating: G`. The content filter does not assert the user's age or establish child-directed compliance. The app does not request ATT permission and supplies no ATT usage prompt. Non-personalized requests do not mean zero data collection or eliminate the need for appropriate UMP choices/disclosures.

The SDK's publisher first-party ID default is **retained**. Version 17's exposed compatibility stub is not a working native opt-out, so this integration does not claim to disable that identifier. Sync passes no account/email identifier, routines, activity, cloud-backup payload, music metadata or connection credentials into ads. Google can still process SDK/device, approximate-location, advertising-interaction and diagnostic data according to the installed SDK and request configuration.

The public Privacy/Terms/support pages now include both banner and session-boundary advertising. Source checks passed for four HTML pages and 64 internal links. Sites version 4 deployed successfully, and the new `privacy#ads` text was verified publicly in a browser. Before production enablement, complete accurate App Store privacy/Google Play Data safety answers for the actual SDK, purposes, consent choices and identifiers. Review the Xcode aggregated privacy report from the final native build. Existing static-site statements about having no website analytics remain separate from in-app advertising. No definitive legal declaration or privacy-form submission is established by this document.

## Public configuration

Application IDs use the AdMob `~` form and belong in native build/plugin configuration. Banner and interstitial ad-unit IDs use the `/` form and belong in the public runtime variables below. They are public identifiers, not backend secrets. A native application-ID change requires rebuilding the binary.

| Setting                                     | Behavior                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_ADS_ENABLED`                   | Development is enabled unless exactly `false`; release requires exactly `true`.                                                                  |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID`           | Release iOS banner-unit ID; required for iOS serving.                                                                                            |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID`       | Release Android banner-unit ID; required for Android serving.                                                                                    |
| `EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID`     | Release iOS full-screen session unit.                                                                                                            |
| `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID` | Release Android full-screen session unit.                                                                                                        |
| Development unit                            | Always Google's `TestIds.ADAPTIVE_BANNER` / `TestIds.INTERSTITIAL`, even if real unit variables exist. Emulator requests are marked for testing. |
| Release unit                                | Must match the platform's valid real unit format; Google's demo publisher and malformed IDs are rejected. No demo fallback.                      |

The shared EAS base profile explicitly sets ads to `false`, inherited by preview and production. Development overrides this to `true` and still uses Google test inventory. The real public IDs are configured in the EAS base, `.env.example` and ignored local `.env.local`. `app.config.js` and `config/admob.cjs` wire the native plugin with delayed app measurement, 50 SKAdNetwork entries and no ATT prompt. Keep production disabled while release steps remain pending.

EAS profiles now explicitly select their environment and `EXPO_PUBLIC_BUILD_PROFILE`. `npm run check:release -- --platform ios --profile production` checks supplied local/profile configuration without printing values; the current iOS format check passed after saving the interstitial IDs, and Android still lacks its public RevenueCat key. Repeat the check after future configuration changes. Enabled release ads additionally require matching real app/banner/interstitial IDs. This preflight does not fetch remote EAS values, initialize the Expo cloud project or verify signing/store readiness. [Expo documents why ignored local env files do not configure remote jobs](https://docs.expo.dev/eas/environment-variables/).

| Platform | Application ID                           | Banner unit ID                           | Session interstitial unit ID             |
| -------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| iOS      | `ca-app-pub-6450876479080332~3587231996` | `ca-app-pub-6450876479080332/9078718471` | `ca-app-pub-6450876479080332/7535195808` |
| Android  | `ca-app-pub-6450876479080332~6260983443` | `ca-app-pub-6450876479080332/8476083240` | `ca-app-pub-6450876479080332/8560357078` |

The new units are named `session_interstitial_ios` and `session_interstitial_android`. Their creation fields selected text/image/rich media, video off and a remote cap of one impression per two minutes for each unit. Those fields were checked during creation; persistence on the app/unit lists still needs confirmation. This cap complements the app-side action/cooldown checks and does not establish production serving.

The public support site also serves `/app-ads.txt` with this authorized-seller record:

```text
google.com, pub-6450876479080332, DIRECT, f08c47fec0942fa0
```

Anonymous browser verification confirmed the published plaintext seller record. App Store Connect's iOS v1.0 draft Marketing URL is saved as `https://sync-app-support.feridun.chatgpt.site/`; reload confirmed it persisted alongside the existing Support URL, with no unsaved changes. The app has not been submitted or released. The public store listing, developer-website association used by crawlers and AdMob app-ads.txt crawl remain unverified. The updated advertising disclosures were published as Sites version 4, deployment `appgdep_6af5087744bc8191a614a66158b84a94`, source commit `c6e1cd91b5a9fe44687b2cee536faa2770b7e010`, at the existing public support URL. This publication does not establish store privacy-form completion.

## Validation and remaining work

The historical initial suite passed **397/397**. The new original-cue/disabled-privacy candidate passes **697/697 tests**, zero failures/skips, including **17** actual SQL tests; the earlier run missing the optional SQL-module environment is superseded. The Ads guard's **47** focused tests pass, and independent source/hash review found no concrete issue. Both Hermes exports pass with all four release flags off and synthetic fixtures. These are source/export checks, not regional forms, a new native build or production ad serving. [Candidate evidence](review-billing-live-setup-evidence.json)

Native iOS validation passed: CocoaPods installed 114 pods, including RNGoogleMobileAds 17.0.0, Google Mobile Ads 13.6.0 and UMP 3.1.0. Xcode's fresh Debug simulator build succeeded with normal signing. Signature verification passed; linked Google Mobile Ads/UMP/RNGoogleMobileAds and RNPurchases classes were confirmed, and the normal simulator application-identifier entitlement for SecureStore was retained. The built plist has the expected real iOS application ID, `GADDelayAppMeasurementInit=true`, 50 SKAdNetwork entries and no ATT usage prompt. The binary was installed on iPhone 17 Pro without resetting app data and then launched for UI validation. Google's adaptive test banner loaded in Discover; search and the detail sheet each hid the banner and restored it on dismissal. In that earlier banner-only build, Timer had no ad placement, and Profile displayed the signed-in account with Free access and the ad-privacy entry. After a fresh JavaScript reload, the explicit privacy action received UMP `NOT_REQUIRED` on this device and displayed friendly guidance that no additional choices were required.

The preceding hardening pass's JavaScript checks on a fresh isolated guest iOS 26.1 simulator also passed: Discover displayed **Advertisement / Test mode** demo inventory, the banner disappeared during running and paused Quick Burst sessions, and it returned after ending the session. Backgrounding to iOS Home removed the banner; foregrounding the same process restored a single test banner. No ad was clicked. Isolated-guest routine-selection/confirmation checks are recorded in [membership setup](membership-setup.md).

Native iOS session-interstitial presentation passed on the isolated guest QA device: after selecting Quick Burst and pressing Start, Google’s full-screen interstitial appeared with a Test mode badge. The close interaction then failed because the computer-use screen-capture service could not obtain the Simulator window/stream. No successful native CLOSED-to-Start, Continue or foreground recovery result was observed, and the QA process was stopped afterward. No ad body was clicked. Those lifecycle behaviors and verified-Pro zero-SDK requests are covered by the real React provider/hook integration tests with a stub native SDK; they are not a live Pro purchase/device result. The earlier checks validate banner demo inventory, placement behavior and the current device's privacy status, not production serving or a European/US consent form. Real music playback, audio synchronization, real-Pro transitions and account switches during consent/load have automated coverage but no live ad-device result from this hardening pass. Real recovery across process termination, Android and distribution behavior remain untested.

Pending owner/configuration steps:

1. Account approval is **APPROVED**, with account-level serving enabled. iOS has two active units but remains **review required / limited serving**. Store search for 6833659501 has no result while unpublished; no store link was written. Complete the app-specific store link/approval when available and verify actual readiness separately.
2. Link each unpublished AdMob app to its intended store listing and complete required app review; verify serving readiness and the app-ads.txt crawl/developer-website association after publication. The iOS draft Marketing URL is already saved; this does not publish a store listing.
3. Validate the published European/US messages, required choices and withdrawal/options behavior on applicable regional test devices; the current device returned NOT_REQUIRED.
4. Complete App Privacy answers and the final SDK manifest/report review. Age answers are now saved with **Advertising Yes** for the intended public Ads ON release; current Store5/future flag remain OFF. Enable only with final configuration, consent/privacy and per-app serving validation aligned; the saved age rating is not serving proof.
5. Finish native session-interstitial checks with Google test inventory: Start only after close/foreground, Continue without restarting, Pro suppression and no active-session ads. Native test-ad presentation is already verified. Then validate intended production-serving configuration when account/store readiness allows it, without clicking live ads. Google adaptive demo inventory is already verified on the iOS simulator. Build and validate Android/distribution binaries separately.
6. Extend device checks to music/audio-sync suppression, real-Pro upgrade/removal, logout/account switches during consent/load, regional privacy forms, no-fill/offline behavior and accessibility/layout. Guest demo inventory, running/paused workout suppression, session-end restoration, background/foreground, search/detail suppression, the prior Timer-without-banner view and the current-device privacy action already passed.
   The final regression suite and iOS/Android exports have passed. Repeat the affected checks after future changes; bundle export alone does not establish distribution signing or production ad readiness.

The earlier SMTP/auth tests and canonical Free subscription sync remain valid for their original scope; a native build/install alone does not validate live ad delivery or completed consent messages.

## Primary references

- [Google interstitial placement policy](https://support.google.com/admob/answer/6201362?hl=en-GB)
- [Google interstitial guidance](https://support.google.com/admob/answer/6066980?hl=en)
- [Google iOS interstitial lifecycle](https://developers.google.com/admob/ios/interstitial)
- [Google Android interstitial lifecycle](https://developers.google.com/admob/android/interstitial)
- [Google UMP setup](https://developers.google.com/admob/ios/privacy)
- [Google consent and withdrawal guidance](https://developers.google.com/admob/ios/privacy/gdpr)
- [Google initialization and possible preloading](https://developers.google.com/admob/ios/quick-start)
- [Google iOS SDK data disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure)
- [Google iOS US privacy/GPP signals](https://developers.google.com/admob/ios/privacy/us-states)
- [Google Android US privacy/GPP signals](https://developers.google.com/admob/android/privacy/us-states)
- [Google Android SDK data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Google publisher first-party ID](https://developers.google.com/admob/ios/privacy/strategies)
- [Apple app privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple tracking permission and user choice](https://developer.apple.com/app-store/user-privacy-and-data-use/)

The saved iOS and Android ad-unit lists both show the new interstitial and its one-impression-per-two-minute cap. Video was disabled in the submitted creation settings; text/image/rich-media stayed enabled. Production serving remains disabled and store/app review is still required.

### iOS guest native follow-up, 12 November 2026

The isolated iOS 26.1 QA device displayed a Google test interstitial before a new five-second session. Closing the native ad released Start at the full duration and the session completed. A subsequent session inside the cooldown started without another ad. After the cooldown, pressing Finish on the completed-session summary opened a real test interstitial; closing it returned to Ready without starting playback or another workout. No ad content was clicked. This completes the previously unverified guest Close→Start and Finish→Close boundaries using the existing signed Debug ads binary/current JavaScript. It does not establish regional consent, real Pro/account-switch/music transitions, physical-device behavior or distribution readiness. Production ads remain off.

## Store5 terminal delivery boundary

Store5's exact 24/24-verified IPA was directly uploaded using official Apple altool after the old EAS submission was canceled. Apple VALID and existing Sync Internal QA Testing (1 tester/3 builds, 90 days) are verified. Its Ads flag remains OFF; the owner reports physical build5 monthly/yearly prices correct, without independent capture or purchase proof. This is not the future 697 original-cue/privacy-guard candidate, public ad serving or a resolved GMA tracking assessment. [Delivery evidence](review-billing-live-setup-evidence.json)

The last fully validated pre-recovery base is **b5d8acf**, 149 files/SHA `d826602b2517ff7036f1429c6fe202bc51dd909c79a3a7e80428cba5536e0970`,697 tests. Root's signed existing-template Simulator overlay retained B/test data and displayed 1/1 round correctly; the earlier 0:08 completion is historical, without audio-hearing/network-capture proof. RecoveryV2 is newer 151-file frozen source with 119 targeted tests passed; full 721/Hermes/archive 150 now pass; new Store6/phone recovery remain pending. B's failed physical reset and fresh credential handoff still block Apple reviewer-field readiness. The saved primary category/subtitle are independently recorded metadata, not an advertising or purchase result.
