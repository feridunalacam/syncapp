// Timed playback and monetization permissions have not been established for
// public release. Keep interval playback in explicitly enabled owner development.
export function appleMusicAvailable({ dev = false, profile, enabled } = {}) {
  return dev === true && profile === 'development' && enabled === 'true';
}

export const APPLE_MUSIC_TIMED_AVAILABLE = appleMusicAvailable({
  dev: typeof __DEV__ !== 'undefined' && __DEV__,
  profile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
  enabled: process.env.EXPO_PUBLIC_APPLE_MUSIC_ENABLED,
});

// Existing interval callers must continue to use the development-only capability.
export const APPLE_MUSIC_AVAILABLE = APPLE_MUSIC_TIMED_AVAILABLE;

export function appleMusicCompanionAvailable({ profile, enabled } = {}) {
  return ['development', 'preview', 'production'].includes(profile) && enabled === 'true';
}

export const APPLE_MUSIC_COMPANION_AVAILABLE = appleMusicCompanionAvailable({
  profile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
  enabled: process.env.EXPO_PUBLIC_APPLE_MUSIC_COMPANION_ENABLED,
});

export const APPLE_MUSIC_UNAVAILABLE_MESSAGE =
  'Apple Music playback stays in Apple Music in this version. Edit this routine to remove its Apple Music selection or replace it with Device audio.';
