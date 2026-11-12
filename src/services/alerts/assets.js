// Original synthesized effects; no third-party recordings or system TTS exports.
// Speech cues use the English coach recordings or the device's Turkish voice.
export const CUE_ASSETS = Object.freeze({
  'voices://cue_tick': require('../../../assets/sounds/cues/tick.wav'),
  'voices://cue_gong': require('../../../assets/sounds/cues/gong.wav'),
  'voices://cue_boxing_bell': require('../../../assets/sounds/cues/boxing-bell.wav'),
  'voices://cue_chime': require('../../../assets/sounds/cues/finish-chime.wav'),
});

// Preserve every saved URI while replacing the former unverified recordings
// with original synthesized effects. Legacy countdown_go/start were tones, not
// speech; spoken coaching continues through the separate coach registry.
export const LEGACY_CUE_ASSETS = Object.freeze({
  'voices://beep_short': CUE_ASSETS['voices://cue_tick'],
  'voices://beep_long': require('../../../assets/sounds/cues/long-beep.wav'),
  'voices://tone_high': CUE_ASSETS['voices://cue_tick'],
  'voices://tone_low': require('../../../assets/sounds/cues/long-beep.wav'),
  'voices://bell': CUE_ASSETS['voices://cue_boxing_bell'],
  'voices://gong': CUE_ASSETS['voices://cue_gong'],
  'voices://boxing_bell': CUE_ASSETS['voices://cue_boxing_bell'],
  'voices://whistle': require('../../../assets/sounds/cues/whistle.wav'),
  'voices://buzzer': require('../../../assets/sounds/cues/buzzer.wav'),
  'voices://air_horn': require('../../../assets/sounds/cues/air-horn.wav'),
  'voices://countdown_321': CUE_ASSETS['voices://cue_tick'],
  'voices://countdown_go': CUE_ASSETS['voices://cue_tick'],
  'voices://countdown_start': CUE_ASSETS['voices://cue_tick'],
  'voices://success': CUE_ASSETS['voices://cue_chime'],
});

export const CUE_SOUND_OPTIONS = Object.freeze([
  { id: 'cue_tick', name: 'Beep', uri: 'voices://cue_tick', platform: 'voices', duration: 0.1 },
  { id: 'cue_gong', name: 'Gong', uri: 'voices://cue_gong', platform: 'voices', duration: 1.85 },
  {
    id: 'cue_boxing_bell',
    name: 'Boxing bell',
    uri: 'voices://cue_boxing_bell',
    platform: 'voices',
    duration: 1,
  },
  {
    id: 'cue_chime',
    name: 'Finish chime',
    uri: 'voices://cue_chime',
    platform: 'voices',
    duration: 0.65,
  },
]);
