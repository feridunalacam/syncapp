# App Store submission packet — English draft

Prepared from the repository and recorded evidence on 12 November 2026. This file prepares copy and capture work; it does not submit metadata, provision reviewer access or establish paid-release readiness. No credentials are included. Confirm every field against the final submitted binary before entering it in App Store Connect.

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
| Version | 1.0.0 in app configuration; record the actual selected distribution build separately. |
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
- [ ] Confirm distribution certificate/profile, signed archive, build number and selected App Store build. API access and EAS Submit key storage/assignment are confirmed; they do not establish distribution signing or an upload.

Final Release native Copy image and transparent clipboard checks are recorded as PASS. Final iPad visual QA remains pending in the latest handoff. Full store screenshot coverage and the final signed archive remain separate gates.

## Screenshot capture manifest

All entries below are **planned captures, not completed assets**. Capture the actual final Release UI on an iPhone and an iPad supported by the final binary. Record the exact build/commit, device model, OS, orientation, pixel dimensions, capture date and source PNG path with each delivered set. Confirm current accepted App Store device slots/dimensions at upload; no size or screenshot-completeness claim is made here. Existing QA evidence does not automatically become a store asset.

Suggested locale/file prefix: `en-US`. Keep an untouched native capture as the source. Any later caption artwork must accurately represent that capture. Do not scale iPhone content to impersonate an iPad screenshot, show personal information, or introduce fake media/history. Use a clean guest session; create any needed history by actually completing the displayed routine.

| Shot | iPhone filename | iPad filename | Real screen/setup | Proposed English caption |
| --- | --- | --- | --- | --- |
| 01 | `en-US_iphone_01-timer-ready.png` | `en-US_ipad_01-timer-ready.png` | Timer Ready with Interval Starter selected; real work/rest durations visible. | Your work and rest timer |
| 02 | `en-US_iphone_02-timer-active.png` | `en-US_ipad_02-timer-active.png` | A real running work interval, captured while foregrounded. | Follow every interval |
| 03 | `en-US_iphone_03-training.png` | `en-US_ipad_03-training.png` | Training library with the intended defaults and Open controls. | Keep your routines together |
| 04 | `en-US_iphone_04-routine-editor.png` | `en-US_ipad_04-routine-editor.png` | Routine editor showing actual named work/rest rounds; no unavailable music source. | Customize your rounds |
| 05 | `en-US_iphone_05-cues.png` | `en-US_ipad_05-cues.png` | Expanded routine cue settings, showing actual supported controls. | Choose countdown and sound cues |
| 06 | `en-US_iphone_06-activity.png` | `en-US_ipad_06-activity.png` | Training > Activity after a genuinely completed session; truthful recorded duration. | Review your sessions |

For iPad, also retain separate internal QA captures in each orientation/multitasking layout supported by the final archive. Check safe areas, tab bar, sheets, editor controls, Activity and share previews for clipping or unreachable controls. The current app configuration says portrait, but generated iPad settings previously included landscape/multitasking; use the actual final binary to establish what ships. These extra QA captures are not a claim that every orientation must be uploaded as store marketing.

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
| Export/privacy archive | `usesNonExemptEncryption=false` is configured; required-reason and installed SDK manifests exist. | Inspect the signed archive's effective settings and aggregate privacy report; configuration format checks do not complete store declarations. |

Record final decisions and supporting evidence before entry; this packet does not change any App Store answers. No fresh web/account verification, account creation, purchase or submission was performed to prepare it.
