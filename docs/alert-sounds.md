# Workout audio and alerts

## Configuration and playback

Audio & alerts configures preparation time and music volume for preparation,
Work and Rest, and adds an opt-in
audio-coaching configuration stored as `routine.audioAlerts`.

When preparation is enabled, the first Work song or playlist starts during it.
Preparation volume defaults to 50%; Work and Rest default to 100%. These are
independently adjustable and saved with the routine; zero is a valid silent
music level. The first Work interval continues the same playback position rather
than restarting the song or reshuffling the playlist. The workout clock and
countdown now wait for playback readiness, as described below. With no first-Work source,
preparation stays musically silent. Existing routines receive these defaults.

Local files and browser audio load at the requested volume before playback.
Spotify volume is requested on the active Connect device; devices that do not
support remote volume keep their own level. Countdown voice plays independently
at the local media level with Device or Browser music. Spotify intervals, including
preparation that uses the first Spotify Work source, use the visual timer without
local voice, effects or legacy alerts. Music settings
do not raise the physical device's media-volume setting for local files.

- **Voice:** spoken countdown, then Go, Rest, Start and Workout complete.
- **Boxing:** spoken countdown, boxing bell for work/start/finish, gong for rest.
- **Beeps:** short countdown ticks with short transition effects.
- **Silent:** coaching disabled, without changing the workout's music.

Choosing an enabled preset supplies a three-second preparation period if the
routine has none. It preserves an existing preparation duration. Countdown mode
can be Voice, Beep or Off, with a 3-, 5- or 10-second window. Before-start,
before-rest and before-work countdowns can be enabled separately. Four phase
signals—workout start, rest start, next work interval and completion—each accept
a built-in effect, spoken phrase, custom sound or None. Short intervals only
announce numbers that fit; a phase-entry signal takes priority over a number at
the same instant.

New and legacy routines keep `audioAlerts: null` until explicitly configured.
The older preparation/end-work/end-rest alerts remain available and retain their
previous behavior with Device/Browser audio in this state. A non-null coaching configuration replaces
that legacy alert path, including when explicitly set to Silent. Saving preserves
other routine metadata. Configuration changes apply to the next session: a
running workout uses its starting snapshot.

English spoken cues use the bundled **SyncApp Coach** recordings selected by the
user as Voice 3 in ElevenLabs. The ten numbers and four transition commands work
offline and sound the same on each device. Existing English routine settings use
these recordings automatically; no routine migration is needed. Turkish cues
still use the installed Turkish system voice through `expo-speech`; missing
Turkish voices produce an actionable error. **Effects volume** controls file-based beeps, bells, gongs and custom
sounds. Spoken cues follow the device's media volume, so setting Effects volume
to zero does not mute spoken countdowns. Disable coaching or select None/Off to
silence those cues.

All alerts play locally on the device running SyncApp. Local alerts are suppressed
while Spotify owns playback, including on another Spotify Connect device. Starting
Spotify first stops local cues; returning to a Device, Browser or silent interval
waits for the prior source to stop before local cues become eligible again. Saved
cue settings remain unchanged. No Spotify track can be selected as a custom alert. Custom file and web
audio use the local player; remote files require network access.

Each file cue ends on its playback-completion callback, or at a bounded safety
timeout: reported duration plus one second, clamped to 2–15 seconds. A reported
zero duration uses a five-second timeout; absent or invalid duration metadata
normalizes to one second and therefore a two-second timeout. A later cue, pause
or stop can interrupt it sooner. This is a short-alert feature, not a replacement
for assigning a full song to an interval.

Preview plays the final three countdown seconds and the selected signal. It
honors the matching countdown switch; when that switch or countdown mode is Off,
it plays only the signal. Preview cancels on edits, picker changes, navigation,
backgrounding or Stop, and is unavailable during an active or paused workout.
Live cues are driven by phase transitions and remaining time. Stale countdowns
are discarded after delays rather than played as a backlog.

Physical-device silent-mode, lock-screen and sustained-background cue behavior
have not been verified. Simulator and automated checks do not establish those
conditions, installed-voice quality, or sound routing on every device.

## Music readiness and interruption handling

Intervals with music enter a visible **Preparing audio** state. Their duration
is held until playback is ready; silent intervals proceed immediately. This is
a variable readiness hold, not a hidden fixed second. Go/Rest/Start and countdown
cues wait for that hold to end. Resume also waits, preserving the remaining
fraction of the interval. A failed start or a ten-second readiness timeout
pauses the session with a retry message. Late completions cannot release a hold
after pause, stop, reset or a newer interval.

For device and browser files the player loads at its initial volume, starts,
and checks native buffering state. Spotify already verifies playback with
remote state reads; HTTP acceptance alone is not a playback confirmation.
Network and device latency still prevent a sample-accurate guarantee across
Spotify Connect devices. Readiness includes command/verification overhead.

All timer pause paths share audio cancellation, including phone interruptions,
locking and leaving the foreground. Returning does not automatically resume.
Music pause is sent immediately when another command is pending and confirmed
again after that command settles; legacy cues and coaching are cancelled too.
Completion stops music before allowing any local completion cue. A stale cue is
discarded if remote pause takes too long. Reset and abort stop both.
An unloaded workout provider also requests remote pause and releases local sounds.

While running, sequential playback checks treat two stopped/missing snapshots,
at least 800 ms apart, as an interruption; a single handoff gap is tolerated.
A new controllable device resets this observation window. Playback request
errors pause the workout. User-selected silent rounds do not trigger this rule.
These checks can take roughly two polling cycles, plus network latency.

Background execution is deliberately paused rather than relying on suspended
JavaScript timers to schedule song changes. Physical lock/call/headphone-route
behavior still requires device testing. A force-killed process cannot issue a
pause, and loss of connectivity can prevent pausing a remote Spotify player.

References: [Expo AV playback status](https://docs.expo.dev/versions/v54.0.0/sdk/av/)
and [Spotify playback commands](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback).
Spotify's [Developer Policy, section III.7](https://developer.spotify.com/policy)
prohibits overlap with other audio; its [Developer Terms, section II.14](https://developer.spotify.com/terms)
include background Spotify control in Streaming. These playback safeguards do not
establish approval for public or commercial Spotify use.

## New workout cues

The four files in `assets/sounds/cues/` were generated for SyncApp with original
additive-synthesis code on 14 September 2026. They contain no third-party audio
samples and no exported system speech. Gong and boxing bell are distinct metallic
sound effects, not spoken words. These are synthesized timbres rather than
recordings of physical instruments.

| URI                        | Asset              | Duration | Construction                                       |
| -------------------------- | ------------------ | -------- | -------------------------------------------------- |
| `voices://cue_tick`        | `tick.wav`         | 0.10 s   | Short sine pulse with a quiet harmonic             |
| `voices://cue_gong`        | `gong.wav`         | 1.85 s   | Low, inharmonic plate modes with a decaying strike |
| `voices://cue_boxing_bell` | `boxing-bell.wav`  | 1.00 s   | Bright, inharmonic bell modes with a fast strike   |
| `voices://cue_chime`       | `finish-chime.wav` | 0.65 s   | Three short ascending notes                        |

All four are mono PCM WAV, 44,100 Hz, signed 16-bit. Peak amplitude is normalized
to 0.64 of full scale; the start and end envelopes avoid abrupt cuts. The total
uncompressed asset size is approximately 318 KB. Asset mappings and selection
metadata live in `src/services/alerts/assets.js`.

The reproducible Python generator is saved in the workspace's
`work/generate-alert-cues.py` beside the repository. It uses the Python standard
library and fixed random seeds only. This earlier generator never changed the
older files; their later removal is recorded below.

English countdown numbers and phase names now use `assets/sounds/coach-en/`.
Turkish spoken cues continue to use the runtime speech engine.
The old `voice_*.mp3` files were tones, not speech, and have now been removed.

## Original replacements for saved legacy cues

On 12 November 2026 the 14 existing `LEGACY_CUE_ASSETS` URIs were retained while
all old recording references were replaced with original synthesized effects.
Both the older countdown player and the current cue adapter use this registry.
Saved routines, URI strings and IDs need no migration. Exact timbre and clip
duration change; this deliberately does not preserve the unverified recordings.
Existing saved duration metadata does not change the workout timeline, and
native completion still releases each short effect.

| Saved URI suffix after `voices://` | Original WAV replacement | Duration |
| --- | --- | --- |
| `beep_short`, `tone_high`, `countdown_321`, `countdown_go`, `countdown_start` | `tick.wav` | 0.10 s |
| `beep_long`, `tone_low` | `long-beep.wav` | 0.80 s |
| `bell`, `boxing_bell` | `boxing-bell.wav` | 1.00 s |
| `gong` | `gong.wav` | 1.85 s |
| `whistle` | `whistle.wav` | 0.75 s |
| `buzzer` | `buzzer.wav` | 0.65 s |
| `air_horn` | `air-horn.wav` | 0.85 s |
| `success` | `finish-chime.wav` | 0.65 s |

The four new compatibility effects are original code-generated timbres, not
recordings of physical instruments. `scripts/generate-legacy-cues.py` uses only
Python's standard library (`math`, `wave`, `struct` and file/hash utilities):

- Long beep: 660 Hz sine with a quiet second harmonic.
- Whistle: a smooth 1700–1980 Hz sweep with gentle vibrato and a quiet harmonic.
- Buzzer: a 150 Hz odd-harmonic sum with mild amplitude modulation.
- Air horn: a 220/275/330 Hz synthesized chord with quiet second harmonics.

Raised-cosine attack/release envelopes remove abrupt PCM edges. The four new
files are mono PCM WAV, 44,100 Hz, signed 16-bit, with peak amplitude normalized
to 0.60 of full scale and zero-valued first/last samples. They contain no
third-party samples, external audio inputs or exported speech. The source
generator and generated WAVs are versioned together. Regenerate with
`python3 scripts/generate-legacy-cues.py`; verify exact committed bytes without
writing with `python3 scripts/generate-legacy-cues.py --check`.

All 15 former MP3s under `assets/sounds/` and the two unused MP3 examples under
`assets/audio/` were removed after application/test/config searches found no
remaining references. This prevents broad asset inclusion from retaining the
unverified recordings. The owner's English ElevenLabs coach recordings and
their separate plan/terms caveat in `coach-voice.md` are unchanged.

## Historical audit of the removed recordings

The 15 older MP3s were already present in the repository before the replacement
above. They are no longer shipped. The following inventory explains the removal;
filenames alone did not establish contents or redistribution rights. The earlier
SHA-256 comparison identified only five different recordings.

| File group                                                                                                                     | Estimated encoded duration | Finding                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| `beep_short`, `air_horn`, `whistle`, `countdown_321`, `countdown_54321`, `voice_go`, `voice_ready`, `voice_rest`, `voice_work` | 0.993 s each               | All nine files are byte-identical; one tone rather than distinct voices/countdowns/effects |
| `beep_long`                                                                                                                    | 3.792 s                    | Several tone bursts separated by silence, rather than one long tone                        |
| `bell`, `gong`, `boxing_bell`                                                                                                  | 6.000 s each               | All three files are byte-identical; one strike with audible decay and trailing silence     |
| `buzzer`                                                                                                                       | 1.056 s                    | One continuous short signal                                                                |
| `chime`                                                                                                                        | 16.080 s                   | Much longer than its old one-second selection metadata                                     |

Durations come from macOS `afinfo`; decoded PCM excludes MP3 padding and may be
slightly shorter. Envelope measurements were taken after decoding with
`afconvert`. No claim is made that these older files are distinct recorded speech.

The short-beep group and buzzer embed a `SoundJay.com Sound Effects` artist tag.
Older source comments instead refer to Mixkit preview URLs. No provenance or
redistribution license was established for those files in the earlier audit.
They were removed instead of being described as licensed Mixkit recordings.
Both new default effects and saved legacy URIs now use original synthesis above.
