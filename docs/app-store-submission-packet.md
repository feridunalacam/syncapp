# App Store submission packet — English draft

Updated on 12 November 2026 for delivered Store build **1.0.0 (4)**, source `083a67e`. EAS Build `2fec44ea…` and Submit `a3627151…` finished; the exact IPA passed **20/20** package/signature/profile checks and **9/9** configuration/permission checks. Apple processing is **VALID**, not expired; the existing owner-only **Sync Internal QA** group visibly shows build 4 **Testing**, one tester and two builds. The owner reports installation and successful physical native Apple sign-in, with Pro prices still unavailable. This is user feedback, not independently captured device/session or purchase evidence. No external beta review, App Review or public release is recorded. This packet remains a draft and includes no credentials. See [build 4 evidence](ios-build-1.0.0-4-evidence.json).

## Store fields

| Field | Proposed value / status |
| --- | --- |
| Name | Sync - Interval Timer — existing app draft name; final App Review version not selected by this packet. |
| Subtitle | Work, rest, music and routines — 30 characters; saved value not independently established by the asset receipt. |
| Promotional text | Build your own work and rest rounds, add local audio, and keep your training routines and session history in one place. — 119 characters, saved draft receipt. |
| Keywords | hiit,tabata,workout,rounds,training,countdown,rest,boxing,routines,fitness — 74 characters, saved draft receipt. |
| Copyright | **2026 Feridun Alaçam** — proposed; owner to confirm the rights-holder wording. |
| Primary category | **Health & Fitness** — proposed, not a confirmed saved store value. Work/rest training, workout routines and exercise/session history are the app's main purpose. This fits the current product better than positioning it as a generic utility timer. No medical, measured-health, HealthKit or Apple Watch capability is claimed. |
| Secondary category | No proposal; leave unselected unless the final listing needs one. |
| Version / delivered build | **1.0.0 (4)**, source `083a67e`, signed Store IPA uploaded, processed and assigned to owner-only internal testing. Selection for an App Review version is not established. The screenshot/text receipt belongs to the iOS **1.0** draft. |
| Privacy Policy URL | https://sync-app-support.feridun.chatgpt.site/privacy |
| Support URL | https://sync-app-support.feridun.chatgpt.site/ |
| Marketing URL | https://sync-app-support.feridun.chatgpt.site/ |
| Terms URL | https://sync-app-support.feridun.chatgpt.site/terms |
| Description | The saved asset-task receipt contains an **845-character core-only description**, with no Pro claim. The longer [proposed description](app-store-release.md#proposed-english-metadata), including its conditional Pro paragraph, is not that saved receipt. |
| App Review contact / sign-in fields | No verified saved reviewer contact or dedicated reviewer account is supplied by this packet. Enter usable authorized details separately after review access is validated. |

Promotional text, description, keywords and eight dark screenshots were saved in the English (U.S.) draft by the asset task; other fields were left as found. See [the saved receipt and capture boundary](app-store-dark-assets.md#app-store-receipt). This is not evidence that every required App Review field is complete.

The current candidate source disables Spotify account/playback, native Apple Music connection/library/timed playback, and automatic web media extraction/download/URL-add in production/preview. Owner development remains behind explicit hard development guards. Ordinary external service/library links, Files import and existing saved media metadata remain; these links are not connected players. Advertising stays off. Delivered Store4 predates the Apple Music and web acquisition guards and is unchanged. Exclude unavailable playback/acquisition claims from candidate metadata/screenshots. The [music release policy](music-release-policy.md) records the Apple terms and permissions boundary. Do not advertise background workout execution: leaving the foreground pauses the session and music, and returning requires a manual resume. Discover contains samples and content saved on the device, rather than a public online community.

## App Review notes — core block to copy

The following block targets the newly guarded candidate's guest/core flow, not unchanged Store4. Copy it only after confirming that these steps match the selected distribution build. The separate account/Pro block below has additional readiness conditions.

```text
Sync is an interval-training timer for iPhone and iPad. The timer, routine editor, local routines and local session history can be used without an account or subscription.

To try the core experience:
1. Open the Training tab. On a fresh installation, choose Interval Starter, Quick Burst or Endurance and tap Open on its card. This opens the selected routine in Timer.
2. Tap Start to begin the session. Work and rest phases advance automatically. Use Pause and Resume to control the session.
3. To create a routine, open Training, tap the + button, enter a name, adjust the work/rest rounds and tap Save. Tap a saved routine's name or edit icon to edit it.
4. After completing a session, open Training > Activity to view its local history.

The guest timer and locally saved routines/history work offline. Imported audio files remain on the device where they were added. Find audio opens external sound-library websites; choose an authorized file with Files to import it. Leaving the app pauses the session and music. Return to Timer and tap Resume to continue.

Discover contains sample routines and content saved locally on the device. It is not a public social feed. Camera or library access is requested only when the user chooses a feature that needs it; neither permission is required to try the timer.

Imported Files audio can be used without a music-service account. Music-service links open external destinations; they do not import libraries or control interval playback. Native Apple Music, Spotify account/playback and embedded web media extraction/download are disabled in this release.

Privacy Policy: https://sync-app-support.feridun.chatgpt.site/privacy
Support: https://sync-app-support.feridun.chatgpt.site/
```

## App Review notes — account/subscription draft, not ready to submit

**Current blockers:** a dedicated reviewer account has not been supplied or verified. The physical TestFlight 4 missing-price report predates the successful standalone native catalog/offerings probe; physical Store4 pricing after that probe remains unverified. Its production backend rejects sandbox receipts, so a review purchase cannot currently establish server-backed Pro. The separate review lane now has prepared, validated **source**, but no live resources/deployment/reviewer setup and no Store4 inclusion. Two approval requests for live review resources/deployment/account/notification changes remain pending. The later Apple Business check shows all listed statuses **Active**; that and source/catalog tests do not establish a successful purchase.

The following text describes where controls are located without promising working prices or Pro access. It is a preparation draft, not a substitute for resolving those blockers. Verify the final access path, then supply working reviewer credentials in App Store Connect's separate sign-in fields; never use the owner's login or invent an entitlement. Apple asks for active demo access to account features and a reviewable purchase flow. [Complete-review guidance](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/)

```text
Account features are available from Profile > Sign in or create account. Email/password, Google and native Apple sign-in are included; sign-in and cloud features require an internet connection. The timer and local routines/history remain available as a guest.

On first account use, Sync checks which account records to open before showing the editor. If that check fails, Retry or Use without an account is offered. A previously validated account scope can open its saved local records offline; it does not grant cloud or paid access.

Subscription controls are under Profile > Explore Sync Pro, or Sync Pro for an active membership. The account screen also provides Manage Sync Pro. The subscription screen includes Restore purchases, Refresh access and Manage subscription.

Current validation status: real Monthly/Annual products and the default offering loaded in a separate native catalog probe. Prices on the selected physical client after that probe and a complete review purchase-to-Pro path have not been verified. Cloud backup requires server-verified Pro. Imported audio files and profile photos stay on their original device. These paid features must be made reviewable before this draft is submitted.

To find account deletion, open Profile > Your account > Delete account…. The screen requires explicit confirmation and may request a fresh sign-in. Deleting a Sync account does not cancel its App Store subscription; Manage subscription opens the subscription-management path.

Terms of Use: https://sync-app-support.feridun.chatgpt.site/terms
Privacy Policy: https://sync-app-support.feridun.chatgpt.site/privacy
```

## Internal guest/offline walkthrough

Use a disposable QA installation with no personal account or imported owner data. These steps are a verification checklist, not a record that every check has passed on the final distribution binary.

Recorded evidence is scoped by native composition. Pre-pin `f1bfac6` / Worklets **0.6.1** iPhone/iPad simulators completed genuine four-minute/three-round sessions and Activity history; iPad background pause/landscape/Finish and Copy image/transparent clipboard on both devices passed. Fresh CNG Worklets **0.5.1** iPad QA reopened the saved five-second routine, completed its real countdown, finished, inspected Activity detail and passed Copy image/Copy transparent sticker. Its installed executable/JS matched the preserved CNG reference. Post-upload Profile source `a6099d3` passed a separate signed local Release build and native Dark appearance switch activation **1 → 0 → 1**, with **496/496** source tests. Later native music/auth source `585b64b` has its own iPhone/iPad simulator evidence; delivered Store4 uses runtime overlay `d918565`, with **576/576** tests and both Hermes exports. The owner's physical Store4 Apple sign-in report does not establish the full guest/offline walkthrough, subscribed Apple Music playback or a full VoiceOver audit. Synthetic local QA and historical build 2 evidence are not relabelled as Store4 runtime checks. See [current release evidence](app-store-release.md#musicauth-source-delivered-to-internal-testflight).

- [x] Fresh local CNG Worklets 0.5.1 guest launch, editor and Duration → Apply 5 seconds observed.
- [x] Fresh local CNG iPad: saved short routine reopened, completed normally, finished, Activity detail inspected and both clipboard image actions passed.
- [x] Post-upload `a6099d3` local Release: native iPad theme switch individually exposed and activated in both directions; earlier guest data retained after install.

- [ ] Launch the final Release build as a guest. Confirm Training shows the three intended defaults on a genuinely new installation; do not reset an existing user's saved routines to obtain them.
- [ ] Enable offline mode, open a saved routine in Timer and run work/rest phases. Check Pause/Resume and leaving/returning to the app; returning must leave the session paused.
- [ ] Create and save a short routine through the UI, reopen it and confirm its actual timing. Complete it normally, dismiss its summary and inspect Training > Activity. Do not insert or edit storage to fabricate history.
- [ ] Relaunch offline and confirm that the guest's saved routine and real session history remain available.
- [ ] If local audio is shown, use an authorized file already available on the device and confirm the selected file works offline. Browser streams and cloud-only Files downloads are not evidence of offline media support.
- [ ] Confirm Discover labels its sample/local content accurately, and production screens expose no Spotify connection or serving ad placements.

## Internal account, Pro and submission gates

The real Apple purchase/renewal/refund/restore-to-Pro lifecycle **remains unverified**. Native SDK integration, automated tests, a Test Store result or a canonical Free response do not establish it. The current production backend rejects sandbox receipts; an Apple review/sandbox transaction cannot be claimed as a successful server-backed Pro unlock under that configuration. A usable, authorized reviewer-access plan remains required before submitting paid functionality. Do not weaken production filtering or create manual Pro grants to fill this gap. Detailed evidence boundaries are in [subscription-validation.md](subscription-validation.md).

- [ ] Confirm final-binary email sign-in, confirmation/recovery, session relaunch and sign-out using an authorized disposable account. Supply reviewer access separately only after it is verified.
- [ ] Confirm real App Store Monthly/Annual products load with the selected distribution build and locale. Draft identifiers are `com.feridun.syncapp.pro.monthly` and `com.feridun.syncapp.pro.yearly`; their existence is not purchase evidence.
- [ ] Validate purchase, user cancellation, failure, pending server verification and recovery in an authorized configuration. Check real Apple renewal/expiry/refund delivery and the resulting canonical entitlement before marking those behaviors complete.
- [ ] Validate Restore purchases, including transfer to another authorized account: destination gains Pro, former account loses Pro, and private backups stay separate.
- [ ] Validate verified-Pro backup/sync across two devices and the restore/conflict UI. Local media must remain local; do not promise media-file backup.
- [ ] Validate deletion only on an authorized disposable account, including reauthentication and remote completion. A timeout is not confirmed deletion; account deletion does not cancel billing.
- [x] Record the later status-only Apple Business recheck: Paid Apps Agreement, Free Apps Agreement, the one bank-account row, U.S. Foreign Status, W-8BEN and Digital Services Act all **Active**. No private values were exported. The earlier same-day Pending User Info/no-bank/Missing Tax Info receipt remains historical in [build 4 evidence](ios-build-1.0.0-4-evidence.json).
- [ ] Resolve actual product/price availability, both subscription review screenshots/notes and usable App Review access. Active commercial statuses do not complete those checks.
- [x] Verify distribution certificate/profile, strict IPA signature, Store build **1.0.0 (4)** and upload. The same existing certificate/profile binding was retained; no Admin role or additional API key was used.
- [x] Configure owner-only internal tester access: **Sync Internal QA** visibly shows build **1.0.0 (4)** **Testing**, with one existing tester and two builds.
- [x] Record owner-reported physical Store4 installation/native Apple sign-in success. This remains user feedback; broad final-binary runtime and paid lifecycle are not independently verified. No external beta review is recorded.
- [x] Validate the prepared review-lane source: final **696/696** tests, zero failures/skips, including **17** actual SQL tests; both Hermes exports pass with the **149-file** runtime manifest stable. This is not live deployment, a new delivered client or real two-connection concurrency proof. [Offline source evidence](review-billing-offline-evidence.json)
- [x] Independently review candidate Apple Music/web acquisition release guards and account-scope readiness: unknown scopes cannot mount editable consumers; trusted cached scopes remain local-only offline. Fresh post-guard local Simulator Release compile/signature checks pass with synthetic fixtures; no new provider permission, installed/UI or distribution result is established.
- [ ] Resolve the two pending approval requests before live review resources/deployment/reviewer-account/reservation/notification actions. Source validation does not authorize or complete these actions.
- [ ] Select the intended processed build for App Review only after the reviewer-access, paid-service, merchant, screenshot, privacy and age-rating gates are resolved. Live/in-review/pending-release states are currently empty.

The earlier cloud build passed Doctor **18/18**, Prebuild, pods, bundling and Fastlane after the missing-Podfile CNG packaging fix and direct Worklets 0.5.1 correction. Store4 build/signing/upload are separately complete; final native runtime/capture coverage and real paid/Pro validation remain separate gates. The work used the Free plan, with no paid-plan activation or new Supabase project. The prepared, validated review-lane source does not change delivered Store4 behavior or establish a deployed backend path.

## Screenshot capture manifest

The **saved English (U.S.) listing draft** has eight dark screenshots under `artifacts/app-store/2026-11-12/`: four iPhone **1206 × 2622** and four iPad **2064 × 2752**, ordered Ready → active Timer → Training → routine editor. The receipt records **4 of 10** in each slot; see [dark-assets receipt](app-store-dark-assets.md#app-store-receipt). Independent read-only verification passed **16/16** raw/output SHA256 checks and **8/8** RGB/no-transparency, dimensions, decoded-pixel and ICC-equality checks. No images were changed by that verification.

These saved shots are still **earlier-binary draft assets**: the iPhone executable's exact source was not independently established and its Worklets evidence is **0.6.1**; the iPad uses `da7339f` local CNG Release (1), Worklets **0.5.1**, synthetic public configuration. Neither set is a Store4 or newly guarded candidate capture. Compare those four actual scenes per device with the selected final guarded Release before approval, replacing only changed scenes. Home/routine/music changes and the source guards mean ancestry alone does not establish visual equivalence. No Activity, cue, Profile or Pro marketing screenshot is mandatory merely because it appears in the optional plan below.

The following older candidate groups remain separate historical evidence; they are not the current saved ASC receipt.

The persistent candidate root is `/Users/feridunalacam/.codex/visualizations/2026/11/11/01a1cb22-5d7e-7c32-9bd0-bcdc3c97010f/app-store-candidates/`. Its original group contains **13 unchanged raw PNGs** (six iPhone, seven iPad) and **13 pixel-identical RGB derivatives** under `appstore/`, with provenance and technical verification in its manifest/README. The raw images are fully opaque RGBA; the derived RGB PNGs remove the alpha channel without resizing, cropping or changing pixels/color space. These are candidates, not a final screenshot-completeness claim.

The original 13 are source **`f1bfac6`**, Simulator Release, OS 26.1, native Worklets **0.6.1**, before the 0.5.1 pin. They include Ready/active/Training/Activity/share, an iPhone editor and iPad landscape pause/completion. Their four-minute/three-round history was completed through the UI; the group was not relabeled as current-build evidence.

The separate `current-cng-da7339f/` group now contains **three raw plus three verified RGB iPad Ready/editor/cue images**, captured at 12:32–12:33 on OS 26.1, local CNG Simulator Release **(1)**, Worklets **0.5.1**, using synthetic public configuration. Its raw alpha is fully opaque and RGB/ICC/render equality checks passed. The cue image shows its real scroll position with lower controls below the fold. This group includes no current-CNG iPhone, active timer, Training, Activity or share captures and does not independently prove the signed Store **(2)** runtime. Final capture coverage remains pending.

The table below describes the four saved scenes plus two **optional** additions. Capture/revalidate the actual final Release UI on both device families, recording exact build/commit, device, OS, orientation, dimensions, time and raw PNG path. Confirm accepted App Store slots at upload. Apple's current required-size overview specifies Dynamic Island medium and 13-inch iPad; the saved dimensions match those slots. The reference also has conditional large-display rows, so final ASC validation remains authoritative for any additional required slot. [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

Suggested locale/file prefix: `en-US`. Keep an untouched native capture as the source. Any later caption artwork must accurately represent that capture. Do not scale iPhone content to impersonate an iPad screenshot, show personal information, or introduce fake media/history. Use a clean guest session; create any needed history by actually completing the displayed routine.

| Shot | iPhone filename | iPad filename | Real screen/setup | Proposed English caption |
| --- | --- | --- | --- | --- |
| 01 | `en-US_iphone_01-timer-ready.png` | `en-US_ipad_01-timer-ready.png` | Timer Ready with Interval Starter selected; real work/rest durations visible. | Your work and rest timer |
| 02 | `en-US_iphone_02-timer-active.png` | `en-US_ipad_02-timer-active.png` | A real running work interval, captured while foregrounded. | Follow every interval |
| 03 | `en-US_iphone_03-training.png` | `en-US_ipad_03-training.png` | Training library with the intended defaults and Open controls. | Keep your routines together |
| 04 | `en-US_iphone_04-routine-editor.png` | `en-US_ipad_04-routine-editor.png` | Routine editor showing actual named work/rest rounds; no unavailable music source. | Customize your rounds |
| 05, optional | `en-US_iphone_05-cues.png` | `en-US_ipad_05-cues.png` | Expanded routine cue settings, showing actual supported controls. | Choose countdown and sound cues |
| 06, optional | `en-US_iphone_06-activity.png` | `en-US_ipad_06-activity.png` | Training > Activity after a genuinely completed session; truthful recorded duration. | Review your sessions |

For iPad, retain separate internal QA captures in the supported orientations/multitasking layouts. The actual Store IPA supports all four iPad orientations, family 1,2 and `UIRequiresFullScreen=false`; iPhone supports portrait/upside-down. Check safe areas, tab bar, sheets, editor controls, Activity and share previews for clipping or unreachable controls. Pre-pin landscape checks passed, but final 0.5.1 coverage remains separate. These extra QA captures are not a claim that every orientation must be uploaded as store marketing.

An optional Discover screenshot must show its sample/local wording. An optional account/Pro screenshot requires verified reviewer access and real available plans; omit it while those gates are open. Do not market Spotify, live social publishing, fabricated Pro status or an unverified billing result.

## Privacy and age-rating decisions still to resolve

Use [app-store-privacy.md](app-store-privacy.md) as the source matrix. Do not copy the app manifest's empty collected-data array into a “Data Not Collected” answer. Finalize the questionnaire with the actual submitted configuration, partner behavior, public policy and aggregated distribution-archive report together.

| Decision | Current draft / evidence | Still needed before final answers |
| --- | --- | --- |
| Account and purchase identity | Email, Google-retained Name, UUID/User ID and purchase history are account-linked. Name has proposed App Functionality; RevenueCat purchase reporting has proposed App Functionality + Analytics purposes. | Confirm enabled partner integrations and the submitted build's actual paths; retain the linked classification where UUID joins to the account. Google profile-image URL metadata is not evidence of photo-binary collection. |
| Pro content/history | Routine/post/bio/URL metadata can be backed up. Exercise/session history has a proposed Fitness classification; dedicated social links may be Other User Contact Info. | Confirm the Fitness/social-link categories and their purposes; distinguish metadata from local audio/photo bytes. |
| Server and email logs | Supabase/Auth/gateway/email services may retain request events and metadata. | Establish actual IP/device/request fields, purposes, retention and access. No zero-log claim is supported. |
| UMP and dormant Google Ads | Production serving ads are off, but Profile > Ad privacy choices can still request UMP information. Installed manifests include collected categories and GMA tracking flags. | Resolve this reachable UMP path and actual SDK behavior. Neither absent ATT nor ads-off configuration settles all collection/tracking answers. |
| Browser media | Current candidate production/preview excludes the embedded browser/scanner and new URL acquisition. External library links and Files import remain; existing saved URL metadata is preserved and may enter Pro backup. Store4 still has the earlier browser behavior. | Assess the selected binary's saved-URL playback, destination/provider traffic and cloud metadata; do not infer zero collection or blanket content permission from the guard. |
| Local files/photos | Imported audio/video and profile photos are currently local; no media bytes enter the backup allowlist. | Recheck the final binary and policy before excluding uploaded media categories; permission alone is not collection evidence. |
| Age rating | Current guarded candidate has no embedded arbitrary web navigation; its library/service links open externally. Store4 retains the earlier open-web browser. Discover is samples/local saved content rather than public UGC; production ads are disabled. | Use the selected candidate's actual capabilities. The current source-based Unrestricted Web Access suggestion is No; no questionnaire or calculated rating has been entered. |
| Export/privacy archive | Actual Store IPA has `ITSAppUsesNonExemptEncryption=false`, expected permission removals and **15 bundled privacy manifests** whose declarations match the draft matrix. | The manifest inventory is not an official Xcode aggregated report or final questionnaire. Resolve runtime/partner behavior and the official report before finalizing disclosures. |

### Age-rating preparation — not entered in App Store Connect

For the **current guarded candidate source**, draft **Unrestricted Web Access: No**: production/preview does not load the only embedded WebView/scanner, exposes four ordinary external library links and Files import, and has no in-app arbitrary-address field. Apple's definition concerns free navigation to webpages within the app. This is a source-based inference that must match the selected final binary; it is not an entered questionnaire or calculated age band. [Apple age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)

**Historical Store4 boundary:** its Browser audio accepts arbitrary HTTP/HTTPS addresses in an embedded WebView, so the earlier source draft was **Yes**, corresponding to the **16+** global band on OS 26 and later / **17+** on earlier versions before other/regional answers. Store4 is unchanged; that historical inference was never an entered or calculated ASC rating.

| Questionnaire capability | Preparation answer / boundary |
| --- | --- |
| Unrestricted web access | **No for the current guarded candidate**, subject to final-binary confirmation; **Yes for historical Store4's embedded browser**. External destinations alone are not represented as embedded navigation. |
| Public user-generated content / social media / messaging | **No** for the inspected Sync flows: Discover is sample/device-local content, with no broad public distribution or in-app messaging. External websites do not become Sync's public social feed. |
| Advertising | **No serving advertising in submitted production configuration**; keep this aligned with the final binary. UMP privacy requests still need separate privacy disclosure assessment. |
| Parental controls / age assurance | None evidenced in the inspected implementation; do not claim either capability. |
| Health/wellness versus medical/treatment | Review the actual exercise samples/recommendations for Health or Wellness Topics. No medical advice, diagnosis or treatment feature is evidenced; a timer's fitness category alone is not a medical-content answer. |

Other content-frequency answers and all regional/calculated results still require final owner review. No questionnaire, privacy label, App Review contact/login, product review asset or release setting was entered or published by this preparation.

Record final decisions and supporting evidence before entry; this documentation update changes no App Store answers. The build upload/Apple processing record and owner-only internal invitation above are distinct from App Review or public release. No account creation, purchase, production grant or backend creation was performed for this packet.
