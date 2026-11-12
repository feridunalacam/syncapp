# iOS App Store release draft

Updated on 12 November 2026 from repository configuration, recorded native QA and the inspected cloud Store IPA. Source `da7339f` produced **1.0.0 (2)**; EAS Build `015a6833…` finished and EAS Submit `771ac1eb…` uploaded it to Apple. Apple reports `VALID` and `READY_FOR_BETA_TESTING` internally. Tester-group access is not yet configured, and no App Review or public release is established. The listing copy below remains a draft. Current work is iOS only; there is no Google Play account in scope. Apple banking, tax and seller setup remain partly incomplete and deferred. The owner declined an additional Supabase QA project. The possible review path within the existing project is documented, but not implemented, in `subscription-validation.md`.

## Release state and remaining gates

| Item | Verified state | Remaining gate |
| --- | --- | --- |
| Apple paid release | App Store app and monthly/yearly products remain unpublished drafts. | Merchant/seller steps and product review assets remain incomplete and deferred. Paid release is not ready. |
| Real subscription lifecycle | Native SDK integration and a real authenticated canonical Free sync have been observed. Production still rejects sandbox receipts. | Purchase, renewal, refund and transfer-to-Pro have not completed end to end. See `subscription-validation.md`; no production test grant or new backend is authorized. |
| Spotify release availability | Spotify is hard-disabled in production and preview by the `__DEV__`/build-profile guard and public configuration. The owner development path is preserved. | Public quota/commercial permission remains unverified, so the submitted app and marketing must continue to exclude Spotify. The five-user Development Mode allowlist is not public access. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). |
| Spotify audio safeguards | Phase-aware guards now suppress local voice/effects/legacy alerts while Spotify owns playback, including preparation. Saved settings remain intact. | These safeguards do not establish permission for public/commercial use. Spotify's definitions include background-app control and its policy restricts monetized streaming and audio overlap. [Definitions](https://developer.spotify.com/terms), [policy](https://developer.spotify.com/policy). |
| Bundled artwork and effects | The lake photographs were replaced with original graphite/lime timer artwork and editable SVG sources. All 15 old sound MP3s and two unused audio examples were removed. Four new synthesized WAVs plus existing original cues retain all 14 legacy URIs/IDs. | The owner-chosen English ElevenLabs recordings are unchanged and remain subject to that account's plan/terms; this work does not establish commercial-license evidence for them. [Apple content-rights rules](https://developer.apple.com/app-store/review/guidelines/#intellectual-property). |
| Expo and distribution | EAS Build `015a6833…` finished on source `da7339f`; the Store IPA passed strict signature/profile inspection. The existing App Manager API key, distribution certificate and app-specific profile are assigned in the EAS vault. Apple profile fetch through the CLI succeeded with the team environment supplied. | This establishes build/signing delivery, not paid-service or final runtime validation. No Admin role or additional API key was used. |
| Apple build processing | EAS Submit `771ac1eb…` uploaded **1.0.0 (2)** successfully on the Free plan. Apple processing is complete: `VALID`, internal `READY_FOR_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`, not expired. Live, in-review and pending-release states are empty. | No tester-group assignment, new tester invitation or external beta review is recorded. Internal-ready status does not by itself give the owner installation access. No App Review/public release occurred. |
| Backend | All three Edge Functions are deployed at version 4. Fresh unauthenticated POSTs returned 401 for each, and rolled-back hosted SQL RLS/billing checks passed. No schema change was made. | A 401 or SQL-role fixture is not a paid Apple transaction or a positive real JWT operation. Final-source authenticated/native lifecycle checks remain open. |
| Advertising | Production/preview ads remain disabled. Native Debug QA observed a Google test ad close, a five-second session start afterward, and completion. | Earlier Debug QA also verified Finish → test ad Close → Ready and cooldown skips. Serving review, real-Pro/regional checks and final App Store privacy answers remain open; keep production ads off. |
| Final release artifacts | **496/496 tests**, both Hermes exports, fresh local CNG Worklets **0.5.1** Release build/codesign and the cloud Store IPA checks pass. Fresh CNG guest launch, editor and Duration → Apply 5 seconds were observed. | Final new-CNG short-session completion and clipboard retests remain pending; final GUI checks must run separately from the concurrent store-capture workflow. Earlier Worklets 0.6.1 QA is scoped below. Final screenshot coverage and privacy/age-rating answers remain open. |

Spotify quota and commercial permission are distinct; neither is claimed by its development availability. The production guard is a completed release decision, not an approval from Spotify.

## Actual iOS configuration

| Setting | Repository value |
| --- | --- |
| App Store draft name / ID | Sync - Interval Timer / `6833659501`, recorded in `membership-setup.md`. |
| Bundle identifier | `com.feridun.syncapp`. |
| Display name | **Sync**, verified in the shipped IPA. The App Store draft retains its separate descriptive name. |
| App version / native build | Shipped Store build **1.0.0 (2)**, source `da7339f`. EAS uses remote app-version sourcing and production `autoIncrement: true`. |
| Minimum supported OS | Shipped `MinimumOSVersion`: **15.1**. The source plist's `LSMinimumSystemVersion=12.0` is not the effective iOS deployment target. |
| Devices | Shipped device family **1,2**: iPhone and iPad. iPad remains part of screenshot/layout validation. |
| Orientations | Shipped IPA: iPhone portrait and upside-down; iPad portrait, upside-down and both landscapes. `UIRequiresFullScreen=false`. The iPad binary is not portrait-only. |
| Theme/accessibility | Automatic system appearance. Native Liquid Glass is an iOS 26 enhancement; older systems/Reduce Transparency use a fallback. Do not list iOS 26 as the minimum requirement. |
| Background behavior | Session and music pause when leaving the foreground; return does not automatically resume. No background-timer/lock-screen workout guarantee. Native plist has no `UIBackgroundModes` declaration. |
| Networking / export declaration | Shipped `ITSAppUsesNonExemptEncryption=false`. Source ATS arbitrary loads are false and local networking is allowed. In-app web audio accepts HTTP/HTTPS addresses, but ATS may prevent insecure remote playback. No promise that every URL/media format works. |
| Build tools / architecture | Shipped IPA: **device arm64**, Xcode **26.6**, `iphoneos26.5`. EAS is pinned to the documented Xcode 26.6 image and Node **22.23.4**. [Upload requirements](https://developer.apple.com/news/upcoming-requirements/). |

Cloud CNG generated the native project from app configuration/plugins after `.easignore` corrected the first build's missing-Podfile failure. The second cloud build passed Doctor **18/18**, Prebuild, pods, JavaScript bundling and Fastlane. The shipped values above come from the actual Store IPA; local tracked/generated snapshots are separate evidence. [Expo iOS build process](https://docs.expo.dev/build-reference/ios-builds/).

## Branding, permissions and privacy evidence

- The installed artwork sources are `assets/branding/icon.svg` and `assets/branding/splash.svg`; their PNGs are the opaque RGB 1024×1024 icon and 2048×2048 splash. The original timer design uses graphite `#151816`, lime work/rest arcs and custom vector lettering, with no stock photograph, external logo or font glyph. Actual launch layout still belongs to final native QA.
- Camera access is used only after choosing Camera for a profile photo. The revised camera purpose text states that use. The revised photo-library purpose text covers selecting a profile photo and audio/video for routine music. Files import remains independent of library permission.
- Microphone, Face ID and photo-library-add usage-description keys are absent in the **shipped Store IPA**, matching the image-picker/AV/SecureStore/media-library plugin settings. Camera and photo-library purpose text is present and matches the intended flows. [Expo permissions](https://docs.expo.dev/guides/permissions/).
- The app privacy manifest declares required API reasons for file timestamps, UserDefaults, disk space and boot time. Its empty collected-data array and false tracking flag are not a complete app privacy answer: account/cloud data is sent to Supabase and purchases to RevenueCat.
- The actual IPA contains **15 privacy manifests**. Three declare collected data: **11 declarations across 8 categories**, with four required-reason API categories across the bundle. Google Ads marks its linked Device ID category for tracking; UMP and RevenueCat declarations match the existing draft matrix. This is a **shipped-manifest inventory, not an official Xcode aggregated report or final privacy questionnaire**. Runtime/partner behavior and the app's account-linked data still need review. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Apple app privacy](https://developer.apple.com/app-store/app-privacy-details/).
- Original cue replacements, their reproducible standard-library generator and the preserved legacy URI mapping are documented in `alert-sounds.md`. The English coach recordings are unchanged; their account-plan/terms caveat remains in `coach-voice.md`.
- No HealthKit integration or medical advice is present. Do not make measured-heart-rate, calorie, clinical, Apple Health or Apple Watch claims.

The proposed category/purpose/linking/tracking answers and explicit owner review points are in `app-store-privacy.md`. That draft distinguishes account-linked RevenueCat data, reachable UMP privacy requests and dormant GMA declarations; no questionnaire answers have been submitted.

## Service and legal configuration

EAS is linked to project `2b38178c-60e8-4fe2-94da-f51dc14f4efc` under `feridunalacam`. The successful cloud build and Submit used the Free plan; no paid plan was activated. Four public runtime variables are configured in development, preview and production. `eas.json` explicitly selects these environments, inherits canonical legal URLs and disables production/preview advertising and Spotify. The development profile preserves owner Spotify access and Google test inventory.

The existing App Manager API key, Apple Distribution certificate and app-specific App Store profile are stored/assigned in the EAS vault. Apple profile fetch through the CLI validated API access with the team environment supplied. No Admin role or additional API key was used. The signed Store IPA and successful upload are now verified, while billing and tester access remain separate gates. `.env.local` remains ignored; it is not the source of remote job values. Backend/service-role, RevenueCat secret and webhook keys remain server-only. [Expo environment variables](https://docs.expo.dev/eas/environment-variables/).

| Public destination | Intended use / evidence |
| --- | --- |
| [Privacy Policy](https://sync-app-support.feridun.chatgpt.site/privacy) | Canonical URL in example env/EAS; App Store Privacy Policy field and anonymous page navigation were previously verified in `membership-setup.md`. |
| [Terms of Use](https://sync-app-support.feridun.chatgpt.site/terms) | Canonical in-app paywall terms URL; published previously. This does not establish whether a custom App Store EULA field has been configured. |
| [Support/marketing site](https://sync-app-support.feridun.chatgpt.site/) | Existing public site; App Store Support URL and v1.0 Marketing URL persistence were recorded earlier. Verify exact current Support field before submission. |

The Apple/Google Sync-account provider flags remain disabled; main accounts use email/password. Spotify is an owner-development-only music connection and is excluded from release builds. Keep all disabled integrations out of release screenshots and copy.

## Proposed English metadata

This copy deliberately makes no public Spotify, background execution, online social network or measured-health claim. It remains a **draft** until the release composition and validation gates above are settled.

**Name:** Sync - Interval Timer

**Subtitle:** Work, rest, music and routines

**Promotional text:** Build your own work and rest rounds, add local audio, and keep your training routines and session history in one place.

**Keywords:** hiit,tabata,workout,rounds,training,countdown,rest,boxing,routines,fitness

**Suggested category:** Health & Fitness. This is a proposal, not a saved App Store value. Age rating must reflect the actual embedded web browsing and any enabled advertising, not just the timer.

**Description draft:**

Sync helps you plan and run interval training your way. Create work and rest rounds, choose your timing, and follow a clear countdown while you train.

Build routines for HIIT, circuits, boxing practice and other timed sessions. Use the same work and rest duration throughout, or customize individual rounds. Add preparation time and choose countdown, voice or sound cues.

Make each session your own with audio files you import from Files. You can assign different audio to work and rest rounds, adjust their volumes, or train in silence. Imported files stay on the device where you added them.

Your timer, local routines and session history work without an account. Pause and resume when you need to, review completed activity, and reuse your saved routines. Leaving the app pauses the session; come back and resume when you are ready.

Discover includes sample routines and content you save locally. It is not a public social feed.

Optional Sync Pro adds private cloud backup and synchronization of supported routine, activity and profile data across your signed-in devices, and removes ads. An account is required for cloud features. Imported audio and profile photos remain on your device. Monthly and annual subscriptions renew automatically unless cancelled in your Apple subscription settings; the app displays your store's current price before purchase.

Privacy Policy: https://sync-app-support.feridun.chatgpt.site/privacy

Terms of Use: https://sync-app-support.feridun.chatgpt.site/terms

**Copy constraints:** Publish the Sync Pro paragraph only when that functionality is available and verified in the submitted release. If paid functionality is deferred, revise the binary and listing together; changing the listing alone does not hide an unfinished paywall. Do not advertise all sound sources as licensed, any arbitrary site as downloadable, all media formats as supported, or public Spotify availability. If ads are enabled later, keep the listing/screenshots and privacy disclosures aligned with actual placements.

## Review notes and screenshots to prepare

Review notes should explain that the core timer is usable as a guest, how to select a routine in Training and start it in Timer, and that Discover uses samples/local saved content. Supply a dedicated reviewer account only through the authorized App Store review process if account/Pro features are included. Do not use the owner's account or invent paid access. Identify the real reviewable subscription products and restoration path after validation; state any deliberate feature restrictions accurately.

Capture the final binary's Ready/active Timer, routine library, routine editor, cue settings and Activity screen with fresh non-personal data. Because this target includes iPad, prepare genuine iPad captures and verify landscape/multitasking layout as shipped. Do not substitute scaled iPhone screenshots or assume the required App Store screenshot set is complete from native QA captures. Check the final device classes and sizes against [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

The signed build number, device family/orientations and Store upload are recorded. Before App Review, finish the final native QA/capture coverage, official privacy-report/questionnaire review, metadata/age-rating answers and authorized reviewer access. Merchant and real billing gates remain open.

The original **13 raw screenshots and 13 pixel-identical RGB derivatives** remain in the persistent `app-store-candidates` visualization folder: six iPhone and seven iPad, source `f1bfac6`, Simulator Release, native Worklets **0.6.1**. A separate `current-cng-da7339f/` group now contains **three raw plus three verified RGB iPad Ready/editor/cue captures**, from local CNG Simulator Release (1), Worklets **0.5.1**, with synthetic public configuration. Neither group is a complete final Store-build capture set; the older 13 were not relabeled. See [the submission packet](app-store-submission-packet.md#screenshot-capture-manifest).

## Latest native ads evidence

On the isolated iOS 26.1 guest QA simulator, Google's real test interstitial opened before Start. Native Close released a five-second session at its full duration and it completed. A subsequent Start inside the cooldown proceeded directly. After eligibility and cooldown, the ended-session Finish action opened a real test interstitial; native Close returned to Ready with no automatic session start. These are Debug/current-JavaScript checks, not signed distribution, regional consent, paid account, music or physical-device evidence.

## Final build and handoff status

Source `da7339f` produced the finished cloud Store build **1.0.0 (2)** through EAS Build `015a6833…`. Strict/deep signature verification, App Store profile classification, expected team/application identifiers, device arm64 and `get-task-allow=false` all passed. EAS Submit `771ac1eb…` uploaded the IPA successfully. Apple subsequently reports processing **VALID**, internal **READY_FOR_BETA_TESTING**, external **READY_FOR_BETA_SUBMISSION**, not expired; live/in-review/pending-release states are empty. No tester-group assignment, invitation, external beta review, App Review or public release is recorded.

The recorded automated run passed **496/496**, with both Hermes exports. Fresh isolated CNG with direct Worklets **0.5.1** passed pod installation, normal-signed Release simulator build and codesign verification; only Worklets changed from the earlier native pod versions. The local build used synthetic public runtime configuration and does not validate live services.

| Native QA scope | Observed result | Remaining boundary |
| --- | --- | --- |
| Pre-pin `f1bfac6`, Worklets 0.6.1, isolated iPhone/iPad simulators | Genuine four-minute/three-round completion and Activity history; iPad background pause, landscape and Finish; Copy image/transparent clipboard passed on both devices. Earlier iPhone reorder and deletion-cancel checks also passed. | These checks precede the Worklets pin and are not final 0.5.1/TestFlight runtime proof. |
| Fresh local CNG, Worklets 0.5.1 | Guest launch, routine editor and Duration → Apply 5 seconds observed; three iPad Ready/editor/cue captures are separately packaged as raw plus verified RGB candidates. | Final short-session completion/clipboard retests remain pending; final GUI checks must run separately from the concurrent store-capture workflow. The screenshots are local Simulator Release (1), not proof of the signed Store (2) runtime. |
| Uploaded Store 1.0.0 (2) | IPA/signing/profile/manifest inventory and Apple processing passed. | Tester-group access and actual TestFlight runtime checks remain open. Internal-ready status alone does not guarantee owner installation. |

Banking/tax/seller steps remain deferred, real Apple purchase/renewal/refund/restore-to-Pro validation remains open, and no new backend or production test grant was created. Production ads remain off. A public-source-only audit approved after matching the public GitHub lockfile led to compatible patches across six package families without changing Expo/RN/native versions; the later direct Worklets 0.5.1 correction was separately validated. The recorded audit has 21 findings, including 2 high Node build-tool records and no critical findings; it is not a clean audit. See [dependency security](dependency-security.md) and the [automatic EAS guard](release-preflight.md).
