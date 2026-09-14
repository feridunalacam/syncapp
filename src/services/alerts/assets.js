// Original synthesized effects; no third-party recordings or system TTS exports.
// Speech cues use the English coach recordings or the device's Turkish voice.
// The older voice_*.mp3 assets contain a beep, not speech.
export const CUE_ASSETS = Object.freeze({
  'voices://cue_tick': require('../../../assets/sounds/cues/tick.wav'),
  'voices://cue_gong': require('../../../assets/sounds/cues/gong.wav'),
  'voices://cue_boxing_bell': require('../../../assets/sounds/cues/boxing-bell.wav'),
  'voices://cue_chime': require('../../../assets/sounds/cues/finish-chime.wav'),
});

// Preserve sound IDs stored in older routines. Both audio players use this registry.
export const LEGACY_CUE_ASSETS = Object.freeze({
  'voices://beep_short': require('../../../assets/sounds/beep_short.mp3'),
  'voices://beep_long': require('../../../assets/sounds/beep_long.mp3'),
  'voices://tone_high': require('../../../assets/sounds/beep_short.mp3'),
  'voices://tone_low': require('../../../assets/sounds/beep_long.mp3'),
  'voices://bell': require('../../../assets/sounds/bell.mp3'),
  'voices://gong': require('../../../assets/sounds/gong.mp3'),
  'voices://boxing_bell': require('../../../assets/sounds/boxing_bell.mp3'),
  'voices://whistle': require('../../../assets/sounds/whistle.mp3'),
  'voices://buzzer': require('../../../assets/sounds/buzzer.mp3'),
  'voices://air_horn': require('../../../assets/sounds/air_horn.mp3'),
  'voices://countdown_321': require('../../../assets/sounds/countdown_321.mp3'),
  'voices://countdown_go': require('../../../assets/sounds/voice_go.mp3'),
  'voices://countdown_start': require('../../../assets/sounds/voice_ready.mp3'),
  'voices://success': require('../../../assets/sounds/chime.mp3'),
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
