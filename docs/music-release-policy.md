# Apple Music release policy

Decision recorded 12 November 2026: **native Apple Music connection, library access and timer-controlled playback are off in production/preview source**, behind a hard development-only guard. External **Open Apple Music** and owner development remain. The source guard passed independent automated review; a fresh local Simulator Release compiled and passed signature checks with synthetic fixtures. No new installed/UI/public-release result or timed-use permission is established. Historical Store4 and simulator evidence retain their original scope.

## Primary-source basis

Apple's current Developer Program License Agreement **§3.3.6(D)** prohibits payment for or indirect monetization of Apple Music access, with IAP, advertising and requesting user information as examples. It requires full-song playback capability, user initiation and standard media controls, and restricts synchronizing MusicKit content with other content unless Apple's documentation permits it. [Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

App Review **4.5.2(ii)** explicitly identifies playing a selected song at a particular moment as an integration requiring rights-holder permission beyond MusicKit. Sync's work/rest song assignments closely match that example; this is the concrete unresolved rights boundary. The same section limits artwork/metadata use to playback/playlists and requires specific authorization for marketing/advertising. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#apple-music)

This is **not a blanket fitness-app ban**. Apple itself describes fitness soundtracks and demonstrates ApplicationMusicPlayer for fitness apps. Those examples do not establish permission for Sync's precise scheduled-song behavior. [Audio and music overview](https://developer.apple.com/documentation/technologyoverviews/audio-and-music), [WWDC21 MusicKit](https://developer.apple.com/videos/play/wwdc2021/10294/)

## Sync's actual monetization and source boundary

Before the guard, guests/Free users could access native Apple Music without Pro. Pro sells cloud backup/sync and ad removal; production ads are off. MusicKit queues full songs, owns authorization and exports no audio; local cues are suppressed. These safeguards do not establish timed-use rights. A separate cloud subscription has neither an express blanket ban nor a safe harbor; access monetization remains use-specific. No current standalone clause literally prohibits mixing with other audio; a code comment is not contract wording.

Before public re-enablement, obtain documented permission/clarification covering the exact scheduled playback and monetization model, review metadata/artwork contexts, and complete subscribed physical-device authorization, revocation, standard-control and interval-transition QA. App ID activation, a working subscriber account, simulator success or a MusicKit API capability alone is insufficient evidence. Re-enablement requires a separately reviewed release change; no terms were accepted or permissions obtained by this research.

## Browser media acquisition decision

Production/preview source also disables automatic WebView media extraction and its download/URL-add acquisition callbacks behind a hard development-only guard. Independent source review and 48 focused tests passed: the release wrapper does not load the legacy browser, and direct callbacks stop before reading URL arguments, downloading or selecting audio. The fallback offers external Mixkit, Pixabay, Freesound and ZapSplat links plus Files import. Existing saved URLs and metadata remain unchanged because they can represent owned or authorized content; preserving them does not establish permission for every provider. Apple **5.2.3** requires authorization for third-party downloading/streaming; the unrestricted scanner had no source-permission boundary. This validates source restrictions, not a new native/UI result or blanket licensing. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)
