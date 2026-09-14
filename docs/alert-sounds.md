# Workout audio and alerts

## Configuration and playback

Audio & alerts keeps preparation time and rest-music volume, and adds an opt-in
audio-coaching configuration stored as `routine.audioAlerts`.

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
previous behavior in this state. A non-null coaching configuration replaces
that legacy alert path, including when explicitly set to Silent. Saving preserves
other routine metadata. Configuration changes apply to the next session: a
running workout uses its starting snapshot.

Spoken cues use installed English or Turkish system voices through `expo-speech`;
they are not bundled speech recordings. Missing voices produce an actionable
error. **Effects volume** controls file-based beeps, bells, gongs and custom
sounds. Spoken cues follow the device's media volume, so setting Effects volume
to zero does not mute spoken countdowns. Disable coaching or select None/Off to
silence those cues.

All alerts play locally on the device running SyncApp. Spotify music may be
playing on another Spotify Connect device; alerts are not sent to that remote
device. No Spotify track can be selected as a custom alert. Custom file and web
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
library and fixed random seeds only. It never changes the older files.

Spoken countdown numbers and phase names use the runtime speech engine.
Do not map spoken labels to any `voice_*.mp3` file in the older inventory: those
files contain the same audio as the older short beep.

## Audit of the existing files

The 15 older MP3s were already present in the repository. This change preserves
them for legacy routine compatibility. SHA-256 comparison identifies only five
different recordings; filenames alone do not establish their contents.

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
redistribution license was established for those existing files in this audit;
they must not be documented as newly licensed Mixkit recordings. New default
effects use the original generated files above.
