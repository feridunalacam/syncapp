# AdMob setup

## Current state

The app integrates `react-native-google-mobile-ads` **17.0.0**, pinned for React Native **0.81.5** and Expo **54**. A fresh native Debug iOS simulator binary with the ads SDK has built and installed successfully. Expo Go cannot validate this integration; Android and distribution binaries still need their own build/device validation.

The AdMob account shows its reactivation information under review. The payment profile was already complete; this setup did not change financial-profile details. Both iOS and Android app records exist as unpublished apps, each with one active banner unit. Store linking/review is still required and serving is limited. European and US UMP messages are published for both apps. Google's adaptive demo banner loaded in the iOS simulator; production serving and regional consent-form presentation remain unvalidated.

## Placement and access

There is one banner placement: Discover's fixed header below the categories, outside the feed scroll and navigation dock. The creative uses an anchored-adaptive banner sized to the available width and is labelled **Advertisement**. There are no interstitial, rewarded or app-open placements. One placement does not mean one lifetime network request; a native banner can refresh according to AdMob settings or be recreated after its identity/size changes.

The app prepares the placement only while foregrounded, Discover is focused and visible, no search/detail or blocking overlay is open, the feed is not empty, and no active or paused workout, music playback or audio synchronization is occurring. Stale native callbacks cannot revive a retired placement. Failed/no-fill loads do not block the timer, routines or music.

Stable guests are eligible. Signed-in users require matching auth/subscription identities, a ready subscription state and successful backend access verification. Pro, unknown/failed verification, an SDK purchase awaiting backend confirmation, and purchase/restore loading suppress ads. Verification clears immediately during identity changes or queued refreshes; an offerings-only SDK error does not turn a successfully checked backend result into unknown access.

Pro is ad-free: the automatic placement path does not load consent/native ads or initialize Google Mobile Ads for a verified Pro account. If the SDK was already initialized earlier in the process, becoming Pro removes the banner and prevents further placement requests; process-wide initialization cannot be undone. Users can still explicitly manage required privacy choices from Profile without that action initializing Google Mobile Ads.

## Consent and data

The native module is loaded lazily after account and placement guards pass. The controller requests updated UMP consent information, presents a required form, and checks `canRequestAds` before configuring and initializing Google Mobile Ads. It re-checks identity/foreground/placement after asynchronous steps. Google initialization is shared across the process rather than repeated for each account or screen.

**Profile → Preferences → Ad privacy choices** checks the current UMP status and opens its privacy-options form when required; otherwise it reports that no additional choices are required for the current device. This is an explicit privacy action, including for guests/Pro, rather than a banner request. The Profile action is blocked while a workout, music playback or audio synchronization is active. The Privacy policy link remains available independently of whether UMP requires an options form. The published messages are associated with both configured apps; publication alone does not prove that a regional form has appeared or that every jurisdictional requirement is met.

AdMob dashboard configuration now includes:

- **Sync - European privacy choices:** published for both apps, English plus 31 additional languages (32 total), Reject enabled for all regions, a custom partner list containing only Google (vendor 755), and automatic partner additions disabled. Other European-message defaults remain unchanged.
- **Sync - US privacy choices:** published for both apps, the default set of all current and future supported US states, English (`en-US`), Spanish (`es`) and Latin American Spanish (`es-419`), with the standard opt-out configuration.
- No IDFA/ATT message was created.

These are saved message settings, not a claim of comprehensive legal compliance or successful EEA/US device-form testing.

All banner requests set `requestNonPersonalizedAdsOnly: true`, and request configuration uses `maxAdContentRating: G`. The content filter does not assert the user's age or establish child-directed compliance. The app does not request ATT permission and supplies no ATT usage prompt. Non-personalized requests do not mean zero data collection or eliminate the need for appropriate UMP choices/disclosures.

The SDK's publisher first-party ID default is **retained**. Version 17's exposed compatibility stub is not a working native opt-out, so this integration does not claim to disable that identifier. Sync passes no account/email identifier, routines, activity, cloud-backup payload, music metadata or connection credentials into ads. Google can still process SDK/device, approximate-location, advertising-interaction and diagnostic data according to the installed SDK and request configuration.

The public Privacy/Terms/support pages now include the advertising and UMP behavior above; the published `privacy#ads` section was checked in a browser. Before production enablement, complete accurate App Store privacy/Google Play Data safety answers for the actual SDK, purposes, consent choices and identifiers. Review the Xcode aggregated privacy report from the final native build. Existing static-site statements about having no website analytics remain separate from in-app advertising. No definitive legal declaration or privacy-form submission is established by this document.

## Public configuration

Application IDs use the AdMob `~` form and belong in native build/plugin configuration. Banner ad-unit IDs use the `/` form and belong in the public runtime variables below. They are public identifiers, not backend secrets. A native application-ID change requires rebuilding the binary.

| Setting                               | Behavior                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_ADS_ENABLED`             | Development is enabled unless exactly `false`; release requires exactly `true`.                                             |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID`     | Release iOS banner-unit ID; required for iOS serving.                                                                       |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID` | Release Android banner-unit ID; required for Android serving.                                                               |
| Development unit                      | Always Google's `TestIds.ADAPTIVE_BANNER`, even if real unit variables exist. Emulator requests are marked for testing.     |
| Release unit                          | Must match the platform's valid real unit format; Google's demo publisher and malformed IDs are rejected. No demo fallback. |

The shared EAS base profile explicitly sets ads to `false`, inherited by preview and production. Development overrides this to `true` and still uses Google test inventory. The real public IDs are configured in the EAS base, `.env.example` and ignored local `.env.local`. `app.config.js` and `config/admob.cjs` wire the native plugin with delayed app measurement, 50 SKAdNetwork entries and no ATT prompt. Keep production disabled while release steps remain pending.

| Platform | Application ID                           | Banner unit ID                           |
| -------- | ---------------------------------------- | ---------------------------------------- |
| iOS      | `ca-app-pub-6450876479080332~3587231996` | `ca-app-pub-6450876479080332/9078718471` |
| Android  | `ca-app-pub-6450876479080332~6260983443` | `ca-app-pub-6450876479080332/8476083240` |

The public support site also serves `/app-ads.txt` with this authorized-seller record:

```text
google.com, pub-6450876479080332, DIRECT, f08c47fec0942fa0
```

Anonymous browser verification confirmed the published plaintext seller record. App Store Connect's iOS v1.0 draft Marketing URL is saved as `https://sync-app-support.feridun.chatgpt.site/`; reload confirmed it persisted alongside the existing Support URL, with no unsaved changes. The app has not been submitted or released. The public store listing, developer-website association used by crawlers and AdMob app-ads.txt crawl remain unverified. The advertising disclosures were published as Sites version 3, deployment `appgdep_6af4f658dd288191ada9078541acd7c4`, at the existing public support URL. This publication does not establish store privacy-form completion.

## Validation and remaining work

The targeted subscription/access and ad-eligibility suite passed **29 tests**. The ad runtime/config suite separately passed **26 tests** using injected native/consent responses. These cover identity changes, stale results, pending/failed verification, placement safety, consent ordering, one-time initialization, request configuration and missing-native/web behavior. The final full automated suite passed **290/290 tests**. Final iOS and Android exports passed, and both canonical legal URLs were verified in each bundle without dumping other environment values. These targeted checks do not demonstrate regional consent forms or production ad serving.

Native iOS validation passed: CocoaPods installed 114 pods, including RNGoogleMobileAds 17.0.0, Google Mobile Ads 13.6.0 and UMP 3.1.0. Xcode's fresh Debug simulator build succeeded with normal signing. Signature verification passed; linked Google Mobile Ads/UMP/RNGoogleMobileAds and RNPurchases classes were confirmed, and the normal simulator application-identifier entitlement for SecureStore was retained. The built plist has the expected real iOS application ID, `GADDelayAppMeasurementInit=true`, 50 SKAdNetwork entries and no ATT usage prompt. The binary was installed on iPhone 17 Pro without resetting app data and then launched for UI validation. Google's adaptive test banner loaded in Discover; search and the detail sheet each hid the banner and restored it on dismissal. Timer remained ad-free, and Profile displayed the signed-in account with Free access and the ad-privacy entry. After a fresh JavaScript reload, the explicit privacy action received UMP `NOT_REQUIRED` on this device and displayed friendly guidance that no additional choices were required.

These checks validate demo inventory and the current device's status, not production serving or a European/US consent form. Background transitions, active/paused workouts, real music playback, audio synchronization, guest/real-Pro transitions and account switches during consent/load have automated coverage but no live device result from this run. Process cold-start session persistence, Android and distribution behavior remain untested.

Pending owner/configuration steps:

1. Finish AdMob reactivation review and verify serving readiness.
2. Link each unpublished AdMob app to its intended store listing and complete required app review; verify serving readiness and the app-ads.txt crawl/developer-website association after publication. The iOS draft Marketing URL is already saved; this does not publish a store listing.
3. Validate the published European/US messages, required choices and withdrawal/options behavior on applicable regional test devices; the current device returned NOT_REQUIRED.
4. Complete accurate store privacy answers and check the installed SDK manifests/report. Public advertising disclosures are already published.
5. Validate intended production-serving configuration when account/store readiness allows it, without clicking live ads. Google adaptive demo inventory is already verified on the iOS simulator. Build and validate Android/distribution binaries separately.
6. Extend device checks to background/workout/audio suppression, guests/real-Pro upgrade/removal, logout/account switches during consent/load, regional privacy forms, no-fill/offline behavior and accessibility/layout. Search/detail suppression, an ad-free Timer and the current-device privacy action already passed.
   The final regression suite and iOS/Android exports have passed. Repeat the affected checks after future changes; bundle export alone does not establish distribution signing or production ad readiness.

The earlier SMTP/auth tests and canonical Free subscription sync remain valid for their original scope; a native build/install alone does not validate live ad delivery or completed consent messages.

## Primary references

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
