// Original synthesized effects; no third-party recordings or system TTS exports.
// Speech cues are resolved at runtime by the alert player, separately from these
// files. In particular, the older voice_*.mp3 assets contain a beep, not speech.
export const CUE_ASSETS = Object.freeze({
  'voices://cue_tick': require('../../../assets/sounds/cues/tick.wav'),
  'voices://cue_gong': require('../../../assets/sounds/cues/gong.wav'),
  'voices://cue_boxing_bell': require('../../../assets/sounds/cues/boxing-bell.wav'),
  'voices://cue_chime': require('../../../assets/sounds/cues/finish-chime.wav'),
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
