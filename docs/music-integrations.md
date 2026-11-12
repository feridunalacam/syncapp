# Music integrations

Source implementation added on 12 November 2026. This source has not been shipped to TestFlight or the App Store. A service appearing under **Other music apps** is an external link, not a connected account or a controllable interval source.

| Service | Implemented behavior | Activation / limitations |
| --- | --- | --- |
| Device / Browser audio | Existing local import and permitted web audio playback | No music account required. |
| Apple Music | Native iOS MusicKit authorization, subscription check, catalog song/playlist search, paginated library playlists and playlist tracks, per-round songs/playlists, shuffle distribution, pause/resume/stop, repeat and player state | iOS 16+, a newly built native client, MusicKit enabled for the Apple App ID and an active Apple Music subscription. Android/web and Expo Go offer the external Apple Music link. |
| Spotify | Existing owner-development OAuth + PKCE/Connect controls, plus a separately labelled external **Open Spotify** link | The connection/playback release gate remains in place. The external link does not connect an account or control intervals. Public/commercial streaming access has not been granted. |
| YouTube Music | Open the service or a shared song/playlist URL | No account OAuth, audio extraction or automatic interval playback. YouTube's API policies prohibit hidden/background players and separating audio/video. |
| TIDAL | Open service/shared link | Public developer terms target noncommercial offerings and restrict mixing/integration with other services. An API client alone does not establish permission for Sync. |
| SoundCloud | Open service/shared link | Public API access requires an application review; the public API help excludes general commercial use. |
| Deezer | Open service/shared link | New API access is restricted; partner authorization is needed before adding account access. |
| Amazon Music | Open service/shared link | Web API remains closed beta with review/certification requirements. |
| Audius | Open service/shared link | Catalog/account/playback adapter is not implemented in this change. |

## Apple Music setup

1. In Apple Developer **Certificates, Identifiers & Profiles**, open the existing `com.feridun.syncapp` App ID and enable the **MusicKit** app service. This portal setting is not established by a successful local compilation. Native MusicKit manages developer/user tokens; do not add a private signing key or music user token to Expo variables.
2. Rebuild the installed iOS client. `modules/sync-apple-music` is a local Expo module, automatically discovered by Expo autolinking and included in CNG/EAS builds. `plugins/withAppleMusic.js` adds `NSAppleMusicUsageDescription`. Older installed clients continue to load with an external Apple Music link and do not try to call a missing module.
3. On a physical iOS 16+ device signed for the configured App ID, open **Profile → Music → Apple Music → Connect**. The system asks for Music access only on that action. An active catalog subscription is checked before the connection is saved.
4. In Training, open a routine. The Apple Music playlist strip supports Work/Rest shuffle distribution. A round's music picker also has Apple Music songs/playlists. Search requires a connection. Both catalog and library identifiers remain tagged `appleMusic` in saved routines.
5. Run assigned Work/Rest intervals, pause/resume, change between local and Apple sources, and finish. MusicKit uses system volume. Local voice cues/alerts are suppressed while Apple Music owns playback. Existing foreground-only session behavior remains; this change does not add background timer execution or a lock-screen workout guarantee.

Disconnect stops Sync's application music player and removes Sync's connection metadata. It does not sign the person out of the Music app or revoke the OS permission; the latter is managed in iOS Settings. MusicKit credentials never enter JavaScript, SecureStore, local account records or cloud backup. Only a native connection marker is persisted on this device. Tokenless native connections are restored as such, then checked noninteractively before requests. Denied permission, restriction, subscription failure, unavailable content and stale playback commands do not become successful playback.

## External music links

**Profile → Music → Other music apps** opens service home pages or a pasted shared link. Only HTTPS links on explicitly listed service hosts are accepted; lookalike hosts, embedded credentials, custom ports and arbitrary schemes are rejected. Universal-link handling may open the installed service app or its website. Sync does not fetch the media, obtain account tokens, scrape the provider, or turn those links into round assignments. Playback stays under the service's control.

## Validation

Source `585b64b` passed **557/557 automated tests** and iOS/Android Hermes exports. Independent real-SDK/storage checks also verified the three credential-entry races, native cancellation after lock wait and initialization/error paths. The actual whole-app CNG **Release** simulator build (arm64/x86_64) and a separate **Debug** development client (arm64) passed normal signing and strict/deep codesign; both Apple native modules are included. Their backend/RevenueCat values are explicit synthetic QA fixtures, not live service validation.

Native iPhone Debug QA showed the Apple/Google/email/guest welcome choices, completed guest entry, exposed Spotify Connect and native Apple Music, and displayed all seven external services. **Open Spotify** reached its actual HTTPS homepage. After the owner completed Spotify authorization, playlists, catalog search and per-interval assignment worked. A 15-second Work / 10-second Rest / 15-second Work session completed with pause/resume; the real desktop Spotify player showed the different Rest song and paused at completion. A second session's early end also paused Spotify. This is one owner Premium account through a development client and Connect desktop device, observed through player UI; it is not an acoustic, physical-iPhone or public-access test. The owner has no Apple Music subscription. Physical subscribed-device playback and a delivered provider-enabled TestFlight build remain unverified. See [sanitized QA evidence](music-auth-qa-evidence.json).

The owner approved and enabled MusicKit on the existing App ID; a reopened App Services screen retained the checked setting. Apple invalidated the existing Store profile after that change, so build 3 is held and the same certificate/profile is being renewed again before replacement delivery. The public privacy notice was updated and deployed as Site version 5 to describe the actual MusicKit/data-backup flow. No Apple Music subscription was activated.

Apple's review rules separately discuss rights for more complex MusicKit integrations, including timed song use; native compilation or enabling the app service does not establish those rights. Keep that release assessment open for per-round playback. [Apple MusicKit review rules](https://developer.apple.com/app-store/review/guidelines/#apple-sites-and-services)

## Primary references

- [Apple MusicKit overview](https://developer.apple.com/musickit/) and [MusicKit integration/setup sample](https://developer.apple.com/documentation/musickit/integrating-musickit-into-your-app).
- [MusicAuthorization](https://developer.apple.com/documentation/musickit/musicauthorization), [ApplicationMusicPlayer](https://developer.apple.com/documentation/musickit/applicationmusicplayer), [catalog search](https://developer.apple.com/documentation/musickit/musiccatalogsearchrequest) and [library requests](https://developer.apple.com/documentation/musickit/musiclibraryrequest).
- [Expo local modules](https://docs.expo.dev/modules/get-started/) and [autolinking](https://docs.expo.dev/modules/autolinking/).
- [YouTube developer policies, playback integrity](https://developers.google.com/youtube/terms/developer-policies/).
- [TIDAL developer terms](https://developer.tidal.com/documentation/guidelines-developer-terms-2_0) and [guidelines](https://developer.tidal.com/documentation/guidelines/developer-guidelines).
- [SoundCloud public API access](https://help.soundcloud.com/hc/en-us/articles/115003446727-SoundCloud-Public-APIs).
- [Deezer staff explanation of new API access restrictions](https://en.deezercommunity.com/features-feedback-44/api-auth-impossible-80857).
- [Amazon Music developer portal](https://developer.amazon.com/docs/music/landing_home) and [program requirements](https://www.developer.amazon.com/docs/music/requ_AM-Program-Requirements.html).
