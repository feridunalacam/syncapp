# iOS App Store release draft

Prepared from repository configuration and primary Apple, Spotify and Expo documentation on 12 November 2026. This document is a draft for review, not a submission or a claim of store readiness. Current work is iOS only; there is no Google Play account in scope. Apple banking, tax and seller setup remain partly incomplete and deferred. The owner declined a new Supabase project/test backend.

## Release state and remaining gates

| Item | Verified state | Remaining gate |
| --- | --- | --- |
| Apple paid release | App Store app and monthly/yearly products remain unpublished drafts. | Merchant/seller steps and product review assets remain incomplete and deferred. Paid release is not ready. |
| Real subscription lifecycle | Native SDK integration and a real authenticated canonical Free sync have been observed. Production still rejects sandbox receipts. | Purchase, renewal, refund and transfer-to-Pro have not completed end to end. See `subscription-validation.md`; no production test grant or new backend is authorized. |
| Spotify release availability | Spotify is hard-disabled in production and preview by the `__DEV__`/build-profile guard and public configuration. The owner development path is preserved. | Public quota/commercial permission remains unverified, so the submitted app and marketing must continue to exclude Spotify. The five-user Development Mode allowlist is not public access. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). |
| Spotify audio safeguards | Phase-aware guards now suppress local voice/effects/legacy alerts while Spotify owns playback, including preparation. Saved settings remain intact. | These safeguards do not establish permission for public/commercial use. Spotify's definitions include background-app control and its policy restricts monetized streaming and audio overlap. [Definitions](https://developer.spotify.com/terms), [policy](https://developer.spotify.com/policy). |
| Bundled artwork and effects | The lake photographs were replaced with original graphite/lime timer artwork and editable SVG sources. All 15 old sound MP3s and two unused audio examples were removed. Four new synthesized WAVs plus existing original cues retain all 14 legacy URIs/IDs. | The owner-chosen English ElevenLabs recordings are unchanged and remain subject to that account's plan/terms; this work does not establish commercial-license evidence for them. [Apple content-rights rules](https://developer.apple.com/app-store/review/guidelines/#intellectual-property). |
| Expo and distribution | EAS project is linked; four public runtime variables are saved in development, preview and production. Account check showed the Free plan with zero builds used. Internal artifact downloads are private. App Store Connect API access is approved. The Sync EAS Submit App Manager key was created; EAS confirmed vault storage and assignment to this app for Submit. | Apple-side key validation through the CLI was not performed. Distribution signing and a final archive/upload are not verified. |
| Backend | All three Edge Functions are deployed at version 4. Fresh unauthenticated POSTs returned 401 for each, and rolled-back hosted SQL RLS/billing checks passed. No schema change was made. | A 401 or SQL-role fixture is not a paid Apple transaction or a positive real JWT operation. Final-source authenticated/native lifecycle checks remain open. |
| Advertising | Production/preview ads remain disabled. Native Debug QA observed a Google test ad close, a five-second session start afterward, and completion. | Earlier Debug QA also verified Finish → test ad Close → Ready and cooldown skips. Serving review, real-Pro/regional checks and final App Store privacy answers remain open; keep production ads off. |
| Final release artifacts | Latest recorded automated suite: **496/496 passed**. Both current-source platform exports, the iOS Release simulator build, and Release native Copy image/transparent clipboard checks pass. A subsequent UI-copy fix hides the development-only Spotify explanation; its rebuilt Release app passes signature verification. | Final iPad visual QA remains pending. No final distribution archive, complete store screenshot set or privacy/age-rating submission is established. |

Spotify quota and commercial permission are distinct; neither is claimed by its development availability. The production guard is a completed release decision, not an approval from Spotify.

## Actual iOS configuration

| Setting | Repository value |
| --- | --- |
| App Store draft name / ID | Sync - Interval Timer / `6833659501`, recorded in `membership-setup.md`. |
| Bundle identifier | `com.feridun.syncapp`. |
| Display name | `Sync` in app configuration. Recheck the regenerated native plist and final archive; the App Store draft retains its separate descriptive name. |
| App version / native build | App config: `1.0.0`. EAS uses remote app-version sourcing and production `autoIncrement: true`; the actual archive/build number is not yet established. |
| Minimum supported OS | **iOS 15.1**, from the Podfile fallback and both native target build configurations. The native plist's `LSMinimumSystemVersion=12.0` is not the effective iOS deployment target. |
| Devices | iPhone and iPad: `supportsTablet=true`, native family `1,2`. iPad is included in the release surface and screenshot/layout validation. |
| Orientations | App config: portrait. Generated native plist: iPhone portrait and upside-down; iPad portrait, upside-down and both landscapes. `UIRequiresFullScreen=false`. Do not claim the shipped iPad binary is portrait-only without reconciling/verifying the final archive. |
| Theme/accessibility | Automatic system appearance. Native Liquid Glass is an iOS 26 enhancement; older systems/Reduce Transparency use a fallback. Do not list iOS 26 as the minimum requirement. |
| Background behavior | Session and music pause when leaving the foreground; return does not automatically resume. No background-timer/lock-screen workout guarantee. Native plist has no `UIBackgroundModes` declaration. |
| Networking / export declaration | ATS arbitrary loads are false; local networking is allowed. App config sets `usesNonExemptEncryption=false`. In-app web audio accepts HTTP/HTTPS addresses, but ATS may prevent insecure remote playback. No promise that every URL/media format works. |
| Local tools | Xcode **26.6** (`17F113`) is installed. Apple currently requires Xcode 26+ and an iOS/iPadOS 26+ SDK for uploads; EAS is pinned to the documented Xcode 26.6 image and Node 22.23.4; no cloud distribution archive has been verified. [Upload requirements](https://developer.apple.com/news/upcoming-requirements/). |

App configuration and native projects are separate inputs. Native projects are generated locally. The inspected EAS source copy excluded their working files under the current ignore rules; EAS may regenerate them. Existing tracked snapshots are not a substitute for inspecting the final archive. The final archive, not this table, establishes the shipped values. [Expo iOS build process](https://docs.expo.dev/build-reference/ios-builds/).

## Branding, permissions and privacy evidence

- The installed artwork sources are `assets/branding/icon.svg` and `assets/branding/splash.svg`; their PNGs are the opaque RGB 1024×1024 icon and 2048×2048 splash. The original timer design uses graphite `#151816`, lime work/rest arcs and custom vector lettering, with no stock photograph, external logo or font glyph. Actual launch layout still belongs to final native QA.
- Camera access is used only after choosing Camera for a profile photo. The revised camera purpose text states that use. The revised photo-library purpose text covers selecting a profile photo and audio/video for routine music. Files import remains independent of library permission.
- Microphone, Face ID and photo-library-add permission generation are explicitly disabled through the image-picker/AV/SecureStore/media-library plugin settings. Expo introspection confirmed the corresponding three usage-description keys are absent. This is verified generated configuration, not proof that the final distribution archive has already been built. [Expo permissions](https://docs.expo.dev/guides/permissions/).
- The app privacy manifest declares required API reasons for file timestamps, UserDefaults, disk space and boot time. Its empty collected-data array and false tracking flag are not a complete app privacy answer: account/cloud data is sent to Supabase and purchases to RevenueCat.
- Installed RevenueCat and Google Ads/UMP manifests declare purchase history and categories including diagnostics, approximate location, advertising interactions and device identifiers. Google Ads marks its device-ID category for tracking. These are SDK declarations, not proof of every runtime behavior in an ads-disabled build. Inspect the final aggregated archive report and actual configuration together; no ATT prompt does not establish no tracking or no collection. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Apple app privacy](https://developer.apple.com/app-store/app-privacy-details/).
- Original cue replacements, their reproducible standard-library generator and the preserved legacy URI mapping are documented in `alert-sounds.md`. The English coach recordings are unchanged; their account-plan/terms caveat remains in `coach-voice.md`.
- No HealthKit integration or medical advice is present. Do not make measured-heart-rate, calorie, clinical, Apple Health or Apple Watch claims.

The proposed category/purpose/linking/tracking answers and explicit owner review points are in `app-store-privacy.md`. That draft distinguishes account-linked RevenueCat data, reachable UMP privacy requests and dormant GMA declarations; no questionnaire answers have been submitted.

## Service and legal configuration

EAS is linked to project `2b38178c-60e8-4fe2-94da-f51dc14f4efc` under `feridunalacam`. Its account check showed the Free plan with zero builds used, and internal artifact downloads are private. Four public runtime variables were uploaded to each of development, preview and production. `eas.json` explicitly selects these environments, inherits canonical legal URLs and disables production/preview advertising and Spotify. The development profile preserves owner Spotify access and Google test inventory.

App Store Connect API access is approved. The Apple dashboard showed the active Sync EAS Submit App Manager key, and EAS confirmed vault storage and assignment to this app for Submit. Apple-side key validation through the CLI was not performed. This Submit setup does not establish distribution signing, a signed archive or an upload. `.env.local` remains ignored; it is not the source of remote job values. Backend/service-role, RevenueCat secret and webhook keys remain server-only. [Expo environment variables](https://docs.expo.dev/eas/environment-variables/).

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

Before submission, record the final archive/build number, signed device-family/orientation values, actual privacy report, current store metadata/age-rating answers, required iPhone/iPad screenshots and reviewer access. These remain open until final verification. Final iPad visual QA, distribution signing, store submission and the deferred merchant settings remain incomplete. Current-source exports and the final Release native Copy image/transparent clipboard checks pass.

## Latest native ads evidence

On the isolated iOS 26.1 guest QA simulator, Google's real test interstitial opened before Start. Native Close released a five-second session at its full duration and it completed. A subsequent Start inside the cooldown proceeded directly. After eligibility and cooldown, the ended-session Finish action opened a real test interstitial; native Close returned to Ready with no automatic session start. These are Debug/current-JavaScript checks, not signed distribution, regional consent, paid account, music or physical-device evidence.

## Final build and handoff status

The final reviewed source passes 496 automated tests, both platform JavaScript exports, and a **Release iOS simulator build with normal simulator signing** with Xcode 26.6 / SDK 26.5, iOS 15.1 minimum, iPhone+iPad support, display name Sync and the intended privacy-purpose removals. This is not a distribution archive or App Store upload. The built simulator app is approximately 59 MB; no launch-time or physical-device performance number has been established. Its bundled privacy manifests were inventoried; see the privacy draft.

Native Training reorder and routine/history deletion-cancel paths passed on the isolated iPhone QA device. Native share-preview generation exposed a Copy image defect: the installed ViewShot component ignores capture-call options and uses its options prop. The fixed source sets PNG/data-uri on both captures and sends validated bare base64 to Clipboard. Regression tests now run the actual installed ViewShot component with only its native bridge stubbed. **The final Release native Copy image and transparent clipboard checks now pass. Final iPad visual QA remains pending.** A fresh isolated iPad QA device was created and an earlier simulator Release build installed/launched; no successful final iPad visual check is claimed.

No EAS build job, paid service, TestFlight upload, App Review submission or public app release was performed. App Store Connect API access is approved and the active Sync EAS Submit App Manager key was created. EAS confirmed vault storage and assignment to this app for Submit; Apple-side CLI key validation was not performed, and the Apple Distribution certificate and app-specific App Store profile have been created. The certificate matches the locally prepared key; profile download and EAS build-credential assignment are pending. Banking/tax/seller steps remain deferred by the owner, and real Apple purchase/renewal/refund/restore-to-Pro validation remains open. A public-source-only audit was subsequently approved after verifying that its isolated lockfile matched the already public GitHub commit. Compatible patches removed the old navigation decoder dependency and updated six package families without changing Expo/RN/native versions. Current audit results are 21 findings, including 2 high records in Node build tooling and no critical findings; this is not a clean audit. See [dependency security](dependency-security.md) and the [automatic EAS guard](release-preflight.md) for exact scope and remaining records.
