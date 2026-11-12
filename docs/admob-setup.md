# AdMob setup

## Current state

The app integrates `react-native-google-mobile-ads` **17.0.0**, pinned for React Native **0.81.5** and Expo **54**. The preceding integration built and installed a signed native Debug iOS simulator binary with the ads SDK. The current session-ad pass adds no native dependency and reuses that binary; it does not claim a fresh native build. A native interstitial presentation passed; closing and continuing the session remain unverified. Expo Go cannot validate this integration; Android and distribution binaries still need their own build/device validation.

The AdMob account shows its reactivation information under review. The payment profile was already complete; this setup did not change financial-profile details. Both iOS and Android app records exist as unpublished apps, each with one banner unit and a newly created session interstitial unit. Store linking/review is still required and serving is limited. European and US UMP messages are published for both apps. Google's adaptive demo banner loaded in the iOS simulator; production serving and regional consent-form presentation remain unvalidated.

## Placement and access

There is one banner placement: Discover's fixed header below the categories, outside the feed scroll and navigation dock. The creative uses an anchored-adaptive banner sized to the available width and is labelled **Advertisement**. Full-screen session-boundary placements are described below; there are no rewarded, app-open or arbitrary tab-change placements. One placement does not mean one lifetime network request; a native banner can refresh according to AdMob settings or be recreated after its identity/size changes.

The app prepares the placement only while foregrounded, Discover is focused and visible, no search/detail or blocking overlay is open, the feed is not empty, and no active or paused workout, music playback or audio synchronization is occurring. Stale native callbacks cannot revive a retired placement. Failed/no-fill loads do not block the timer, routines or music.

### Session boundaries

The user confirmed no advertising while a session is active, including work, rest and pause. Eligible Free users can receive an already-loaded interstitial before a NEW Start or when they explicitly press **Continue** on the ended-session summary. Resume and phase skips never create an opportunity. Timer copy explains these boundaries and that Sync Pro removes all ads.

The first and each subsequent full-screen presentation require two distinct real app actions. Accepted routine choices and Start/Continue actions count; duplicate taps and old opportunity IDs do not. A separate 120-second cooldown applies from native OPENED, with no immediate automatic presentation after close. This implements Google's action-spacing rule with an additional product limit; 120 seconds is not a Google-mandated threshold. [Google's disallowed implementations](https://support.google.com/admob/answer/6201362?hl=en-GB) require natural content breaks and prohibit repeated or unexpected interstitials.

Preloading never presents. Start/Continue consumes only ready inventory and never waits for an ad to load; no-fill, expiry and unavailable inventory are skipped. Cache age is capped at 55 minutes, in-flight loads at 15 seconds and load-error retries delayed 30 seconds. These are product limits; Google documents an approximately one-hour interstitial cache window and recommends advance loading. [iOS guidance](https://developers.google.com/admob/ios/interstitial), [Android guidance](https://developers.google.com/admob/android/interstitial).

Audio previews/cues stop first. Shared UMP/native-presentation barriers drain before Start, and a displayed creative holds the action until native CLOSED or presentation ERROR. The `show()` promise is not a dismissal event. Actual foreground, focus, identity, selected routine reference and session are checked before synchronous timer/audio start. Duplicate taps coalesce; blur, routine/account changes and unmount retire old continuations. SDK audio stays muted; there is no independent audio-ad playback. Muting alone is not a promise that an SDK cannot affect the audio session, so active-session placements remain prohibited.

Stable guests are eligible. Signed-in users require matching auth/subscription identities, a ready subscription state and successful backend access verification. Pro, unknown/failed verification, an SDK purchase awaiting backend confirmation, and purchase/restore loading suppress ads. A pending purchase remains pending when server verification fails, without granting Pro or permitting repeated checkout. Verification clears immediately during identity changes or queued refreshes; an offerings-only SDK error does not turn a successfully checked backend result into unknown access.

Pro is ad-free: the automatic placement path does not load consent/native ads or initialize Google Mobile Ads for a verified Pro account. If the SDK was already initialized earlier in the process, becoming Pro removes the banner, retires prepared interstitials and prevents further placement requests; process-wide initialization cannot be undone. An already-presented native creative cannot be programmatically dismissed by `destroy()`, so terminal listeners remain until it closes and no new ad is started. Users can still explicitly manage required privacy choices from Profile without that action initializing Google Mobile Ads.

## Consent and data

The native module is loaded lazily after account and placement guards pass. The controller requests updated UMP consent information, presents a required form, and checks `canRequestAds` before configuring and initializing Google Mobile Ads. It re-checks identity/foreground/placement after asynchronous steps. Google initialization is shared across the process rather than repeated for each account or screen.

**Profile → Preferences → Ad privacy choices** checks the current UMP status and opens its privacy-options form when required; otherwise it reports that no additional choices are required for the current device. This is an explicit privacy action, including for guests/Pro, rather than a banner request. The Profile action is blocked while a workout, music playback or audio synchronization is active. The Privacy policy link remains available independently of whether UMP requires an options form. The published messages are associated with both configured apps; publication alone does not prove that a regional form has appeared or that every jurisdictional requirement is met.

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

The final full automated suite passed **397/397 tests**, and final iOS/Android exports passed. Ads regression coverage includes identity changes, stale results, pending/failed verification, placement safety, consent ordering, one-time initialization, request configuration and missing-native/web behavior. Session-ad regressions also cover native close barriers, spacing/cooldown, no-fill/expiry, stale callbacks, overlapping Start/Finish, Pro/unknown access, cleanup/consent holds and the actual AdsProvider/useSessionAds wiring. The hardening suite also covers recovery-session restoration, pending-purchase verification failures, interrupted local backup replacement, guest cleanup and routine-selection confirmations. Prior export checks confirmed canonical legal URLs in both bundles without dumping other environment values. These tests do not demonstrate regional consent forms or production ad serving.

Native iOS validation passed: CocoaPods installed 114 pods, including RNGoogleMobileAds 17.0.0, Google Mobile Ads 13.6.0 and UMP 3.1.0. Xcode's fresh Debug simulator build succeeded with normal signing. Signature verification passed; linked Google Mobile Ads/UMP/RNGoogleMobileAds and RNPurchases classes were confirmed, and the normal simulator application-identifier entitlement for SecureStore was retained. The built plist has the expected real iOS application ID, `GADDelayAppMeasurementInit=true`, 50 SKAdNetwork entries and no ATT usage prompt. The binary was installed on iPhone 17 Pro without resetting app data and then launched for UI validation. Google's adaptive test banner loaded in Discover; search and the detail sheet each hid the banner and restored it on dismissal. In that earlier banner-only build, Timer had no ad placement, and Profile displayed the signed-in account with Free access and the ad-privacy entry. After a fresh JavaScript reload, the explicit privacy action received UMP `NOT_REQUIRED` on this device and displayed friendly guidance that no additional choices were required.

The preceding hardening pass's JavaScript checks on a fresh isolated guest iOS 26.1 simulator also passed: Discover displayed **Advertisement / Test mode** demo inventory, the banner disappeared during running and paused Quick Burst sessions, and it returned after ending the session. Backgrounding to iOS Home removed the banner; foregrounding the same process restored a single test banner. No ad was clicked. Isolated-guest routine-selection/confirmation checks are recorded in [membership setup](membership-setup.md).

Native iOS session-interstitial presentation passed on the isolated guest QA device: after selecting Quick Burst and pressing Start, Google’s full-screen interstitial appeared with a Test mode badge. The close interaction then failed because the computer-use screen-capture service could not obtain the Simulator window/stream. No successful native CLOSED-to-Start, Continue or foreground recovery result was observed, and the QA process was stopped afterward. No ad body was clicked. Those lifecycle behaviors and verified-Pro zero-SDK requests are covered by the real React provider/hook integration tests with a stub native SDK; they are not a live Pro purchase/device result. The earlier checks validate banner demo inventory, placement behavior and the current device's privacy status, not production serving or a European/US consent form. Real music playback, audio synchronization, real-Pro transitions and account switches during consent/load have automated coverage but no live ad-device result from this hardening pass. Real recovery across process termination, Android and distribution behavior remain untested.

Pending owner/configuration steps:

1. Finish AdMob reactivation review and verify serving readiness.
2. Link each unpublished AdMob app to its intended store listing and complete required app review; verify serving readiness and the app-ads.txt crawl/developer-website association after publication. The iOS draft Marketing URL is already saved; this does not publish a store listing.
3. Validate the published European/US messages, required choices and withdrawal/options behavior on applicable regional test devices; the current device returned NOT_REQUIRED.
4. Complete accurate store privacy answers and check the installed SDK manifests/report. The session-ad disclosures are published and publicly checked; keep them aligned with the final store privacy answers.
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
