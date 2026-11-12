# Audio transition checks — 12 November 2026

## Improvements

Playback readiness no longer waits for the display-only current-playback request after the new source has started. The timer still waits for actual load/play readiness and pauses on a failed start. Metadata errors are caught separately, and old responses cannot overwrite a newer source.

Device audio now holds at most one silently prepared local next track. Look-ahead uses the actual interval timeline, including zero rests, preparation and no final rest. Switching sources releases the current sound while preserving that next sound and the initialized audio mode. A matching completed preparation is reused; incomplete speculative work never blocks an actual start and unloads itself when retired. Remote URLs are not downloaded speculatively. Stop/unmount clears prepared resources. Old native status callbacks are ignored after a new sound takes ownership.

MusicKit keeps a bounded, short-lived in-memory metadata cache: up to 32 songs and 32 playlists, valid for five minutes. Catalog subscription checks can reuse a positive result for 30 seconds while OS authorization is checked on every access. Search/playlist song objects can be reused for playback without fetching the same metadata again. End/disconnect/unmount clears these caches; phase release preserves them. Media playback/buffering remains under MusicKit's control.

Apple pause, stop, release, status reads and local transport controls do not require a network token/subscription preflight. A reproduced permission/subscription failure previously blocked both native stop and a transition to Device audio. Negative regression tests now cover that path. New Apple playback/resume continues to require access verification.

## Native measurement

An isolated empty **iPhone 17 / iOS 26.1** simulator (`Sync Audio Performance QA`) ran the current `ExpoAVPlayer` JavaScript against the real Expo AV native module in an existing SDK 54 Debug development binary. The harness used two bundled local WAV files, zero volume, and 16 alternating transitions. Each sample timed **pause current → unload current → load/play target → native playback readiness**. Prepared samples silently loaded the target before the timed boundary.

| Current player path | Samples | Mean | Median | Range |
| --- | ---: | ---: | ---: | ---: |
| Without preparation | 8 | 116.55 ms | 116.53 ms | 115.57–117.31 ms |
| With completed preparation | 8 | 97.16 ms | 102.48 ms | 86.77–103.92 ms |

The prepared path reduced mean command-to-readiness time by about **16.6%** in this small local test. This is a comparison within the updated player, not a before/after comparison of two released apps. It does not measure the acoustic output gap, physical iPhone/Bluetooth timing, network streams, Spotify or live Apple Music. The old native binary suffices for Expo AV timing, but does not validate the newly added AppleAuthentication/MusicKit modules. No account data or real music credentials were used.

Raw metrics and the temporary harness are in `/private/tmp/syncapp-audio-benchmark-results.json` and `/private/tmp/syncapp-audio-benchmark/index.js` on this machine. Regression tests exercise readiness under stalled metadata reads, unfinished/replaced preparations, cleanup, rapid skips, pause/resume, stale callbacks, denied Apple access and transition to Device playback.

## Remaining live checks

Use a newly signed native build for physical-device checks. Measure long local files, Bluetooth, rapid mixed-source transitions, calls/app backgrounding and first-start buffering. Apple Music needs the App ID service, a real subscription and owner authorization. Spotify's development-only release gate stays in place. External service links do not provide automatic per-round playback. Do not describe all providers as gapless or live-verified based on these checks.
