# App Store submission packet — English draft

Updated on 12 November 2026 with the delivered Store build **1.0.0 (2)**, source `da7339f`. EAS Build `015a6833…` finished, its IPA passed strict signature/profile inspection, and EAS Submit `771ac1eb…` uploaded it successfully. Apple processing is **VALID**, internal **READY_FOR_BETA_TESTING**, external **READY_FOR_BETA_SUBMISSION**, not expired. **Sync Internal QA** now contains the build and only the existing account holder, visibly **Invited**; automatic distribution is off. Invitation acceptance/installation remain unobserved. No external beta review, App Review or public release is recorded. This packet's copy/reviewer/capture work remains a draft and does not establish paid-release readiness. No credentials are included.

## Store fields

| Field | Proposed value / status |
| --- | --- |
| Name | Sync - Interval Timer |
| Subtitle | Work, rest, music and routines |
| Promotional text | Build your own work and rest rounds, add local audio, and keep your training routines and session history in one place. |
| Keywords | hiit,tabata,workout,rounds,training,countdown,rest,boxing,routines,fitness |
| Copyright | **2026 Feridun Alaçam** — proposed; owner to confirm the rights-holder wording. |
| Primary category | **Health & Fitness** — proposed, not a confirmed saved store value. Work/rest training, workout routines and exercise/session history are the app's main purpose. This fits the current product better than positioning it as a generic utility timer. No medical, measured-health, HealthKit or Apple Watch capability is claimed. |
| Secondary category | No proposal; leave unselected unless the final listing needs one. |
| Version / delivered build | **1.0.0 (2)**, source `da7339f`, signed Store IPA uploaded and processed. Selection for an App Review version is not established. |
| Privacy Policy URL | https://sync-app-support.feridun.chatgpt.site/privacy |
| Support URL | https://sync-app-support.feridun.chatgpt.site/ |
| Marketing URL | https://sync-app-support.feridun.chatgpt.site/ |
| Terms URL | https://sync-app-support.feridun.chatgpt.site/terms |
| Description | Use the English description in [app-store-release.md](app-store-release.md#proposed-english-metadata). Its Sync Pro paragraph is conditional on the submitted feature set and verified availability. |

The production configuration disables Spotify and advertising. Exclude Spotify from metadata and screenshots. Do not advertise background workout execution: leaving the foreground pauses the session and music, and returning requires a manual resume. Discover contains samples and content saved on the device, rather than a public online community.

## App Review notes — core block to copy

The following block describes the guest/core flow. Copy it only after confirming that these steps match the selected distribution build. The separate account/Pro block below has additional readiness conditions.

```text
Sync is an interval-training timer for iPhone and iPad. The timer, routine editor, local routines and local session history can be used without an account or subscription.

To try the core experience:
1. Open the Training tab. On a fresh installation, choose Interval Starter, Quick Burst or Endurance and tap Open on its card. This opens the selected routine in Timer.
2. Tap Start to begin the session. Work and rest phases advance automatically. Use Pause and Resume to control the session.
3. To create a routine, open Training, tap the + button, enter a name, adjust the work/rest rounds and tap Save. Tap a saved routine's name or edit icon to edit it.
4. After completing a session, open Training > Activity to view its local history.

The guest timer and locally saved routines/history work offline. Imported audio files remain on the device where they were added; browser audio requires an internet connection. Leaving the app pauses the session and music. Return to Timer and tap Resume to continue.

Discover contains sample routines and content saved locally on the device. It is not a public social feed. Camera or library access is requested only when the user chooses a feature that needs it; neither permission is required to try the timer.

Privacy Policy: https://sync-app-support.feridun.chatgpt.site/privacy
Support: https://sync-app-support.feridun.chatgpt.site/
```

## App Review notes — account/Pro block to append conditionally

**Internal handoff condition:** append this block only if account/Pro features are included in the submitted binary and the reviewer can actually access them. A dedicated reviewer account has not been supplied by this packet. Provision and verify any required account through the authorized review process, then enter its details in App Store Connect's separate sign-in fields. Do not put the owner's login, invented credentials or a fabricated paid entitlement here. Resolve the billing/reviewer-access gates in the internal checklist before presenting this block as usable review instructions.

```text
Account features are available from Profile > Sign in or create account. Please use the review account credentials supplied in the App Review sign-in fields. Sign-in and cloud features require an internet connection.

To inspect subscriptions, open Profile > Explore Sync Pro (or Sync Pro for an active membership). The account screen also provides Manage Sync Pro. The subscription screen shows the available Monthly and Annual plans and the store's localized price before checkout. Select a plan and tap Subscribe.

The same screen provides Restore purchases, Refresh access and Manage subscription. A restored purchase may move Pro access to the currently signed-in Sync account; each account keeps its own separate cloud data. Verified Pro access enables Profile > Cloud backup. Imported audio files and profile photos stay on their original device.

To find account deletion, open Profile > Your account > Delete account…. The screen requires explicit confirmation and may request a fresh sign-in. Deleting a Sync account does not cancel its App Store subscription; Manage subscription opens the subscription-management path.

Terms of Use: https://sync-app-support.feridun.chatgpt.site/terms
Privacy Policy: https://sync-app-support.feridun.chatgpt.site/privacy
```

## Internal guest/offline walkthrough

Use a disposable QA installation with no personal account or imported owner data. These steps are a verification checklist, not a record that every check has passed on the final distribution binary.

Recorded evidence is scoped by native composition. Pre-pin `f1bfac6` / Worklets **0.6.1** iPhone/iPad simulators completed genuine four-minute/three-round sessions and Activity history; iPad background pause/landscape/Finish and Copy image/transparent clipboard on both devices passed. Fresh CNG Worklets **0.5.1** iPad QA reopened the saved five-second routine, completed its real countdown, finished, inspected Activity detail and passed Copy image/Copy transparent sticker. Its installed executable/JS matched the preserved CNG reference. Post-upload Profile source `a6099d3` passed a separate signed local Release build and native Dark appearance switch activation **1 → 0 → 1**; the full source suite passed **496/496** again. Current-CNG iPhone, a full VoiceOver audit and actual TestFlight runtime remain unverified. Synthetic public configuration and later concurrent worktree edits are outside live-service/build-2 evidence.

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
- [ ] Keep paid availability, merchant/banking/tax/seller requirements, subscription review images/notes and App Review access open until resolved. These deferred owner actions are not completed by this document.
- [x] Verify distribution certificate/profile, strict IPA signature, Store build **1.0.0 (2)** and upload. The existing App Manager API key/certificate/profile are assigned in the EAS vault; CLI profile fetch with the team environment passed. No Admin role or additional API key was used.
- [x] Configure owner-only internal tester access: **Sync Internal QA**, build **1.0.0 (2)**, one existing account-holder tester marked **Invited**, automatic distribution off.
- [ ] Observe invitation acceptance and verify actual TestFlight installation/runtime on the owner's device. An invitation alone does not establish installation or a successful paid lifecycle. No external beta review is recorded.
- [ ] Select the intended processed build for App Review only after the reviewer-access, paid-service, merchant, screenshot, privacy and age-rating gates are resolved. Live/in-review/pending-release states are currently empty.

The cloud build passed Doctor **18/18**, Prebuild, pods, bundling and Fastlane after the missing-Podfile CNG packaging fix and direct Worklets 0.5.1 correction. Build/signing/upload are complete; final native runtime/capture coverage and real paid/Pro validation remain separate gates. The work used the Free plan, with no paid-plan activation or new backend.

## Screenshot capture manifest

The persistent candidate root is `/Users/feridunalacam/.codex/visualizations/2026/11/11/01a1cb22-5d7e-7c32-9bd0-bcdc3c97010f/app-store-candidates/`. Its original group contains **13 unchanged raw PNGs** (six iPhone, seven iPad) and **13 pixel-identical RGB derivatives** under `appstore/`, with provenance and technical verification in its manifest/README. The raw images are fully opaque RGBA; the derived RGB PNGs remove the alpha channel without resizing, cropping or changing pixels/color space. These are candidates, not a final screenshot-completeness claim.

The original 13 are source **`f1bfac6`**, Simulator Release, OS 26.1, native Worklets **0.6.1**, before the 0.5.1 pin. They include Ready/active/Training/Activity/share, an iPhone editor and iPad landscape pause/completion. Their four-minute/three-round history was completed through the UI; the group was not relabeled as current-build evidence.

The separate `current-cng-da7339f/` group now contains **three raw plus three verified RGB iPad Ready/editor/cue images**, captured at 12:32–12:33 on OS 26.1, local CNG Simulator Release **(1)**, Worklets **0.5.1**, using synthetic public configuration. Its raw alpha is fully opaque and RGB/ICC/render equality checks passed. The cue image shows its real scroll position with lower controls below the fold. This group includes no current-CNG iPhone, active timer, Training, Activity or share captures and does not independently prove the signed Store **(2)** runtime. Final capture coverage remains pending.

The table below remains the **target final-build capture set**, with proposed filenames. Capture/revalidate the actual final Release UI on both device families, recording exact build/commit, device, OS, orientation, dimensions, time and raw PNG path. Confirm accepted App Store slots at upload. Pre-pin candidates do not automatically prove the submitted binary's UI.

Suggested locale/file prefix: `en-US`. Keep an untouched native capture as the source. Any later caption artwork must accurately represent that capture. Do not scale iPhone content to impersonate an iPad screenshot, show personal information, or introduce fake media/history. Use a clean guest session; create any needed history by actually completing the displayed routine.

| Shot | iPhone filename | iPad filename | Real screen/setup | Proposed English caption |
| --- | --- | --- | --- | --- |
| 01 | `en-US_iphone_01-timer-ready.png` | `en-US_ipad_01-timer-ready.png` | Timer Ready with Interval Starter selected; real work/rest durations visible. | Your work and rest timer |
| 02 | `en-US_iphone_02-timer-active.png` | `en-US_ipad_02-timer-active.png` | A real running work interval, captured while foregrounded. | Follow every interval |
| 03 | `en-US_iphone_03-training.png` | `en-US_ipad_03-training.png` | Training library with the intended defaults and Open controls. | Keep your routines together |
| 04 | `en-US_iphone_04-routine-editor.png` | `en-US_ipad_04-routine-editor.png` | Routine editor showing actual named work/rest rounds; no unavailable music source. | Customize your rounds |
| 05 | `en-US_iphone_05-cues.png` | `en-US_ipad_05-cues.png` | Expanded routine cue settings, showing actual supported controls. | Choose countdown and sound cues |
| 06 | `en-US_iphone_06-activity.png` | `en-US_ipad_06-activity.png` | Training > Activity after a genuinely completed session; truthful recorded duration. | Review your sessions |

For iPad, retain separate internal QA captures in the supported orientations/multitasking layouts. The actual Store IPA supports all four iPad orientations, family 1,2 and `UIRequiresFullScreen=false`; iPhone supports portrait/upside-down. Check safe areas, tab bar, sheets, editor controls, Activity and share previews for clipping or unreachable controls. Pre-pin landscape checks passed, but final 0.5.1 coverage remains separate. These extra QA captures are not a claim that every orientation must be uploaded as store marketing.

An optional Discover screenshot must show its sample/local wording. An optional account/Pro screenshot requires verified reviewer access and real available plans; omit it while those gates are open. Do not market Spotify, live social publishing, fabricated Pro status or an unverified billing result.

## Privacy and age-rating decisions still to resolve

Use [app-store-privacy.md](app-store-privacy.md) as the source matrix. Do not copy the app manifest's empty collected-data array into a “Data Not Collected” answer. Finalize the questionnaire with the actual submitted configuration, partner behavior, public policy and aggregated distribution-archive report together.

| Decision | Current draft / evidence | Still needed before final answers |
| --- | --- | --- |
| Account and purchase identity | Email, UUID/User ID and purchase history are account-linked. RevenueCat purchase reporting has proposed App Functionality + Analytics purposes. | Confirm enabled partner integrations and the submitted build's actual paths; retain the linked classification where UUID joins to the account. |
| Pro content/history | Routine/post/bio/URL metadata can be backed up. Exercise/session history has a proposed Fitness classification; dedicated social links may be Other User Contact Info. | Confirm the Fitness/social-link categories and their purposes; distinguish metadata from local audio/photo bytes. |
| Server and email logs | Supabase/Auth/gateway/email services may retain request events and metadata. | Establish actual IP/device/request fields, purposes, retention and access. No zero-log claim is supported. |
| UMP and dormant Google Ads | Production serving ads are off, but Profile > Ad privacy choices can still request UMP information. Installed manifests include collected categories and GMA tracking flags. | Resolve this reachable UMP path and actual SDK behavior. Neither absent ATT nor ads-off configuration settles all collection/tracking answers. |
| Browser media | Arbitrary HTTP/HTTPS browsing is supported; no separate app browsing/search-history log was found, but selected URLs can enter saved cloud metadata. | Assess third-party web traffic and the applicable web exception before deciding Browsing/Search History answers. |
| Local files/photos | Imported audio/video and profile photos are currently local; no media bytes enter the backup allowlist. | Recheck the final binary and policy before excluding uploaded media categories; permission alone is not collection evidence. |
| Age rating | Browser audio includes open web navigation. Discover is samples/local saved content rather than public UGC; production ads are disabled. | Answer the current questionnaire for actual open-web/content capabilities. Do not select an age band solely because this is a timer or describe local content as a public social network. |
| Export/privacy archive | Actual Store IPA has `ITSAppUsesNonExemptEncryption=false`, expected permission removals and **15 bundled privacy manifests** whose declarations match the draft matrix. | The manifest inventory is not an official Xcode aggregated report or final questionnaire. Resolve runtime/partner behavior and the official report before finalizing disclosures. |

Record final decisions and supporting evidence before entry; this documentation update changes no App Store answers. The build upload/Apple processing record and owner-only internal invitation above are distinct from App Review or public release. No account creation, purchase, production grant or backend creation was performed for this packet.
