# App Store submission packet — English draft

**Current internal delivery: Store 1.0.0 (6), source `18c41c0`, Apple VALID / existing-group IN_BETA_TESTING (1 tester /4 builds), verified19:34:26 UTC.**30/30 IPA and8/8 group checks pass, one direct Apple upload/no EAS Submit. Physical6 recovery/fresh credentials/purchase remain unverified.

**Historical Store5 delivery: Store 1.0.0 (5), source `577e1ff`.** Official altool validation/direct upload of the same verified IPA passed after EAS job `2b268d9e…` was canceled. Apple is **VALID**; existing Sync Internal QA shows build 5 **Testing**, **1 tester / 3 builds**, 90 days. Physical build 5 price feedback is pending; no paid lifecycle, external beta review, App Review or public release is established. [Terminal delivery evidence](review-billing-live-setup-evidence.json)

**Historical Store4 receipt, 12 November 2026:** delivered Store build **1.0.0 (4)**, source `083a67e`. EAS Build `2fec44ea…` and Submit `a3627151…` finished; the exact IPA passed **20/20** package/signature/profile checks and **9/9** configuration/permission checks. Apple processing is **VALID**, not expired; the existing owner-only **Sync Internal QA** group visibly shows build 4 **Testing**, one tester and two builds. The owner reports installation and successful physical native Apple sign-in, with Pro prices still unavailable. This is user feedback, not independently captured device/session or purchase evidence. No external beta review, App Review or public release is recorded. This packet remains a draft and includes no credentials. See [build 4 evidence](ios-build-1.0.0-4-evidence.json).

## Store fields

| Field | Proposed value / status |
| --- | --- |
| Name | Sync - Interval Timer — existing app draft name; final App Review version not selected by this packet. |
| Subtitle | **Work, rest, music and routines** — 30 characters, en-US; saved via owner-approved PATCH200 and verified by5/5 readback at18:32:04 UTC. The earlier asset receipt did not establish it. |
| Promotional text | Build your own work and rest rounds, add local audio, and keep your training routines and session history in one place. — 119 characters, saved draft receipt. |
| Keywords | hiit,tabata,workout,rounds,training,countdown,rest,boxing,routines,fitness — 74 characters, saved draft receipt. |
| Copyright | **2026 Feridun Alaçam** — proposed; owner to confirm the rights-holder wording. |
| Primary category | **Health & Fitness** (`HEALTH_AND_FITNESS`) — saved by owner-approved PATCH200; five readback checks passed at18:32:04 UTC, with secondary/other snapshot fields unchanged. Work/rest training, workout routines and exercise/session history are the app's main purpose. This fits the current product better than positioning it as a generic utility timer. No medical, measured-health, HealthKit or Apple Watch capability is claimed. |
| Secondary category | No proposal; leave unselected unless the final listing needs one. |
| Version / delivered build | **1.0.0 (6)**, source `18c41c0`, one direct Apple upload/no EAS Submit, VALID and IN_BETA_TESTING in the existing owner-only group (1 tester/4 builds). Selection for an App Review version is not established. The screenshot/text receipt belongs to the iOS **1.0** draft. |
| Privacy Policy URL | https://sync-app-support.feridun.chatgpt.site/privacy |
| Support URL | https://sync-app-support.feridun.chatgpt.site/ |
| Marketing URL | https://sync-app-support.feridun.chatgpt.site/ |
| Terms URL | https://sync-app-support.feridun.chatgpt.site/terms |
| Description | The saved asset-task receipt contains an **845-character core-only description**, with no Pro claim. The longer [proposed description](app-store-release.md#proposed-english-metadata), including its conditional Pro paragraph, is not that saved receipt. |
| App Review contact / sign-in fields | Dedicated accounts A/B are confirmed and reserved for 30 days; the owner approved sharing their credentials with Apple Review. Their passwords/addresses are excluded from this packet. Fresh credentials are not ready for Apple fields while B recovery/password handoff is blocked. Earlier A/B login passed in the owned local QA app; selected-distribution reviewer access/contact/credential-field entry remains unverified. Enter usable authorized details separately after validation. |

Promotional text, description, keywords and eight dark screenshots were saved by the earlier asset task. The subsequently owner-approved primary category and en-US subtitle are now saved; other localization/app-info fields and secondary category remained unchanged. See [the saved receipt and capture boundary](app-store-dark-assets.md#app-store-receipt). This is not evidence that every required App Review field is complete.

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

**Current blockers:** accounts **A/B** are confirmed/reserved and Apple Review sharing is approved, but fresh usable credentials are not ready: the physical B reset link fails and Recovery V2 source/119 targeted tests pass, but full 721/Hermes/archive 150 now pass, while physical Store6 recovery validation/fresh credentials remain pending. A's owned local actual-public QA login, guest 3 / A 0 routine separation, annual **$18/year**, monthly **$2.99/month** and error-free Refresh passed; hosted review-only inactive Free state is consistent with the deployed sync path, without raw upstream response inspection. No paid lease/Pro grant or backup exists. The review bearer webhook TEST returned **200 / received=true**; the saved restore policy is **Transfer to new App User ID**, different sandbox behavior off. Neither is a purchase/restore result. B also passed login/both prices/Refresh, with generation1 inactive Free state and A unchanged; no active review grant/backup or production changes were observed. After owner reauthentication, only the Apple sandbox URL was saved and exact readback matched while production stayed unchanged; actual event delivery is unverified. Build5 finished and passed **24/24** exact IPA checks. The old EAS job `2b268d9e…` was canceled, and official altool validation/direct upload of the same IPA succeeded. Apple VALID and existing-group build 5 Testing (1 tester/3 builds, 90 days) are verified. Physical build 5 price feedback, selected-distribution reviewer access/credential entry and purchase/restore-to-Pro remain unverified. Delivered Store4 is unchanged and lacks the new client path; its physical missing-price report predates the separate successful production catalog probe. All listed Apple Business statuses are Active, which does not establish a purchase. [Live setup evidence](review-billing-live-setup-evidence.json)

The following text describes where controls are located without promising working prices or Pro access. It is a preparation draft, not a substitute for resolving those blockers. Verify the final access path, then supply working reviewer credentials in App Store Connect's separate sign-in fields; never use the owner's login or invent an entitlement. Apple asks for active demo access to account features and a reviewable purchase flow. [Complete-review guidance](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/)

```text
Account features are available from Profile > Sign in or create account. Email/password, Google and native Apple sign-in are included; sign-in and cloud features require an internet connection. The timer and local routines/history remain available as a guest.

On first account use, Sync checks which account records to open before showing the editor. If that check fails, Retry or Use without an account is offered. A previously validated account scope can open its saved local records offline; it does not grant cloud or paid access.

Subscription controls are under Profile > Explore Sync Pro, or Sync Pro for an active membership. The account screen also provides Manage Sync Pro. The subscription screen includes Restore purchases, Refresh access and Manage subscription.

Current validation status: a separate native production catalog probe fetched real products/default offerings; the later local actual-public review QA app signed in A and displayed annual $18/year and monthly $2.99/month. Refresh access showed no error and review-only inactive Free state is consistent with the deployed sync path. This is not the selected distribution client or a completed purchase-to-Pro path. Cloud backup requires server-verified Pro. Imported audio files and profile photos stay on their original device. These paid features must be made reviewable before this draft is submitted.

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

The real Apple purchase/renewal/refund/restore-to-Pro lifecycle **remains unverified**. Native SDK integration, automated tests, a Test Store result or a canonical Free response do not establish it. Production-lane accounts still reject sandbox receipts. The approved separate review lane is partially deployed, but no Apple review/sandbox purchase-to-Pro result has yet been observed. A usable, authorized reviewer-access plan remains required before submitting paid functionality. Do not weaken production filtering or create manual Pro grants to fill this gap. Detailed evidence boundaries are in [subscription-validation.md](subscription-validation.md).

- [ ] Confirm final-binary email sign-in, confirmation/recovery, session relaunch and sign-out using an authorized disposable account. Supply reviewer access separately only after it is verified.
- [ ] Confirm real App Store Monthly/Annual products load with the selected distribution build and locale. Draft identifiers are `com.feridun.syncapp.pro.monthly` and `com.feridun.syncapp.pro.yearly`; their existence is not purchase evidence.
- [ ] Validate purchase, user cancellation, failure, pending server verification and recovery in an authorized configuration. Check real Apple renewal/expiry/refund delivery and the resulting canonical entitlement before marking those behaviors complete.
- [ ] Validate Restore purchases, including transfer to another authorized account: destination gains Pro, former account loses Pro, and private backups stay separate.
- [ ] Validate verified-Pro backup/sync across two devices and the restore/conflict UI. Local media must remain local; do not promise media-file backup.
- [ ] Validate deletion only on an authorized disposable account, including reauthentication and remote completion. A timeout is not confirmed deletion; account deletion does not cancel billing.
- [x] Record the later status-only Apple Business recheck: Paid Apps Agreement, Free Apps Agreement, the one bank-account row, U.S. Foreign Status, W-8BEN and Digital Services Act all **Active**. No private values were exported. The earlier same-day Pending User Info/no-bank/Missing Tax Info receipt remains historical in [build 4 evidence](ios-build-1.0.0-4-evidence.json).
- [x] Upload/save both product-review screenshots (**1206 × 2622**) and notes in App Store Connect. Root verified SKU/price/CTA, image source, exact notes, no progress and disabled Save. Products remain **Prepare For Submission**, Add For Review not clicked. Only this asset gate is complete; actual-public-config ad-hoc Simulator, same Store5-generation 149-file source, not physical TestFlight or purchase proof.
- [ ] Verify product/price availability on the selected distribution client and usable App Review access. Both subscription review screenshots/notes are saved; neither those assets nor Active commercial statuses establish purchase readiness.
- [x] Verify distribution certificate/profile, strict IPA signature, Store build **1.0.0 (4)** and upload. The same existing certificate/profile binding was retained; no Admin role or additional API key was used.
- [x] Configure owner-only internal tester access: **Sync Internal QA** visibly shows build **1.0.0 (4)** **Testing**, with one existing tester and two builds.
- [x] Record owner-reported physical Store4 installation/native Apple sign-in success. This remains user feedback; broad final-binary runtime and paid lifecycle are not independently verified. No external beta review is recorded.
- [x] Validate the historical Store5-generation review source: **696/696** tests, zero failures/skips, including **17** actual SQL tests; both Hermes exports pass with the **149-file** runtime manifest stable. This is not live deployment, a new delivered client or real two-connection concurrency proof. [Offline source evidence](review-billing-offline-evidence.json)
- [x] Independently review candidate Apple Music/web acquisition release guards and account-scope readiness: unknown scopes cannot mount editable consumers; trusted cached scopes remain local-only offline. Fresh post-guard local Simulator Release compile/signature checks pass with synthetic fixtures; the later local A/Auth/prices QA is separate from that original compile-only receipt, and no new provider permission or distribution result is established.
- [x] Record explicit owner approval and partial live provisioning: review RevenueCat project/app, valid reused IAP credentials, protected server/public EAS configuration, public policy v7, migration/functions and confirmed 30-day A/B reservations. No Pro grant. [Live setup evidence](review-billing-live-setup-evidence.json)
- [x] Configure the current review `default` offering (**Sync Pro**) with annual then monthly packages, both real products attached to `sync_pro`, review iOS app only and no Test Store mapping. This is not a native offering-fetch or purchase result.
- [x] Record sandbox-only/review-App-Store-app-only all-events bearer webhook TEST200, saved Transfer policy, local A/Auth/prices/guest 3 / A 0 routine separation and read-only inactive Free-state consistency. These are not purchase, paid lease, backup or lifecycle results.
- [x] Save/read back only the Apple sandbox notification URL, preserving production and recording no URL values. Verify B local login/prices/completed Refresh and separate inactive Free state. Inspect finished Store build 5: **24/24** exact IPA checks, actual public runtime and no synthetic fixtures.
- [x] Validate the exact Store5 IPA, cancel the old EAS job and complete official Apple direct upload/VALID processing. Existing Sync Internal QA shows build 5 **Testing**, **1 tester / 3 builds**, 90 days. This is not an EAS job FINISHED result.
- [x] Record owner-reported correct physical build5 monthly/yearly prices; no independent capture or purchase is established.
- [ ] Resolve B recovery and fresh credential handoff, then verify selected-client reviewer login/credential entry, actual Apple notification delivery and purchase/restore-to-Pro. No external beta review, App Review or public release is established.
- [ ] Select the intended processed build for App Review only after the reviewer-access, paid-service, merchant, screenshot, privacy and age-rating gates are resolved. Live/in-review/pending-release states are currently empty.

The earlier cloud build passed Doctor **18/18**, Prebuild, pods, bundling and Fastlane after the missing-Podfile CNG packaging fix and direct Worklets 0.5.1 correction. Store4 build/signing/upload are separately complete; final native runtime/capture coverage and real paid/Pro validation remain separate gates. The work used the Free plan, with no paid-plan activation or new Supabase project. Approved review backend resources and A/B reservations are now partially live, while delivered Store4 behavior is unchanged. A complete reviewable client/purchase path is not established.

## Store6 current internal delivery

Store6 **1.0.0 (6)**, source `18c41c0116dba0d8d3e13c0a7a97b3de8e43b17c` /151-runtime `0734…05f`, is now the **current owner-only internal TestFlight delivery**. EAS build `baab63bd…` finished19:21:55 UTC; exact IPA **30/30** and root independent review passed. Official Apple validation19:27:12 and **one direct upload19:29:47** passed, with **no EAS Submit**. Apple VALID → betaReady → existing **Sync Internal QA IN_BETA_TESTING** was verified **19:34:26 UTC**, **1 tester /4 builds**. All **8** group checks passed: prior builds/settings/membership preserved, only6 added, no new access/tester/group. The IPA SHA remains `438d5bd8fa100de4a30406ece734eae88288af3fb9314f831ccadba45d5b0af1`, HBC `15a2963a38d51cac0b1f14654d2226656cb9ce891d3d7b6ff1d9bc5a622c88c5`; five public fields/three recovery markers match,14 coach hashes absent/8 owned cues present. **Physical6 B recovery, fresh reviewer credentials and purchase-to-Pro remain unverified**; the owner has been asked to update6, request/open a new B reset on the same phone and cold restart. Store5 owner-reported correct prices remain historical, not a Store6 phone result. No external beta review, App Review or public release occurred. [Terminal evidence](review-billing-live-setup-evidence.json)

## Reviewer password recovery — current blocker

The owner now reports **both monthly/yearly prices correct on physical TestFlight5**. This is owner feedback, not independent capture, exact currency/amount telemetry or a purchase/Pro result.

**The last reported B recovery attempt on Store5 failed on the same iPhone even when requesting and opening there, via Chrome → Sync:** “This sign-in link couldn't be used. Request a new link.” The latest supported native request returned a conditional acknowledgement; delivered mail, a usable link, new password and cold-restart B identity are not confirmed. Root read-only checked the live ConfirmationURL reset template and exact PKCE flowId redirect allowlist; they match, and no hosted setting was changed.

The installed auth-js **2.119.0** synthetic reproduction shows an old main-session refresh failure can call `_removeSession` and remove an unrelated recovery verifier. It does **not conclusively identify the physical cause**. **Recovery V2 source is now frozen**: a separate encrypted recovery PKCE namespace, memory-only secondary JWT and verified adoption through main `setSession`. The **151-file** source SHA256 is `0734ab863cd1acd63df1f50d0832941ab8412a58525ec1dc48784a0e7b47b05f`; **119/119 targeted Auth tests** and independent integration review pass, including installed-SDK teardown and cancel/backlog red→green cases. The final **721/721 full suite**, zero failures/skips, and both Hermes exports now pass: **151** runtime files/SHA `0734ab863cd1acd63df1f50d0832941ab8412a58525ec1dc48784a0e7b47b05f`, **28** assets per platform, all 14 coach absent/all 8 original cues and prior non-coach hashes preserved. The local EAS27 archive passes with **150** shipped runtime files and no credentials/native projects/coach. A strict ad-hoc actual-public Simulator overlay is prepared (existing native template, **now locally installed/UI-checked by root:1 routine/1 session retained, account/reset form/new same-device guidance visible, no reset sent**). **Store6 build/30-check inspection/single direct upload/Apple VALID/existing-group Testing now pass; physical Store6 recovery and fresh credentials remain unverified.**

The prior generated A/B passwords were memory-only and were lost when the CUA runtime reset; no secret file was written. Supabase/EAS server-secret storage is unaffected. Dedicated credentials are **not ready for Apple review fields**: owner reset/new-password/cold-restart confirmation is required, without posting a password in chat. No recovery success or new delivered client is established.

## Last validated candidate base

The historical **b5d8acf** original-cue/Ads-privacy/plural-display base passed **697/697 tests**, zero failures/skips, including **17** actual SQL tests. Both Hermes exports pass: repo **149** runtime files, SHA256 `d826602b2517ff7036f1429c6fe202bc51dd909c79a3a7e80428cba5536e0970`; export/archive stage **148**, excluding the unused coach registry. Assets remain **42 → 28**, all 14 coach hashes absent, all 8 original cues/prior non-coach hashes preserved, all 15 historical files unchanged. The prior `7167a4d1…` pre-plural receipt is historical. Root installed a strict-signed actual-public ad-hoc Simulator JS overlay on the existing native template: **1/1 round** text and retained test data passed. The earlier pre-plural genuine **0:08** completion is separate history; no audio-hearing/network-capture claim is made. This is not a fresh native compile, physical-device or Store5 replacement. **These b5d8acf results predate Recovery V2. That newer 151-file source is frozen with 119 targeted tests passed; its full 721 suite/Hermes/archive 150 now pass, while physical Store6 recovery and fresh credential handoff remain pending.** [Cue history](coach-voice.md), [ads configuration](admob-setup.md), [versioned evidence](review-billing-live-setup-evidence.json)

The owner intends **AdMob ON for public release**. Current Store5 and this future candidate's effective flag remain **OFF**; no serving-readiness claim is made. When OFF, the new source hides Profile Ad privacy choices and rejects stale/direct privacy requests before SDK/cache/state work. When ON, explicit privacy choices—including for Pro—remain available. Account-level AdMob approval is confirmed. The iOS app has two active units but remains review-required/limited serving; exact store search for 6833659501 returned no result while unpublished, so no link was written. App approval, regional/privacy validation and final flag alignment remain gates.

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
| UMP and Google Ads | Store5 keeps ads off but retains its older manual UMP path. Future source hides/blocks that path when OFF; owner intends public Ads ON, not yet enabled. SDK manifests remain unchanged. | Validate the final enabled configuration, regional consent and per-app readiness. App-initiated guard checks are not packet-capture or zero-collection evidence. |
| Browser media | Current candidate production/preview excludes the embedded browser/scanner and new URL acquisition. External library links and Files import remain; existing saved URL metadata is preserved and may enter Pro backup. Store4 still has the earlier browser behavior. | Assess the selected binary's saved-URL playback, destination/provider traffic and cloud metadata; do not infer zero collection or blanket content permission from the guard. |
| Local files/photos | Imported audio/video and profile photos are currently local; no media bytes enter the backup allowlist. | Recheck the final binary and policy before excluding uploaded media categories; permission alone is not collection evidence. |
| Age rating | Owner-confirmed questionnaire is saved: Advertising Yes, seven other features No, Wellness Yes/Medical None; Apple calculated 9+ / regional exceptions below. | Align the intended public Ads ON binary/configuration and App Privacy review. Current Store5/future flag are still OFF; age saving is not serving or App Review proof. |
| Export/privacy archive | Actual Store IPA has `ITSAppUsesNonExemptEncryption=false`, expected permission removals and **15 bundled privacy manifests** whose declarations match the draft matrix. | The manifest inventory is not an official Xcode aggregated report or final questionnaire. Resolve runtime/partner behavior and the official report before finalizing disclosures. |

### Saved age-rating receipt

After the owner's factual confirmations, root **saved** the age questionnaire in App Store Connect on **12 November 2026**. This is no longer a preparation draft: **Advertising Yes**, the **seven other capability answers No**, **Health/Wellness Yes**, and **Medical/Treatment, adult content, violence and gambling None** were saved. The owner confirmed no social/chat/parental features and general-content use. No Kids classification or rating override was selected. The proof-image path has not yet been supplied to this documentation snapshot; the receipt is root's actual saved-UI observation.

Apple calculated **9+ in 172 countries**, **12+ in Vietnam and Brazil**, and **All in South Korea**. For pre-OS26, the global result is **4+**, with regional exceptions. These are Apple-calculated results, not a manually chosen band. [Apple age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)

Advertising Yes matches the owner's intended **future public Ads ON** release. Current Store5 and the future candidate's effective flag remain **OFF**; final source/configuration, per-app approval, consent and App Privacy alignment remain release gates. The guarded source has no embedded arbitrary web navigation; ordinary external links are separate. Discover remains local/sample content rather than a public social feed.

**Historical Store4 boundary:** its embedded Browser produced the earlier source-based Unrestricted Web Access **Yes** inference (16+ OS26 / 17+ earlier before other/regional answers). That earlier inference was never a saved rating. It is retained as source history and does not replace the newly saved owner-confirmed questionnaire.

Age saving does not submit App Privacy labels, an app/product for review, a Kids designation or a public release. Product review screenshots/notes are saved separately; reviewer credential entry and actual purchase-to-Pro remain separate. The documentation task itself made no App Store, account, backend or publication changes. [Current saved/live evidence](review-billing-live-setup-evidence.json)
